const mongoose = require('mongoose');

const subSubcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }
}, { _id: true });

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subcategories: [subSubcategorySchema]
}, { _id: true });

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true
  },
  icon: {
    type: String,
    default: 'box'
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  subcategories: [subcategorySchema],
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDonation: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
