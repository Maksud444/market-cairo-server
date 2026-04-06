const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'market-cairo-jwt-secret');
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Update lastSeen at most once per 5 minutes (fire-and-forget, no await)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!req.user.lastSeen || req.user.lastSeen < fiveMinutesAgo) {
      User.findByIdAndUpdate(req.user._id, { lastSeen: new Date() }, { timestamps: false })
        .exec()
        .catch(() => {});
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Optional authentication - attach user if token exists
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'market-cairo-jwt-secret');
    req.user = await User.findById(decoded.id);
    next();
  } catch (error) {
    next();
  }
};

// Admin only middleware
const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
};

// Super Admin only middleware
const superAdminOnly = (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
  }
  next();
};

// Verified users only middleware — disabled temporarily, passes through
const verifiedOnly = (req, res, next) => {
  // TODO: re-enable verification check when verification system is ready
  // if (req.user?.verification?.status !== 'approved') {
  //   return res.status(403).json({
  //     success: false,
  //     message: 'Identity verification required',
  //     requiresVerification: true
  //   });
  // }
  next();
};

module.exports = { protect, optionalAuth, adminOnly, verifiedOnly, superAdminOnly };
