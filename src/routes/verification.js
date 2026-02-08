const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload, handleUploadErrors, compressImages, convertToDataUrl } = require('../middleware/upload');
const User = require('../models/User');

// @route   GET /api/verification/status
// @desc    Get current user's verification status
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('verification');

    res.json({
      success: true,
      verification: user.verification || { status: 'unverified' }
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/verification/submit
// @desc    Submit identity verification documents
// @access  Private
router.post('/submit', protect, upload.array('documents', 2), compressImages, convertToDataUrl, handleUploadErrors, async (req, res) => {
  try {
    const { documentType } = req.body;

    if (!['passport', 'student_card', 'residential_card'].includes(documentType)) {
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload document images' });
    }

    // Passport = exactly 1 image, student_card/residential_card = exactly 2 (front + back)
    const requiredCount = documentType === 'passport' ? 1 : 2;
    if (req.files.length !== requiredCount) {
      const msg = documentType === 'passport'
        ? 'Passport requires exactly 1 image'
        : `${documentType.replace('_', ' ')} requires 2 images (front and back)`;
      return res.status(400).json({ success: false, message: msg });
    }

    const user = await User.findById(req.user._id);

    // Don't allow re-submission if already approved
    if (user.verification?.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Already verified' });
    }

    // Don't allow re-submission if pending
    if (user.verification?.status === 'pending') {
      return res.status(400).json({ success: false, message: 'Verification already pending review' });
    }

    const documentImages = req.files.map(file => ({
      url: file.dataUrl || `/uploads/${file.filename}`,
      filename: file.filename
    }));

    user.verification = {
      status: 'pending',
      documentType,
      documentImages,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null
    };

    await user.save();

    res.json({
      success: true,
      message: 'Verification submitted successfully. Admin will review soon.',
      verification: user.verification
    });
  } catch (error) {
    console.error('Submit verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
