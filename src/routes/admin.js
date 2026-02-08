const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Listing = require('../models/Listing');

// All routes require authentication and admin role
router.use(protect);
router.use(adminOnly);

// @route   GET /api/admin/dashboard/stats
// @desc    Get dashboard statistics
// @access  Admin
router.get('/dashboard/stats', async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const adminUsers = await User.countDocuments({ isAdmin: true });
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().setDate(1)) }
    });

    // Get listing statistics
    const totalListings = await Listing.countDocuments();
    const activeListings = await Listing.countDocuments({ status: 'active' });
    const soldListings = await Listing.countDocuments({ status: 'sold' });
    const pendingListings = await Listing.countDocuments({
      moderationStatus: 'pending'
    });
    const reportedListings = await Listing.countDocuments({
      'reports.0': { $exists: true }
    });

    // Get category breakdown
    const categoryCounts = await Listing.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get recent users (last 10)
    const recentUsers = await User.find()
      .select('name email createdAt isAdmin isActive')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get recent listings (last 10)
    const recentListings = await Listing.find()
      .populate('seller', 'name email')
      .select('title price category status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

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

module.exports = router;
