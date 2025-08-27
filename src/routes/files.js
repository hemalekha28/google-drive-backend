const express = require('express');
const mongoose = require('mongoose');
const File = require('../models/File');  
const { authenticate } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const { mongoIdValidation } = require('../middleware/validation');
const {
  uploadFile,
  getUserFiles,
  getFileById,
  deleteFile,
  searchFiles,
  shareFile,
  renameFile,
  unshareFile,
  getTrashedFiles,
  restoreFile,
  downloadFile
} = require('../controllers/fileController');

const router = express.Router();

// Validation middleware for file upload
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  if (!req.file.buffer) {
    return res.status(400).json({
      success: false,
      message: 'File buffer is missing'
    });
  }

  console.log('File validation passed:', {
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  next();
};

// MongoDB ID validation
const validateMongoId = (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file ID format'
    });
  }

  next();
};

router.post("/:id/share", async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    file.isShared = true;
    file.shareToken = Math.random().toString(36).substring(2, 15);
    await file.save();

    res.json({ success: true, file });
  } catch (err) {
    console.error("Error sharing file:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/shared/:token", async (req, res) => {
  try {
    const file = await File.findOne({ shareToken: req.params.token, isShared: true });
    if (!file) {
      return res.status(404).json({ success: false, message: "Shared file not found or link expired" });
    }

    res.json({ success: true, file });
  } catch (err) {
    console.error("Error fetching shared file:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Routes
router.post('/upload',
  authenticate,
  upload.single('file'),
  handleMulterError,
  validateFileUpload,
  uploadFile
);

router.get('/', authenticate, getUserFiles);

router.get('/search', authenticate, searchFiles);

router.get('/:id', authenticate, validateMongoId, getFileById);

router.delete('/:id', authenticate, validateMongoId, deleteFile);

// Download file (stream from Cloudinary)
router.get('/:id/download', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.isDeleted) return res.status(404).json({ msg: 'File not found' });

    // Cloudinary gives us secure_url
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.redirect(file.url); // Browser/Postman will hit Cloudinary and start download/stream
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});


// ✅ Restore file from trash
router.patch("/:id/restore",restoreFile);

// ✅ List trashed files
router.get("/trash/all",getTrashedFiles);

// ✅ Unshare file
router.patch("/:id/unshare",unshareFile);

// ✅ Rename file
router.patch("/:id/rename",renameFile);

// ✅ Permanently delete file
router.patch('/:id/permanent', authenticate, validateMongoId, permanentlyDeleteFile);

// Test routes for debugging
router.get('/test/ping', (req, res) => {
  res.json({
    success: true,
    message: 'File routes are working!',
    timestamp: new Date().toISOString(),
    mongodb_status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

router.get('/test/env', (req, res) => {
  res.json({
    success: true,
    environment: {
      cloudinary_configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
      mongodb_uri: !!process.env.MONGODB_URI,
      node_env: process.env.NODE_ENV,
      jwt_secret: !!process.env.JWT_SECRET
    }
  });
});

module.exports = router;