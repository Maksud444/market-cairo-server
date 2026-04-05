/**
 * One-time script: promote admin to super admin
 * Run: node src/makeSuperAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const EMAIL = 'adminmdbillah420@gmail.com';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: EMAIL });
  if (!user) {
    console.log('User not found:', EMAIL);
    process.exit(1);
  }
  user.isAdmin = true;
  user.isSuperAdmin = true;
  await user.save();
  console.log('Done! Super admin set for:', user.email, user.name);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
