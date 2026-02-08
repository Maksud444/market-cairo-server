const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Compress image to target file size (200-300 KB)
 * @param {String} inputPath - Path to original image
 * @param {String} outputPath - Path for compressed image (will be JPEG)
 * @param {Number} targetSizeKB - Target size in KB (default: 250)
 * @returns {Promise<Object>} - Compression result with stats
 */
async function compressImage(inputPath, outputPath, targetSizeKB = 250) {
  try {
    const targetSizeBytes = targetSizeKB * 1024;

    // Check if file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      console.error(`[COMPRESSION] File not found: ${inputPath}`);
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const originalSize = (await fs.stat(inputPath)).size;

    // Ensure output path has .jpg extension
    const jpegOutputPath = outputPath.replace(/\.\w+$/, '.jpg');

    // If already small enough, still convert to JPEG for consistency
    if (originalSize <= targetSizeBytes) {
      await sharp(inputPath)
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(jpegOutputPath);

      const compressedSize = (await fs.stat(jpegOutputPath)).size;
      return {
        success: true,
        originalSize,
        compressedSize,
        saved: originalSize - compressedSize,
        outputPath: jpegOutputPath,
        width: metadata.width,
        height: metadata.height
      };
    }

    // Calculate quality based on target size
    // Start with quality 80 and adjust
    let quality = 80;
    let attempt = 0;
    let compressedSize = originalSize;

    // Try up to 5 times to reach target size
    while (attempt < 5 && compressedSize > targetSizeBytes * 1.2) {
      await sharp(inputPath)
        .resize(metadata.width, metadata.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality, mozjpeg: true })
        .toFile(jpegOutputPath);

      const stats = await fs.stat(jpegOutputPath);
      compressedSize = stats.size;

      if (compressedSize > targetSizeBytes * 1.2) {
        quality -= 10;
        attempt++;
        // Delete the failed attempt
        await fs.unlink(jpegOutputPath).catch(() => {});
      }
    }

    // If still too large, resize image
    if (compressedSize > targetSizeBytes * 1.5) {
      const scaleFactor = Math.sqrt(targetSizeBytes / compressedSize);
      const newWidth = Math.round(metadata.width * scaleFactor);

      await sharp(inputPath)
        .resize(newWidth, null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(jpegOutputPath);

      compressedSize = (await fs.stat(jpegOutputPath)).size;
    }

    return {
      success: true,
      originalSize,
      compressedSize,
      saved: originalSize - compressedSize,
      savedPercent: Math.round(((originalSize - compressedSize) / originalSize) * 100),
      outputPath: jpegOutputPath,
      width: metadata.width,
      height: metadata.height
    };
  } catch (error) {
    console.error('[COMPRESSION] Error:', error);
    throw new Error(`Failed to compress image: ${error.message}`);
  }
}

/**
 * Process multiple images
 * @param {Array} files - Array of multer file objects
 * @param {Number} targetSizeKB - Target size in KB
 * @returns {Promise<Array>} - Array of compression results
 */
async function compressMultipleImages(files, targetSizeKB = 250) {
  const results = [];

  for (const file of files) {
    const inputPath = file.path;
    const outputPath = inputPath.replace(/(\.[\w]+)$/, '-compressed.jpg');

    try {
      const result = await compressImage(inputPath, outputPath, targetSizeKB);

      // Delete original file
      await fs.unlink(inputPath).catch(() => {});

      // Update file object with new JPEG path
      const jpegPath = result.outputPath;
      const jpegFilename = path.basename(jpegPath);

      // Rename compressed file to replace original (with .jpg extension)
      const finalPath = inputPath.replace(/\.\w+$/, '.jpg');
      await fs.rename(jpegPath, finalPath);

      // Update the file object
      file.path = finalPath;
      file.filename = file.filename.replace(/\.\w+$/, '.jpg');
      file.mimetype = 'image/jpeg';

      results.push({
        filename: file.filename,
        ...result
      });
    } catch (error) {
      console.error(`[COMPRESSION] Failed to compress ${file.filename}:`, error);
      // Keep original file if compression fails
      results.push({
        filename: file.filename,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = { compressImage, compressMultipleImages };
