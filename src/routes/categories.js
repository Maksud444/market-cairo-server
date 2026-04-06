const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
const Category = require('../models/Category');

// Default categories used as fallback if DB is empty
const defaultCategories = [
  { name: 'Mobile & Tablets', icon: 'smartphone', slug: 'mobile-tablets', order: 0,
    subcategories: [
      { name: 'Mobile Phones', subcategories: [] },
      { name: 'Tablets', subcategories: [] },
      { name: 'Mobile & Tablet Accessories', subcategories: [] },
      { name: 'Smart Watches', subcategories: [] }
    ]
  },
  { name: 'Electronics', icon: 'monitor', slug: 'electronics', order: 1,
    subcategories: [
      { name: 'TV, Audio & Video', subcategories: [] },
      { name: 'Computers & Laptops', subcategories: [] },
      { name: 'Video Games', subcategories: [] },
      { name: 'Cameras', subcategories: [] }
    ]
  },
  { name: 'Fashion & Beauty', icon: 'shirt', slug: 'fashion-beauty', order: 2,
    subcategories: [
      { name: "Women's Clothing", subcategories: [] },
      { name: "Men's Clothing", subcategories: [] },
      { name: "Women's Accessories", subcategories: [] },
      { name: 'Cosmetics', subcategories: [] },
      { name: 'Personal Care', subcategories: [] },
      { name: "Men's Accessories", subcategories: [] }
    ]
  },
  { name: 'Furniture', icon: 'sofa', slug: 'furniture', order: 3, subcategories: [] },
  { name: 'Kitchen', icon: 'utensils', slug: 'kitchen', order: 4, subcategories: [] },
  { name: 'Books', icon: 'book', slug: 'books', order: 5, subcategories: [] },
  { name: 'Other', icon: 'box', slug: 'other', order: 6, subcategories: [] }
];

// Location areas in Cairo (Dubizzle-style with EN + AR)
const locations = [
  // East Greater Cairo
  { en: 'New Cairo', ar: 'القاهرة الجديدة' },
  { en: '5th Settlement', ar: 'التجمع الخامس' },
  { en: 'Madinaty', ar: 'مدينتي' },
  { en: 'Rehab City', ar: 'مدينة الرحاب' },
  { en: 'Shorouk City', ar: 'مدينة الشروق' },
  { en: 'Mostakbal City', ar: 'مدينة المستقبل' },
  { en: 'New Administrative Capital', ar: 'العاصمة الإدارية الجديدة' },
  { en: 'Obour City', ar: 'مدينة العبور' },
  { en: 'Badr City', ar: 'مدينة بدر' },
  // Central East
  { en: 'Nasr City', ar: 'مدينة نصر' },
  { en: 'Heliopolis', ar: 'مصر الجديدة' },
  { en: 'Nozha', ar: 'النزهة' },
  { en: 'New Nozha', ar: 'النزهة الجديدة' },
  { en: 'Sheraton', ar: 'شيراتون' },
  { en: 'Ain Shams', ar: 'عين شمس' },
  { en: 'Matareya', ar: 'المطرية' },
  { en: 'Gesr Al Suez', ar: 'جسر السويس' },
  { en: 'Salam City', ar: 'مدينة السلام' },
  { en: 'Hadayek el-Kobba', ar: 'حدائق القبة' },
  { en: 'Marg', ar: 'المرج' },
  // Central Cairo
  { en: 'Downtown', ar: 'وسط البلد' },
  { en: 'Garden City', ar: 'جاردن سيتي' },
  { en: 'Zamalek', ar: 'الزمالك' },
  { en: 'Shubra', ar: 'شبرا' },
  { en: 'Rod al-Farag', ar: 'روض الفرج' },
  { en: 'Abasiya', ar: 'العباسية' },
  { en: 'Old Cairo', ar: 'مصر القديمة' },
  // South Cairo
  { en: 'Maadi', ar: 'المعادي' },
  { en: 'Zahraa Al Maadi', ar: 'زهراء المعادي' },
  { en: 'Basateen', ar: 'البساتين' },
  { en: 'Helwan', ar: 'حلوان' },
  { en: 'Katameya', ar: 'الكاتمية' },
  { en: 'Mokattam', ar: 'المقطم' },
  { en: '15 May City', ar: 'مدينة 15 مايو' },
  // West / Giza
  { en: 'Giza', ar: 'الجيزة' },
  { en: 'Dokki', ar: 'الدقي' },
  { en: 'Mohandessin', ar: 'المهندسين' },
  { en: 'Agouza', ar: 'العجوزة' },
  { en: 'Haram', ar: 'الهرم' },
  { en: 'Faisal', ar: 'فيصل' },
  { en: 'Sheikh Zayed', ar: 'الشيخ زايد' },
  { en: '6th of October', ar: 'السادس من أكتوبر' },
  { en: 'Hadayek October', ar: 'حدائق أكتوبر' },
  { en: 'Other', ar: 'أخرى' },
];

// Conditions
const conditions = ['New', 'Like New', 'Good', 'Fair'];

async function getCategories(isDonation = false) {
  const filter = { isActive: true };
  if (isDonation) filter.isDonation = true;
  else filter.isDonation = { $ne: true };
  const dbCats = await Category.find(filter).sort({ order: 1, name: 1 });
  if (isDonation) return dbCats; // no default fallback for donation cats
  return dbCats.length > 0 ? dbCats : defaultCategories;
}

// @route   GET /api/categories
// @desc    Get all categories with listing counts
// @access  Public
router.get('/', async (req, res) => {
  try {
    const [cats, categoryCounts] = await Promise.all([
      getCategories(),
      Listing.aggregate([
        { $match: { status: 'active', moderationStatus: 'approved' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
    ]);

    const countsMap = categoryCounts.reduce((acc, cat) => {
      acc[cat._id] = cat.count;
      return acc;
    }, {});

    const categoriesWithCounts = cats.map(cat => ({
      _id: cat._id,
      name: cat.name,
      icon: cat.icon,
      slug: cat.slug,
      subcategories: cat.subcategories,
      count: countsMap[cat.name] || 0
    }));

    res.json({ success: true, categories: categoriesWithCounts });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/categories/donation
// @desc    Get active donation categories
// @access  Public
router.get('/donation', async (req, res) => {
  try {
    const cats = await getCategories(true);
    res.json({ success: true, categories: cats });
  } catch (error) {
    console.error('Get donation categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/categories/locations
// @access  Public
router.get('/locations', (req, res) => {
  res.json({ success: true, locations });
});

// @route   GET /api/categories/conditions
// @access  Public
router.get('/conditions', (req, res) => {
  res.json({ success: true, conditions });
});

// @route   GET /api/categories/filters
// @access  Public
router.get('/filters', async (req, res) => {
  try {
    const [cats, categoryCounts] = await Promise.all([
      getCategories(),
      Listing.aggregate([
        { $match: { status: 'active', moderationStatus: 'approved' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
    ]);

    const countsMap = categoryCounts.reduce((acc, cat) => {
      acc[cat._id] = cat.count;
      return acc;
    }, {});

    const categoriesWithCounts = cats.map(cat => ({
      _id: cat._id,
      name: cat.name,
      icon: cat.icon,
      slug: cat.slug,
      subcategories: cat.subcategories,
      count: countsMap[cat.name] || 0
    }));

    res.json({ success: true, categories: categoriesWithCounts, locations, conditions });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
