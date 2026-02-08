const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Listing = require('../models/Listing');
const User = require('../models/User');
const { protect, optionalAuth, verifiedOnly } = require('../middleware/auth');
const { upload, handleUploadErrors, compressImages } = require('../middleware/upload');

// @route   GET /api/listings
// @desc    Get all listings with filters, search, and pagination
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category,
      condition,
      minPrice,
      maxPrice,
      location,
      search,
      sort = 'recent',
      page = 1,
      limit = 20,
      featured,
      seller
    } = req.query;

    // Build query - include soft-deleted items within 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const queryObj = {
      moderationStatus: 'approved',
      $or: [
        { status: 'active', isDeleted: { $ne: true } }, // Active & not deleted
        { isDeleted: true, deletedAt: { $gt: twoDaysAgo } } // Soft-deleted within 2 days (status may be 'sold')
      ]
    };

    if (category) queryObj.category = category;
    if (condition) queryObj.condition = condition;
    if (location) queryObj['location.area'] = location;
    if (seller) queryObj.seller = seller;
    if (featured === 'true') queryObj.featured = true;

    // Price filter
    if (minPrice || maxPrice) {
      queryObj.price = {};
      if (minPrice) queryObj.price.$gte = Number(minPrice);
      if (maxPrice) queryObj.price.$lte = Number(maxPrice);
    }

    // Text search
    if (search) {
      queryObj.$text = { $search: search };
    }

    // Sort options
    let sortOption = {};
    switch (sort) {
      case 'price_low':
        sortOption = { price: 1 };
        break;
      case 'price_high':
        sortOption = { price: -1 };
        break;
      case 'popular':
        sortOption = { views: -1 };
        break;
      case 'recent':
      default:
        sortOption = { createdAt: -1 };
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Execute query
    const listings = await Listing.find(queryObj)
      .populate('seller', 'name avatar rating')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    // Get total count
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
    console.error('Get listings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/listings/featured
// @desc    Get featured listings
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const listings = await Listing.find({
      moderationStatus: 'approved',
      featured: true,
      $or: [
        { status: 'active', isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: { $gt: twoDaysAgo } }
      ]
    })
      .populate('seller', 'name avatar rating')
      .sort({ createdAt: -1 })
      .limit(8);

    res.json({
      success: true,
      listings
    });
  } catch (error) {
    console.error('Get featured error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/listings/recent
// @desc    Get recent listings
// @access  Public
router.get('/recent', async (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const listings = await Listing.find({
      moderationStatus: 'approved',
      $or: [
        { status: 'active', isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: { $gt: twoDaysAgo } }
      ]
    })
      .populate('seller', 'name avatar rating')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      listings
    });
  } catch (error) {
    console.error('Get recent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/listings/stats
// @desc    Get marketplace statistics
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    const activeListings = await Listing.countDocuments({ status: 'active' });
    const totalMembers = await User.countDocuments({ isActive: true });
    const soldListings = await Listing.countDocuments({ status: 'sold' });

    // Category counts
    const categoryCounts = await Listing.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      stats: {
        activeListings,
        totalMembers,
        soldListings,
        safeDeals: '100%',
        categoryCounts: categoryCounts.reduce((acc, cat) => {
          acc[cat._id] = cat.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/listings/:id
// @desc    Get single listing
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'name avatar rating salesCount phone createdAt');

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Check if listing is soft-deleted
    if (listing.isDeleted) {
      // Allow everyone to view soft-deleted listings for 2 days
      const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
      const timeSinceDeletion = Date.now() - listing.deletedAt.getTime();

      if (timeSinceDeletion > twoDaysInMs) {
        // 2 days passed - should be hard-deleted (cleanup job missed it)
        return res.status(404).json({
          success: false,
          message: 'Listing no longer available'
        });
      }

      // Within 2 days - show as sold with delete reason
      return res.json({
        success: true,
        listing: {
          ...listing.toObject(),
          status: 'sold', // Display as sold
          deleteInfo: {
            isDeleted: true,
            reason: listing.deleteReason,
            deletedAt: listing.deletedAt
          }
        },
        isFavorited: false
      });
    }

    // Check moderation status for non-deleted listings
    if (listing.moderationStatus !== 'approved') {
      // Only owner and admin can view pending/rejected listings
      if (!req.user || (req.user._id.toString() !== listing.seller._id.toString() && !req.user.isAdmin)) {
        return res.status(403).json({
          success: false,
          message: 'This listing is pending approval'
        });
      }
    }

    // Increment views (don't count seller's own views)
    if (!req.user || req.user._id.toString() !== listing.seller._id.toString()) {
      listing.views += 1;
      await listing.save();
    }

    // Check if favorited by current user
    let isFavorited = false;
    if (req.user) {
      isFavorited = req.user.favorites.includes(listing._id);
    }

    res.json({
      success: true,
      listing,
      isFavorited
    });
  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/listings/:id/similar
// @desc    Get similar listings
// @access  Public
router.get('/:id/similar', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const similarListings = await Listing.find({
      _id: { $ne: listing._id },
      category: listing.category,
      moderationStatus: 'approved',
      $or: [
        { status: 'active', isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: { $gt: twoDaysAgo } }
      ]
    })
      .populate('seller', 'name avatar rating')
      .sort({ createdAt: -1 })
      .limit(4);

    res.json({
      success: true,
      listings: similarListings
    });
  } catch (error) {
    console.error('Get similar error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/listings
// @desc    Create new listing
// @access  Private
router.post('/', protect, verifiedOnly, upload.array('images', 10), compressImages, handleUploadErrors, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isNumeric().withMessage('Valid price is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('condition').notEmpty().withMessage('Condition is required'),
  body('location').notEmpty().withMessage('Location is required')
], async (req, res) => {
  try {
    // Log incoming request for debugging
    console.log('[CREATE LISTING] Request body:', req.body);
    console.log('[CREATE LISTING] Files:', req.files?.length || 0);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[CREATE LISTING] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, price, category, condition, location } = req.body;

    // Process uploaded images
    const images = req.files ? req.files.map(file => ({
      url: `/uploads/${file.filename}`,
      filename: file.filename
    })) : [];

    const listing = await Listing.create({
      title,
      description,
      price: Number(price),
      category,
      condition,
      location: typeof location === 'string' ? JSON.parse(location) : location,
      images,
      seller: req.user._id
    });

    await listing.populate('seller', 'name avatar rating');

    res.status(201).json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('[CREATE LISTING] Error:', error);

    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/listings/:id
// @desc    Update listing
// @access  Private (owner only)
router.put('/:id', protect, upload.array('images', 10), compressImages, handleUploadErrors, async (req, res) => {
  try {
    let listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this listing'
      });
    }

    const { title, description, price, category, condition, location, status } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (price) updateData.price = Number(price);
    if (category) updateData.category = category;
    if (condition) updateData.condition = condition;
    if (location) updateData.location = typeof location === 'string' ? JSON.parse(location) : location;
    if (status) updateData.status = status;

    // Add new images if uploaded
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        url: `/uploads/${file.filename}`,
        filename: file.filename
      }));
      updateData.images = [...(listing.images || []), ...newImages];
    }

    listing = await Listing.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('seller', 'name avatar rating');

    res.json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/listings/:id
// @desc    Soft delete listing (shows as sold for 2 days)
// @access  Private (owner only)
router.delete('/:id', protect, [
  body('reason').notEmpty().withMessage('Please select a reason for deletion')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Check ownership (admin bypass removed - only owner can soft delete)
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this listing'
      });
    }

    // Soft delete: mark as deleted, set timestamp and reason
    listing.isDeleted = true;
    listing.deletedAt = new Date();
    listing.deleteReason = req.body.reason;
    listing.status = 'sold'; // Display as sold in UI

    await listing.save();

    res.json({
      success: true,
      message: 'Listing will be removed in 2 days',
      listing
    });
  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/listings/:id/favorite
// @desc    Toggle favorite listing
// @access  Private
router.post('/:id/favorite', protect, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    const user = req.user;
    const favoriteIndex = user.favorites.indexOf(listing._id);

    if (favoriteIndex > -1) {
      // Remove from favorites
      user.favorites.splice(favoriteIndex, 1);
      listing.favoritesCount = Math.max(0, listing.favoritesCount - 1);
    } else {
      // Add to favorites
      user.favorites.push(listing._id);
      listing.favoritesCount += 1;
    }

    await user.save();
    await listing.save();

    res.json({
      success: true,
      isFavorited: favoriteIndex === -1,
      favoritesCount: listing.favoritesCount
    });
  } catch (error) {
    console.error('Favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/listings/:id/report
// @desc    Report a listing
// @access  Private
router.post('/:id/report', protect, [
  body('reason').trim().notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Check if already reported by this user
    const alreadyReported = listing.reports.some(
      report => report.user.toString() === req.user._id.toString()
    );

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this listing'
      });
    }

    listing.reports.push({
      user: req.user._id,
      reason: req.body.reason
    });

    // Auto-flag if multiple reports
    if (listing.reports.length >= 3) {
      listing.moderationStatus = 'pending';
    }

    await listing.save();

    res.json({
      success: true,
      message: 'Listing reported successfully'
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/listings/:id/sold
// @desc    Mark listing as sold
// @access  Private (owner only)
router.put('/:id/sold', protect, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    listing.status = 'sold';
    await listing.save();

    // Increment seller's sales count
    await User.findByIdAndUpdate(req.user._id, { $inc: { salesCount: 1 } });

    res.json({
      success: true,
      message: 'Listing marked as sold'
    });
  } catch (error) {
    console.error('Mark sold error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
