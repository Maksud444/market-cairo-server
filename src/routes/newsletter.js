const express = require('express');
const router = express.Router();
const { addSubscriber } = require('../services/brevo');

// @route   POST /api/newsletter/subscribe
// @desc    Subscribe to newsletter
// @access  Public
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }
  const ok = await addSubscriber(email);
  if (ok) {
    res.json({ success: true, message: 'Subscribed successfully!' });
  } else {
    res.status(500).json({ success: false, message: 'Failed to subscribe. Please try again.' });
  }
});

module.exports = router;
