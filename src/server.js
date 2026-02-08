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

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Market Cairo API is running' });
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

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/market-cairo');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Start server
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

module.exports = { app, io };
