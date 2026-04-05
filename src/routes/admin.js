const express = require('express');
const router = express.Router();
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Category = require('../models/Category');

// All routes require authentication and admin role
router.use(protect);
router.use(adminOnly);

// @route   GET /api/admin/dashboard/stats
// @desc    Get dashboard statistics
// @access  Admin
router.get('/dashboard/stats', async (req, res) => {
  try {
    const monthStart = new Date(new Date().setDate(1));

    // All 11 queries in parallel — was sequential before (9 round-trips → 1)
    const [
      totalUsers,
      activeUsers,
      adminUsers,
      newUsersThisMonth,
      totalListings,
      activeListings,
      soldListings,
      pendingListings,
      reportedListings,
      categoryCounts,
      recentUsers,
      recentListings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isAdmin: true }),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      Listing.countDocuments(),
      Listing.countDocuments({ status: 'active' }),
      Listing.countDocuments({ status: 'sold' }),
      Listing.countDocuments({ moderationStatus: 'pending' }),
      Listing.countDocuments({ 'reports.0': { $exists: true } }),
      Listing.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.find()
        .select('name email createdAt isAdmin isActive')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Listing.find()
        .populate('seller', 'name email')
        .select('title price category status createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          admins: adminUsers,
          newThisMonth: newUsersThisMonth
        },
        listings: {
          total: totalListings,
          active: activeListings,
          sold: soldListings,
          pending: pendingListings,
          reported: reportedListings
        },
        categories: categoryCounts,
        recentUsers,
        recentListings
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination and search
// @access  Admin
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = 'all',
      status = 'all'
    } = req.query;

    const query = {};

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (role === 'admin') {
      query.isAdmin = true;
    } else if (role === 'user') {
      query.isAdmin = false;
    }

    // Filter by status
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalUsers: count
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Toggle user admin role
// @access  Admin
router.put('/users/:id/role', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent removing own admin role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify your own admin role'
      });
    }

    user.isAdmin = !user.isAdmin;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isAdmin ? 'promoted to' : 'removed from'} admin`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role'
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Toggle user active status
// @access  Admin
router.put('/users/:id/status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deactivating own account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User account ${user.isActive ? 'activated' : 'deactivated'}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// @route   GET /api/admin/listings
// @desc    Get all listings with filters
// @access  Admin
router.get('/listings', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      category = 'all',
      status = 'all',
      moderation = 'all'
    } = req.query;

    const query = {};

    // Search by title or description
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by category
    if (category !== 'all') {
      query.category = category;
    }

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by moderation status
    if (moderation !== 'all') {
      query.moderationStatus = moderation;
    }

    const listings = await Listing.find(query)
      .populate('seller', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Listing.countDocuments(query);

    res.json({
      success: true,
      listings,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalListings: count
    });
  } catch (error) {
    console.error('Get listings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listings'
    });
  }
});

// @route   GET /api/admin/listings/deleted
// @desc    Get soft-deleted listings
// @access  Admin
router.get('/listings/deleted', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const deletedListings = await Listing.find({ isDeleted: true })
      .populate('seller', 'name email')
      .sort({ deletedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Listing.countDocuments({ isDeleted: true });

    res.json({
      success: true,
      listings: deletedListings,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Get deleted listings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/listings/:id/moderate
// @desc    Moderate listing (approve/reject)
// @access  Admin
router.put('/listings/:id/moderate', async (req, res) => {
  try {
    const { action, note } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use approve or reject'
      });
    }

    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    listing.moderationStatus = action === 'approve' ? 'approved' : 'rejected';
    listing.moderationNote = note || '';
    listing.moderatedBy = req.user?._id;
    listing.moderatedAt = new Date();

    // If rejected, set status to removed
    if (action === 'reject') {
      listing.status = 'removed';
    }

    await listing.save();

    // Send in-app notification to the seller
    try {
      const seller = await User.findById(listing.seller);
      if (seller) {
        seller.notifications.push({
          type: 'listing',
          title: action === 'approve' ? 'Listing Approved!' : 'Listing Rejected',
          content: action === 'approve'
            ? `Your listing "${listing.title}" has been approved and is now live!`
            : `Your listing "${listing.title}" was rejected. Reason: ${note || 'Policy violation'}`,
          read: false,
          relatedId: listing._id,
          createdAt: new Date()
        });
        await seller.save();

        // Send email notification
        const { sendListingApproved, sendListingRejected } = require('../utils/emailService');
        if (action === 'approve') {
          await sendListingApproved(seller.email, seller.name, listing.title);
        } else {
          await sendListingRejected(seller.email, seller.name, listing.title, note);
        }
      }
    } catch (notifError) {
      console.error('Failed to send listing moderation notification:', notifError);
    }

    res.json({
      success: true,
      message: `Listing ${action}d successfully`,
      listing
    });
  } catch (error) {
    console.error('Moderate listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to moderate listing'
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get reported listings
// @access  Admin
router.get('/reports', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const listings = await Listing.find({
      'reports.0': { $exists: true }
    })
    .populate('seller', 'name email')
    .sort({ 'reports.0.createdAt': -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const count = await Listing.countDocuments({
      'reports.0': { $exists: true }
    });

    res.json({
      success: true,
      reports: listings,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalReports: count
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

// @route   DELETE /api/admin/listings/:id
// @desc    Delete listing (admin only)
// @access  Admin
router.delete('/listings/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    await listing.deleteOne();

    res.json({
      success: true,
      message: 'Listing deleted successfully'
    });
  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete listing'
    });
  }
});

// @route   GET /api/admin/verifications
// @desc    Get users with verification submissions
// @access  Admin
router.get('/verifications', async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const query = {};
    if (status !== 'all') {
      query['verification.status'] = status;
    } else {
      // Show all except unverified (no submissions)
      query['verification.status'] = { $in: ['pending', 'approved', 'rejected'] };
    }

    const users = await User.find(query)
      .select('name email phone verification createdAt')
      .sort({ 'verification.submittedAt': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await User.countDocuments(query);
    const pendingCount = await User.countDocuments({ 'verification.status': 'pending' });

    res.json({
      success: true,
      verifications: users,
      pendingCount,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      total: count
    });
  } catch (error) {
    console.error('Get verifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch verifications' });
  }
});

// @route   PUT /api/admin/verifications/:userId/review
// @desc    Approve or reject a user's verification
// @access  Admin
router.put('/verifications/:userId/review', async (req, res) => {
  try {
    const { action, reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Use approve or reject' });
    }

    if (action === 'reject' && !reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.verification || user.verification.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending verification for this user' });
    }

    // Update verification status
    user.verification.status = action === 'approve' ? 'approved' : 'rejected';
    user.verification.reviewedAt = new Date();
    user.verification.reviewedBy = req.user._id;
    if (action === 'reject') {
      user.verification.rejectionReason = reason;
    }

    // Add in-app notification
    const notification = {
      type: 'system',
      title: action === 'approve' ? 'Identity Verified!' : 'Verification Rejected',
      content: action === 'approve'
        ? 'Your identity has been verified. You can now post listings!'
        : `Your verification was rejected: ${reason}. You can resubmit with new documents.`,
      read: false,
      createdAt: new Date()
    };
    user.notifications.push(notification);

    await user.save();

    // Send email notification
    try {
      const { sendVerificationApproved, sendVerificationRejected } = require('../utils/emailService');
      if (action === 'approve') {
        await sendVerificationApproved(user.email, user.name);
      } else {
        await sendVerificationRejected(user.email, user.name, reason);
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: `Verification ${action}d successfully`,
      verification: user.verification
    });
  } catch (error) {
    console.error('Review verification error:', error);
    res.status(500).json({ success: false, message: 'Failed to review verification' });
  }
});

// ─── Category Management ───────────────────────────────────────────────────

// @route   POST /api/admin/categories/seed
// @desc    Seed default categories (only if DB is empty)
// @access  Admin
router.post('/categories/seed', async (req, res) => {
  try {
    const count = await Category.countDocuments();
    if (count > 0) {
      return res.json({ success: true, message: 'Categories already seeded', count });
    }
    const defaults = [
      { name: 'Mobile & Tablets', icon: 'smartphone', slug: 'mobile-tablets', order: 0,
        subcategories: [
          { name: 'Mobile Phones', subcategories: [] }, { name: 'Tablets', subcategories: [] },
          { name: 'Mobile & Tablet Accessories', subcategories: [] }, { name: 'Smart Watches', subcategories: [] }
        ]
      },
      { name: 'Electronics', icon: 'monitor', slug: 'electronics', order: 1,
        subcategories: [
          { name: 'TV, Audio & Video', subcategories: [] }, { name: 'Computers & Laptops', subcategories: [] },
          { name: 'Video Games', subcategories: [] }, { name: 'Cameras', subcategories: [] }
        ]
      },
      { name: 'Fashion & Beauty', icon: 'shirt', slug: 'fashion-beauty', order: 2,
        subcategories: [
          { name: "Women's Clothing", subcategories: [] }, { name: "Men's Clothing", subcategories: [] },
          { name: "Women's Accessories", subcategories: [] }, { name: 'Cosmetics', subcategories: [] },
          { name: 'Personal Care', subcategories: [] }, { name: "Men's Accessories", subcategories: [] }
        ]
      },
      { name: 'Furniture', icon: 'sofa', slug: 'furniture', order: 3, subcategories: [] },
      { name: 'Kitchen', icon: 'utensils', slug: 'kitchen', order: 4, subcategories: [] },
      { name: 'Books', icon: 'book', slug: 'books', order: 5, subcategories: [] },
      { name: 'Other', icon: 'box', slug: 'other', order: 6, subcategories: [] }
    ];
    await Category.insertMany(defaults);
    res.json({ success: true, message: 'Categories seeded', count: defaults.length });
  } catch (error) {
    console.error('Seed categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/categories
// @desc    Get all categories (including inactive)
// @access  Admin
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/admin/categories
// @desc    Create a new category
// @access  Admin
router.post('/categories', async (req, res) => {
  try {
    const { name, icon, slug, subcategories, order } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }
    const existing = await Category.findOne({ $or: [{ name }, { slug }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category name or slug already exists' });
    }
    const category = await Category.create({ name, icon: icon || 'box', slug, subcategories: subcategories || [], order: order || 0 });
    res.status(201).json({ success: true, category });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/admin/categories/:id
// @desc    Update a category
// @access  Admin
router.put('/categories/:id', async (req, res) => {
  try {
    const { name, icon, slug, subcategories, order, isActive } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, icon, slug, subcategories, order, isActive },
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/admin/categories/:id
// @desc    Delete a category
// @access  Admin
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── One-time setup: make a user super admin ────────────────────────────────
// POST /api/admin/setup-super?secret=SETUP_SECRET  body: { email }
router.post('/setup-super', async (req, res) => {
  try {
    // If a super admin already exists, require SETUP_SECRET to prevent abuse
    const existingSuperAdmin = await User.findOne({ isSuperAdmin: true });
    if (existingSuperAdmin) {
      const secret = process.env.SETUP_SECRET;
      if (!secret || req.query.secret !== secret) {
        return res.status(403).json({ success: false, message: 'Forbidden: super admin already exists' });
      }
    }
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isAdmin = true;
    user.isSuperAdmin = true;
    await user.save();
    res.json({ success: true, message: `${user.name} is now Super Admin` });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Super Admin: Manage Admins ──────────────────────────────────────────────

// GET /api/admin/admins — list all admins
router.get('/admins', protect, adminOnly, superAdminOnly, async (req, res) => {
  try {
    const admins = await User.find({ isAdmin: true })
      .select('name email isAdmin isSuperAdmin isActive adminCreatedBy createdAt lastSeen')
      .populate('adminCreatedBy', 'name email');
    res.json({ success: true, admins });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/admin/admins — create new admin
router.post('/admins', protect, adminOnly, superAdminOnly, [
  require('express-validator').body('name').trim().notEmpty(),
  require('express-validator').body('email').isEmail().normalizeEmail(),
  require('express-validator').body('password').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) {
      if (exists.isAdmin) return res.status(400).json({ success: false, message: 'User is already an admin' });
      exists.isAdmin = true;
      exists.adminCreatedBy = req.user._id;
      await exists.save();
      return res.json({ success: true, message: 'Existing user promoted to admin', admin: exists });
    }
    const admin = await User.create({
      name, email, password,
      isAdmin: true,
      isSuperAdmin: false,
      adminCreatedBy: req.user._id,
      isActive: true,
      rating: { average: 0, count: 0 },
      salesCount: 0,
    });
    res.status(201).json({ success: true, message: 'Admin created', admin });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/admin/admins/:id — remove admin role
router.delete('/admins/:id', protect, adminOnly, superAdminOnly, async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'User not found' });
    if (admin.isSuperAdmin) return res.status(403).json({ success: false, message: 'Cannot remove super admin role' });
    if (admin._id.toString() === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot remove your own admin role' });
    admin.isAdmin = false;
    admin.adminCreatedBy = undefined;
    await admin.save();
    res.json({ success: true, message: 'Admin role removed' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/admins/:id/reset-password — reset admin password
router.put('/admins/:id/reset-password', protect, adminOnly, superAdminOnly, [
  require('express-validator').body('newPassword').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin || !admin.isAdmin) return res.status(404).json({ success: false, message: 'Admin not found' });
    admin.password = req.body.newPassword;
    await admin.save();
    res.json({ success: true, message: 'Admin password reset successfully' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/activity — admin moderation activity log
router.get('/activity', protect, adminOnly, superAdminOnly, async (req, res) => {
  try {
    const { adminId, page = 1, limit = 20 } = req.query;
    const query = { moderatedBy: { $exists: true, $ne: null } };
    if (adminId) query.moderatedBy = adminId;
    const listings = await Listing.find(query)
      .select('title moderationStatus moderationNote moderatedBy moderatedAt seller')
      .populate('moderatedBy', 'name email')
      .populate('seller', 'name email')
      .sort({ moderatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Listing.countDocuments(query);
    res.json({ success: true, listings, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
