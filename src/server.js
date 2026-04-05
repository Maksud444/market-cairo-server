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

// Connect to MongoDB (cached for serverless)
let isConnected = false;
let lastDBError = null;

// Reset flag on disconnect so next request retries
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected — will retry on next request');
  isConnected = false;
});
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
  isConnected = true;
  lastDBError = null;
});

const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mysouqify', {
      serverSelectionTimeoutMS: 30000,
    });
    isConnected = true;
    lastDBError = null;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    isConnected = false;
    lastDBError = error.message;
  }
};

// Ensure DB connection before every request (for serverless)
app.use(async (req, res, next) => {
  await connectDB();
  if (!isConnected && req.path.startsWith('/api/') && req.path !== '/api/health') {
    return res.status(503).json({ success: false, message: 'Database not connected. Please try again.' });
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

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/verification', verificationRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'MySouqify API is running', docs: '/api/health' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MySouqify API is running',
    db: isConnected ? 'connected' : 'disconnected',
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

  socket.on('sendMessage', async (data) => {
    const { senderId, receiverId, content, listingId } = data;
    
    // Emit to receiver if online
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
  });

  socket.on('typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = connectedUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('userTyping', { senderId: socket.userId });
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
