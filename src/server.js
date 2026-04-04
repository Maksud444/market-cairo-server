const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// One-time seed listings
app.get('/api/seed-listings-xk9q2', async (req, res) => {
  try {
    const Listing = require('./models/Listing');
    const User = require('./models/User');
    const admin = await User.findOne({ isAdmin: true });
    if (!admin) return res.status(400).json({ success: false, message: 'No admin found' });
    const count = await Listing.countDocuments();
    if (count > 0) return res.json({ success: true, message: `Already has ${count} listings` });
    const imgs = [
      { url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&h=400&fit=crop', publicId: '' },
    ];
    const listings = [
      { title: 'MacBook Pro 2022 - M1 Pro', description: 'Apple MacBook Pro in perfect condition. M1 Pro chip, 16GB RAM, 512GB SSD. Includes charger.', price: 32000, category: 'Electronics', condition: 'Like New', location: { area: 'New Cairo', city: 'Cairo' }, featured: true },
      { title: 'iPhone 14 Pro - 256GB', description: 'iPhone 14 Pro 256GB Space Black. Perfect condition, battery 100%. Original box included.', price: 24000, category: 'Mobile & Tablets', condition: 'Like New', location: { area: 'Maadi', city: 'Cairo' }, featured: true },
      { title: 'Modern L-Shaped Sofa', description: 'Beautiful L-shaped sofa in excellent condition. 280x200cm. Smoke-free home.', price: 8500, category: 'Furniture', condition: 'Good', location: { area: 'Zamalek', city: 'Cairo' }, featured: true },
      { title: 'Samsung Galaxy S23 Ultra', description: 'Samsung S23 Ultra 256GB Phantom Black. Excellent condition with original accessories.', price: 18000, category: 'Mobile & Tablets', condition: 'Like New', location: { area: 'Heliopolis', city: 'Cairo' }, featured: false },
      { title: 'Gaming PC - RTX 4070', description: 'Custom gaming PC, RTX 4070, i7-13700K, 32GB DDR5 RAM, 1TB NVMe SSD.', price: 45000, category: 'Electronics', condition: 'Like New', location: { area: 'Sheikh Zayed', city: 'Cairo' }, featured: false },
      { title: 'KitchenAid Stand Mixer', description: 'KitchenAid Artisan Stand Mixer in Empire Red. 5-quart, all attachments included.', price: 4500, category: 'Kitchen', condition: 'Like New', location: { area: 'Mohandessin', city: 'Cairo' }, featured: false },
      { title: 'Dining Table Set - 6 Chairs', description: 'Solid wood dining table with 6 chairs. 180x90cm. Minor wear.', price: 6500, category: 'Furniture', condition: 'Good', location: { area: 'Giza', city: 'Cairo' }, featured: false },
      { title: 'Classic Literature Book Collection', description: '25 classic books - Dostoevsky, Tolstoy, Austen. All in excellent condition.', price: 750, category: 'Books', condition: 'Good', location: { area: 'Downtown', city: 'Cairo' }, featured: false },
    ];
    for (const l of listings) {
      await Listing.create({ ...l, seller: admin._id, images: imgs, moderationStatus: 'approved', status: 'active' });
    }
    res.json({ success: true, message: `Created ${listings.length} listings` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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
