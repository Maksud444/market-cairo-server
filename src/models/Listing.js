const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please provide a description'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Please provide a price'],
    min: [1, 'Price must be at least 1 EGP']
  },
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: ['Furniture', 'Electronics', 'Books', 'Kitchen', 'Clothing', 'Sports', 'Toys', 'Other']
  },
  condition: {
    type: String,
    required: [true, 'Please select condition'],
    enum: ['New', 'Like New', 'Good', 'Fair']
  },
  images: [{
    url: String,
    filename: String
  }],
  location: {
    area: {
      type: String,
      required: [true, 'Please provide location area'],
      enum: [
        'Maadi', 'New Cairo', 'Zamalek', 'Downtown', 'Heliopolis', 
        'Nasr City', 'Sheikh Zayed', '6th of October', 'Giza', 
        'Mohandessin', 'Dokki', 'Tagamoa', 'Rehab', 'Madinet Nasr',
        'El Mokattam', 'Ain Shams', 'Shubra', 'Other'
      ]
    },
    city: {
      type: String,
      default: 'Cairo'
    }
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'sold', 'pending', 'removed'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  favoritesCount: {
    type: Number,
    default: 0
  },
  reports: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    createdAt: { type: Date, default: Date.now }
  }],
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending' // Changed: New listings require admin approval
  },
  moderationNote: String,
  // Soft delete fields (2-day delay before permanent deletion)
  isDeleted: {
    type: Boolean,
    default: false,
    index: true // For efficient querying
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deleteReason: {
    type: String,
    enum: [
      'Item Sold',
      'No Longer Available',
      'Posted by Mistake',
      'Price Changed',
      'Found Better Buyer',
      'Item Damaged',
      'Other'
    ],
    default: null
  }
}, {
  timestamps: true
});

// Indexes for search and filtering
listingSchema.index({ title: 'text', description: 'text' });
listingSchema.index({ category: 1, status: 1 });
listingSchema.index({ 'location.area': 1 });
listingSchema.index({ price: 1 });
listingSchema.index({ condition: 1 });
listingSchema.index({ createdAt: -1 });
listingSchema.index({ views: -1 });
listingSchema.index({ seller: 1 });
listingSchema.index({ featured: -1, createdAt: -1 });

// Virtual for formatted price
listingSchema.virtual('formattedPrice').get(function() {
  return `EGP ${this.price.toLocaleString()}`;
});

// Update views
listingSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Get listing summary for cards
listingSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    title: this.title,
    price: this.price,
    category: this.category,
    condition: this.condition,
    image: this.images[0]?.url || '',
    location: this.location,
    views: this.views,
    featured: this.featured,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Listing', listingSchema);
