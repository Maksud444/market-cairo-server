const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Conversation, Message } = require('../models/Message');
const Listing = require('../models/Listing');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { filterPersonalInfo } = require('../utils/contentFilter');

// @route   GET /api/messages/conversations
// @desc    Get all conversations for current user
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true
    })
      .populate('participants', 'name avatar lastSeen')
      .populate('listing', 'title images price status')
      .sort({ updatedAt: -1 });

    // Calculate unread counts
    const conversationsWithUnread = conversations.map(conv => {
      const convObj = conv.toObject();
      convObj.unreadCount = conv.unreadCount.get(req.user._id.toString()) || 0;
      
      // Get the other participant
      convObj.otherParticipant = conv.participants.find(
        p => p._id.toString() !== req.user._id.toString()
      );
      
      return convObj;
    });

    res.json({
      success: true,
      conversations: conversationsWithUnread
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/messages/conversations/:id
// @desc    Get single conversation with messages
// @access  Private
router.get('/conversations/:id', protect, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'name avatar lastSeen')
      .populate('listing', 'title images price status seller');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Get messages
    const messages = await Message.find({ conversation: conversation._id })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: req.user._id },
        read: false
      },
      { read: true, readAt: new Date() }
    );

    // Reset unread count
    conversation.unreadCount.set(req.user._id.toString(), 0);
    await conversation.save();

    // Get other participant
    const otherParticipant = conversation.participants.find(
      p => p._id.toString() !== req.user._id.toString()
    );

    res.json({
      success: true,
      conversation: {
        ...conversation.toObject(),
        otherParticipant
      },
      messages
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/messages/conversations
// @desc    Start new conversation or get existing
// @access  Private
router.post('/conversations', protect, [
  body('listingId').notEmpty().withMessage('Listing ID is required'),
  body('sellerId').notEmpty().withMessage('Seller ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { listingId, sellerId } = req.body;

    // Can't message yourself
    if (sellerId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot message yourself'
      });
    }

    // Check if listing exists
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Check for existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, sellerId] },
      listing: listingId
    })
      .populate('participants', 'name avatar lastSeen')
      .populate('listing', 'title images price status');

    if (conversation) {
      return res.json({
        success: true,
        conversation,
        isNew: false
      });
    }

    // Create new conversation
    conversation = await Conversation.create({
      participants: [req.user._id, sellerId],
      listing: listingId,
      unreadCount: new Map()
    });

    await conversation.populate('participants', 'name avatar lastSeen');
    await conversation.populate('listing', 'title images price status');

    res.status(201).json({
      success: true,
      conversation,
      isNew: true
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/messages/:conversationId
// @desc    Send message
// @access  Private
router.post('/:conversationId', protect, [
  body('content').trim().notEmpty().withMessage('Message content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const { content, type = 'text' } = req.body;

    // Filter personal information
    const filterResult = filterPersonalInfo(content);

    // Create message with filtered content
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: filterResult.filtered,
      originalContent: filterResult.hasFiltered ? content : undefined,
      isFiltered: filterResult.hasFiltered,
      type
    });

    // Log if filtered
    if (filterResult.hasFiltered) {
      console.log(`[FILTER] Message filtered from user ${req.user._id} in conversation ${conversation._id}`);
    }

    await message.populate('sender', 'name avatar');

    // Update conversation
    conversation.lastMessage = {
      content,
      sender: req.user._id,
      createdAt: new Date()
    };

    // Increment unread count for other participant
    const otherParticipant = conversation.participants.find(
      p => p.toString() !== req.user._id.toString()
    );
    const currentUnread = conversation.unreadCount.get(otherParticipant.toString()) || 0;
    conversation.unreadCount.set(otherParticipant.toString(), currentUnread + 1);

    await conversation.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('newMessage', {
        conversation: conversation._id,
        message
      });
    }

    // Add notification for receiver
    await User.findByIdAndUpdate(otherParticipant, {
      $push: {
        notifications: {
          $each: [{
            type: 'message',
            title: 'New Message',
            content: `${req.user.name} sent you a message`,
            relatedId: conversation._id
          }],
          $slice: -50 // Keep only last 50 notifications
        }
      }
    });

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/messages/unread
// @desc    Get unread message count
// @access  Private
router.get('/unread/count', protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      totalUnread += conv.unreadCount.get(req.user._id.toString()) || 0;
    });

    res.json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/messages/conversations/:id
// @desc    Delete/archive conversation
// @access  Private
router.delete('/conversations/:id', protect, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Soft delete - just mark as inactive
    conversation.isActive = false;
    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/messages/:messageId/original
// @desc    Get original unfiltered message content (Admin only)
// @access  Private/Admin
router.get('/:messageId/original', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized - Admin access required'
      });
    }

    const message = await Message.findById(req.params.messageId)
      .select('+originalContent')
      .populate('sender', 'name email');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: {
        _id: message._id,
        content: message.content,
        originalContent: message.originalContent || message.content,
        isFiltered: message.isFiltered,
        sender: message.sender,
        createdAt: message.createdAt
      }
    });
  } catch (error) {
    console.error('Get original message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
