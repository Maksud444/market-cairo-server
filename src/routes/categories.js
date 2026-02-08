const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');

// Category definitions with icons
const categories = [
  { name: 'Furniture', icon: 'sofa', slug: 'furniture' },
  { name: 'Electronics', icon: 'laptop', slug: 'electronics' },
  { name: 'Books', icon: 'book', slug: 'books' },
  { name: 'Kitchen', icon: 'utensils', slug: 'kitchen' },
  { name: 'Clothing', icon: 'shirt', slug: 'clothing' },
  { name: 'Sports', icon: 'dumbbell', slug: 'sports' },
  { name: 'Toys', icon: 'gamepad', slug: 'toys' },
  { name: 'Other', icon: 'box', slug: 'other' }
];

// Location areas in Cairo
const locations = [
  'Maadi',
  'New Cairo',
  'Zamalek',
  'Downtown',
  'Heliopolis',
  'Nasr City',
  'Sheikh Zayed',
  '6th of October',
  'Giza',
  'Mohandessin',
  'Dokki',
  'Tagamoa',
  'Rehab',
  'Madinet Nasr',
  'El Mokattam',
  'Ain Shams',
  'Shubra',
  'Other'
];

// Conditions
const conditions = ['New', 'Like New', 'Good', 'Fair'];

// @route   GET /api/categories
// @desc    Get all categories with listing counts
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Get counts for each category
    const categoryCounts = await Listing.aggregate([
      { $match: { status: 'active', moderationStatus: 'approved' } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const countsMap = categoryCounts.reduce((acc, cat) => {
      acc[cat._id] = cat.count;
      return acc;
    }, {});

    const categoriesWithCounts = categories.map(cat => ({
      ...cat,
      count: countsMap[cat.name] || 0
    }));

    res.json({
      success: true,
      categories: categoriesWithCounts
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/categories/locations
// @desc    Get all location areas
// @access  Public
router.get('/locations', (req, res) => {
  res.json({
    success: true,
    locations
  });
});

// @route   GET /api/categories/conditions
// @desc    Get all condition options
// @access  Public
router.get('/conditions', (req, res) => {
  res.json({
    success: true,
    conditions
  });
});

// @route   GET /api/categories/filters
// @desc    Get all filter options
// @access  Public
router.get('/filters', async (req, res) => {
  try {
    // Get counts for each category
    const categoryCounts = await Listing.aggregate([
      { $match: { status: 'active', moderationStatus: 'approved' } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const countsMap = categoryCounts.reduce((acc, cat) => {
      acc[cat._id] = cat.count;
      return acc;
    }, {});

    const categoriesWithCounts = categories.map(cat => ({
      ...cat,
      count: countsMap[cat.name] || 0
    }));

    res.json({
      success: true,
      categories: categoriesWithCounts,
      locations,
      conditions
    });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
