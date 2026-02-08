const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { compressMultipleImages } = require('../utils/imageCompression');

// Upload directory: /tmp on Vercel (read-only filesystem), local uploads/ otherwise
const uploadDir = process.env.VERCEL
  ? '/tmp'
  : path.join(__dirname, '../../uploads');

// Ensure upload directory exists (local dev)
if (!process.env.VERCEL && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 10 // Max 10 files
  }
});

// Error handling middleware for multer
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next();
};

// Compression middleware
const compressImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    console.log(`[COMPRESSION] Compressing ${req.files.length} images...`);
    const results = await compressMultipleImages(req.files, 250);

    // Log compression stats
    const totalSaved = results.reduce((sum, r) => sum + (r.saved || 0), 0);
    const avgSavedKB = Math.round(totalSaved / results.length / 1024);
    console.log(`[COMPRESSION] Complete. Saved avg ${avgSavedKB}KB per image`);

    // Attach stats to request for potential logging
    req.compressionStats = results;

    next();
  } catch (error) {
    console.error('[COMPRESSION] Failed:', error);
    // Continue even if compression fails - better to have uncompressed images
    next();
  }
};

// Convert uploaded files to base64 data URLs (for Vercel serverless - no persistent filesystem)
const convertToDataUrl = async (req, res, next) => {
  if (!process.env.VERCEL || !req.files || req.files.length === 0) {
    return next();
  }

  try {
    for (const file of req.files) {
      const buffer = await fsPromises.readFile(file.path);
      file.dataUrl = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
      // Clean up temp file
      await fsPromises.unlink(file.path).catch(() => {});
    }
    next();
  } catch (error) {
    console.error('[UPLOAD] Data URL conversion failed:', error);
    next();
  }
};

module.exports = { upload, handleUploadErrors, compressImages, convertToDataUrl };
