const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/market-cairo');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  location: String,
  avatar: String,
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  salesCount: { type: Number, default: 0 },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
  isAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Listing Schema
const listingSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  category: String,
  condition: String,
  images: [{
    url: String,
    publicId: String
  }],
  location: {
    area: String,
    city: { type: String, default: 'Cairo' }
  },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'sold', 'inactive'], default: 'active' },
  moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Listing = mongoose.model('Listing', listingSchema);

// Sample Images (placeholder URLs)
const sampleImages = {
  furniture: [
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&h=400&fit=crop',
  ],
  electronics: [
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&h=400&fit=crop',
  ],
  books: [
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&h=400&fit=crop',
  ],
  kitchen: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop',
  ],
  clothing: [
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&h=400&fit=crop',
  ],
  sports: [
    'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1461896836934- voices-of-men-who-have-been-to-another-country?w=600&h=400&fit=crop',
  ],
  toys: [
    'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&h=400&fit=crop',
  ],
};

// Sample Users
const sampleUsers = [
  {
    name: 'Mohamed Ahmed',
    email: 'mohamed.ahmed@example.com',
    password: 'password123',
    phone: '01012345678',
    location: 'Maadi, Cairo',
    rating: { average: 4.8, count: 23 },
    salesCount: 18
  },
  {
    name: 'Sara Mohamed',
    email: 'sara.mohamed@example.com',
    password: 'password123',
    phone: '01123456789',
    location: 'New Cairo',
    rating: { average: 5.0, count: 12 },
    salesCount: 12
  },
  {
    name: 'Ahmed Hassan',
    email: 'ahmed.hassan@example.com',
    password: 'password123',
    phone: '01234567890',
    location: 'Heliopolis, Cairo',
    rating: { average: 4.6, count: 31 },
    salesCount: 24
  },
  {
    name: 'Fatma Ali',
    email: 'fatma.ali@example.com',
    password: 'password123',
    phone: '01098765432',
    location: 'Zamalek, Cairo',
    rating: { average: 4.9, count: 15 },
    salesCount: 15
  }
];

// Sample Listings
const sampleListings = [
  {
    title: 'Modern L-Shaped Sofa - Excellent Condition',
    description: 'Beautiful modern L-shaped sofa in excellent condition. Comfortable and stylish, perfect for your living room. Smoke-free home. Dimensions: 280cm x 200cm.',
    price: 8500,
    category: 'Furniture',
    condition: 'Like New',
    location: { area: 'Maadi', city: 'Cairo' },
    featured: true,
    views: 156
  },
  {
    title: 'MacBook Pro 2022 - 16GB RAM, 512GB SSD',
    description: 'Apple MacBook Pro 2022 in perfect working condition. M1 Pro chip, 16GB RAM, 512GB SSD. Includes original charger and box. Battery health at 95%.',
    price: 32000,
    category: 'Electronics',
    condition: 'Like New',
    location: { area: 'New Cairo', city: 'Cairo' },
    featured: true,
    views: 243
  },
  {
    title: 'Mountain Bike - 21 Speed',
    description: 'Great mountain bike, 21 speed, aluminum frame. Perfect for city riding and light trails. Recently serviced with new brakes.',
    price: 3500,
    category: 'Sports',
    condition: 'Good',
    location: { area: 'Nasr City', city: 'Cairo' },
    featured: true,
    views: 201
  },
  {
    title: 'iPhone 14 Pro - 256GB - Space Black',
    description: 'iPhone 14 Pro 256GB in Space Black. Perfect condition with original box and accessories. Battery health at 100%. No scratches.',
    price: 24000,
    category: 'Electronics',
    condition: 'Like New',
    location: { area: 'Sheikh Zayed', city: 'Cairo' },
    featured: true,
    views: 287
  },
  {
    title: 'Collection of Classic Literature Books (25 books)',
    description: 'Collection of 25 classic literature books including works by Dostoevsky, Tolstoy, Austen, and more. All in excellent condition.',
    price: 750,
    category: 'Books',
    condition: 'Good',
    location: { area: 'Zamalek', city: 'Cairo' },
    featured: false,
    views: 89
  },
  {
    title: 'Kitchen Aid Stand Mixer - Red',
    description: 'KitchenAid Artisan Stand Mixer in Empire Red. 5-quart capacity. Includes all original attachments. Works perfectly.',
    price: 4500,
    category: 'Kitchen',
    condition: 'Like New',
    location: { area: 'Heliopolis', city: 'Cairo' },
    featured: false,
    views: 178
  },
  {
    title: 'Designer Winter Jacket - Size L',
    description: 'High-quality designer winter jacket, size L. Only worn a few times. Water-resistant and very warm.',
    price: 1200,
    category: 'Clothing',
    condition: 'Like New',
    location: { area: 'Mohandessin', city: 'Cairo' },
    featured: false,
    views: 132
  },
  {
    title: 'Educational Toy Set for Kids 3-7 years',
    description: 'Complete educational toy set perfect for children aged 3-7. Includes puzzles, building blocks, and learning games. Clean and in great condition.',
    price: 450,
    category: 'Toys',
    condition: 'Good',
    location: { area: '6th of October', city: 'Cairo' },
    featured: false,
    views: 94
  },
  {
    title: 'Vintage Film Camera - Canon AE-1',
    description: 'Classic Canon AE-1 film camera in working condition. Perfect for photography enthusiasts. Comes with original leather case.',
    price: 2800,
    category: 'Electronics',
    condition: 'Good',
    location: { area: 'Downtown', city: 'Cairo' },
    featured: false,
    views: 167
  },
  {
    title: 'Dining Table Set - 6 Chairs',
    description: 'Beautiful wooden dining table set with 6 chairs. Seats 6 comfortably. Table dimensions: 180cm x 90cm. Minor scratches.',
    price: 6500,
    category: 'Furniture',
    condition: 'Good',
    location: { area: 'Giza', city: 'Cairo' },
    featured: false,
    views: 145
  }
];

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Listing.deleteMany({});

    // Create admin user
    console.log('Creating admin user...');
    const adminPassword = crypto.randomBytes(8).toString('hex'); // Generate random password
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    const adminEmail = process.env.ADMIN_EMAIL || 'adminmdbillah420@gmail.com';
    const adminName = process.env.ADMIN_NAME || 'Admin';

    const adminUser = await User.create({
      name: adminName,
      email: adminEmail,
      password: hashedAdminPassword,
      phone: '01000000000',
      location: 'Cairo, Egypt',
      isAdmin: true,
      isActive: true,
      rating: { average: 5.0, count: 0 },
      salesCount: 0,
      createdAt: new Date()
    });

    // Create regular users
    console.log('Creating users...');
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = await User.create({
        ...userData,
        password: hashedPassword,
        isAdmin: false,
        isActive: true,
        createdAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000) // Random date in last 6 months
      });
      createdUsers.push(user);
    }

    // Create listings
    console.log('Creating listings...');
    for (let i = 0; i < sampleListings.length; i++) {
      const listing = sampleListings[i];
      const seller = createdUsers[i % createdUsers.length];
      const categoryKey = listing.category.toLowerCase();
      const images = sampleImages[categoryKey] || sampleImages.furniture;

      await Listing.create({
        ...listing,
        seller: seller._id,
        images: images.slice(0, 2).map(url => ({ url, publicId: '' })),
        moderationStatus: 'approved', // Auto-approve seeded listings for demo
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date in last 30 days
      });
    }

    console.log('✅ Database seeded successfully!');
    console.log(`   Created 1 admin user`);
    console.log(`   Created ${createdUsers.length} regular users`);
    console.log(`   Created ${sampleListings.length} listings`);

    // Print admin credentials
    console.log('\n🔐 ADMIN CREDENTIALS (SAVE THESE!):');
    console.log('   ================================');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('   ================================');
    console.log('   ⚠️  Save these credentials in a secure place!');

    // Print test user credentials
    console.log('\n📧 Test User Credentials:');
    console.log('   Email: mohamed.ahmed@example.com');
    console.log('   Password: password123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
