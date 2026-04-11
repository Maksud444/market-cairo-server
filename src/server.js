const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const { apiLimiter } = require('./middleware/rateLimiter');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://mysouqify.com',
  'https://www.mysouqify.com',
  process.env.FRONTEND_URL,
  // Support comma-separated list of additional origins
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',').map(o => o.trim()) : [])
].filter(Boolean);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images to load cross-origin
}));

// Gzip compression (reduces response size ~70%)
app.use(compression());

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Global rate limiter — 200 requests per 15 min per IP
app.use('/api/', apiLimiter);

// MongoDB connection — optimized for serverless (Vercel)
// Uses mongoose.connection.readyState to check real connection state
// instead of a custom boolean that can get out of sync
let connectingPromise = null;
let lastDBError = null;

const connectDB = async () => {
  // 1 = connected, 2 = connecting
  const state = mongoose.connection.readyState;
  if (state === 1) return; // already connected
  if (state === 2 && connectingPromise) return connectingPromise; // already connecting

  connectingPromise = mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/mysouqify',
    {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      // Keep connections alive — prevents Atlas from dropping idle connections
      heartbeatFrequencyMS: 10000,
      keepAlive: true,
      keepAliveInitialDelay: 300000,
    }
  ).then(() => {
    lastDBError = null;
    connectingPromise = null;
    console.log('MongoDB connected');
  }).catch((error) => {
    lastDBError = error.message;
    connectingPromise = null;
    console.error('MongoDB connection error:', error.message);
    // Don't throw — let the request middleware handle it
  });

  return connectingPromise;
};

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected — attempting reconnect...');
  connectingPromise = null;
  // Auto-reconnect after 3 seconds
  setTimeout(() => connectDB(), 3000);
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
  connectingPromise = null;
});

// Ensure DB connection before every API request
app.use(async (req, res, next) => {
  if (req.path === '/api/health' || req.path === '/') return next();
  try {
    await connectDB();
  } catch (e) {
    // connectDB never throws but just in case
  }
  if (mongoose.connection.readyState !== 1 && req.path.startsWith('/api/')) {
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable. Please try again in a moment.',
      retryAfter: 3,
    });
  }
  next();
});

// Import routes
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const categoryRoutes = require('./routes/categories');
const adminRoutes = require('./routes/admin');
const verificationRoutes = require('./routes/verification');
const newsletterRoutes = require('./routes/newsletter');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/newsletter', newsletterRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'MySouqify API is running', docs: '/api/health' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MySouqify API is running',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    dbError: lastDBError || null
  });
});

// Socket.io connection handling
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('[SOCKET] User connected:', socket.id);

  socket.on('join', (userId) => {
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`[SOCKET] User ${userId} joined | Total connections: ${connectedUsers.size}`);

    // Broadcast user online status to all clients
    io.emit('userOnline', { userId });
  });

  socket.on('sendMessage', (data) => {
    try {
      const { senderId, receiverId, content, listingId } = data;
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('newMessage', {
          senderId,
          receiverId,
          content,
          listingId,
          createdAt: new Date()
        });
      }
    } catch (err) {
      console.error('[SOCKET] sendMessage error:', err.message);
    }
  });

  socket.on('typing', (data) => {
    try {
      const { receiverId } = data;
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('userTyping', { senderId: socket.userId });
      }
    } catch (err) {
      console.error('[SOCKET] typing error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const userId = socket.userId;
      connectedUsers.delete(userId);

      // Broadcast user offline status to all clients
      io.emit('userOffline', { userId });

      console.log(`[SOCKET] User ${userId} disconnected | Total connections: ${connectedUsers.size}`);
    } else {
      console.log('[SOCKET] User disconnected:', socket.id);
    }
  });
});

// Make io accessible to routes
app.set('io', io);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Express error handler (must have 4 params) ────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ── Process-level crash guards ────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  // Don't crash — log and continue
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message);
  // Give the server a moment to log, then exit so the process manager restarts it
  process.exit(1);
});

// Only start server in local dev (not on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;

  const startServer = async () => {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Initialize cleanup job after DB connection
    const Listing = require('./models/Listing');

    const cleanupDeletedListings = async () => {
      try {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        const result = await Listing.deleteMany({
          isDeleted: true,
          deletedAt: { $lte: twoDaysAgo }
        });

        if (result.deletedCount > 0) {
          console.log(`[CLEANUP] Permanently deleted ${result.deletedCount} expired listings`);
        }
      } catch (error) {
        console.error('[CLEANUP] Error deleting expired listings:', error);
      }
    };

    // Run cleanup every hour
    setInterval(cleanupDeletedListings, 60 * 60 * 1000);

    // Run immediately on startup
    cleanupDeletedListings();
  };

  startServer();
}

module.exports = { app, io };
