const express = require('express');
const multer = require('multer');
const cloudinaryUpload = require('../utils/cloudinaryUpload');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/upload/single - single file upload
// Optional body: { folder: 'ecom/products' } (defaults to 'ecom')
router.post('/single', protect, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const folder = (req.body.folder || 'ecom').toString().trim() || 'ecom';
    const result = await cloudinaryUpload.uploadBuffer(req.file.buffer, { folder });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
});

// POST /api/upload/multiple - multiple files upload
// Optional body: { folder: 'ecom/products' }
router.post('/multiple', protect, upload.array('images', 20), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const folder = (req.body.folder || 'ecom').toString().trim() || 'ecom';
    const files = req.files.slice(0, Number(req.query.limit) || req.files.length);
    const results = await cloudinaryUpload.uploadMultipleBuffers(
      files.map((f) => f.buffer),
      { folder }
    );
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
});

// POST /api/upload/delete - delete image from Cloudinary
// Body: { publicId: '...' }
router.post('/delete', protect, async (req, res, next) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ success: false, message: 'publicId is required' });
    }
    await cloudinaryUpload.deleteByPublicId(publicId);
    return res.json({ success: true, message: 'Image deleted from Cloudinary' });
  } catch (error) {
    console.error('Delete error:', error);
    next(error);
  }
});

module.exports = router;
