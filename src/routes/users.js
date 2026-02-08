const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Listing = require('../models/Listing');
const { protect, adminOnly } = require('../middleware/auth');

// Protected /me routes MUST come before /:id routes to avoid conflicts

// @route   GET /api/users/me/listings
// @desc    Get current user's listings
// @access  Private
router.get('/me/listings', protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const queryObj = { seller: req.user._id };
    if (status) queryObj.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const listings = await Listing.find(queryObj)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(queryObj);

    // Get counts for tabs
    const activeCount = await Listing.countDocuments({ seller: req.user._id, status: 'active' });
    const soldCount = await Listing.countDocuments({ seller: req.user._id, status: 'sold' });

    res.json({
      success: true,
      listings,
      counts: {
        active: activeCount,
        sold: soldCount,
        favorites: req.user.favorites.length
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get my listings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/me/favorites
// @desc    Get current user's favorites
// @access  Private
router.get('/me/favorites', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      populate: { path: 'seller', select: 'name avatar rating' }
    });

    res.json({
      success: true,
      favorites: user.favorites
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user public profile
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's active listings
    const listings = await Listing.find({
      seller: user._id,
      status: 'active',
      moderationStatus: 'approved'
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      user: user.getPublicProfile(),
      listings
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/:id/listings
// @desc    Get user's listings
// @access  Public
router.get('/:id/listings', async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 20 } = req.query;

    const queryObj = { seller: req.params.id };
    
    if (status === 'active') {
      queryObj.status = 'active';
      queryObj.moderationStatus = 'approved';
    } else if (status === 'sold') {
      queryObj.status = 'sold';
    }

    const skip = (Number(page) - 1) * Number(limit);

    const listings = await Listing.find(queryObj)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(queryObj);

    res.json({
      success: true,
      listings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get user listings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/:id/rate
// @desc    Rate a user
// @access  Private
router.put('/:id/rate', protect, async (req, res) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Can't rate yourself
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot rate yourself'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate new average rating
    const newCount = user.rating.count + 1;
    const newAverage = ((user.rating.average * user.rating.count) + rating) / newCount;

    user.rating = {
      average: Math.round(newAverage * 10) / 10,
      count: newCount
    };

    await user.save();

    res.json({
      success: true,
      rating: user.rating
    });
  } catch (error) {
    console.error('Rate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Admin routes

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    const queryObj = {};
    if (search) {
      queryObj.$text = { $search: search };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const users = await User.find(queryObj)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await User.countDocuments(queryObj);

    res.json({
      success: true,
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Toggle user active status (admin only)
// @access  Private/Admin
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
