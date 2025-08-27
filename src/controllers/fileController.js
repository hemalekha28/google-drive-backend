const cloudinary = require('cloudinary').v2;
const File = require('../models/File'); // Use the actual model
const User = require('../models/User');
const crypto = require("crypto");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: 'auto',
      folder: 'google-drive-clone',
      ...options
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('Cloudinary upload success:', result.public_id);
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
};

// Helper function to sanitize filename
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
};

// Upload file controller
const uploadFile = async (req, res) => {
  try {
    console.log('=== FILE UPLOAD START ===');
    console.log('File received:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      bufferSize: req.file.buffer.length
    });

    // Check if file exists
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file or file buffer found'
      });
    }

    // Upload to Cloudinary
    console.log('Uploading to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      folder: `google-drive/${req.user._id}`,
      resource_type: 'auto'
    });

    console.log('Cloudinary upload successful');

    // Create file document
    const fileName = req.body.name || req.file.originalname;
    
    const file = new File({
      name: sanitizeFilename(fileName),
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      cloudinaryUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
      owner: req.user._id,
      folder: req.body.folderId || null
    });

    const savedFile = await file.save();
    
    // Update user storage usage
    await User.findByIdAndUpdate(
      req.user._id, 
      { $inc: { storageUsed: req.file.size } }
    );

    console.log('File saved to database:', savedFile._id);

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: savedFile._id,
        name: savedFile.name,
        originalName: savedFile.originalName,
        size: savedFile.size,
        mimeType: savedFile.mimeType,
        url: savedFile.cloudinaryUrl, // Direct access to URL
        folder: savedFile.folder,
        createdAt: savedFile.createdAt
      }
    });

  } catch (error) {
    console.error('=== UPLOAD ERROR ===');
    console.error('Error details:', error.message);

    // Handle specific errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: Object.values(error.errors).map(e => e.message)
      });
    }

    if (error.message.includes('Cloudinary')) {
      return res.status(500).json({
        success: false,
        message: 'File upload to cloud storage failed'
      });
    }

    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get user files
const getUserFiles = async (req, res) => {
  try {
    const { folder, page = 1, limit = 50 } = req.query;

    const query = {
      owner: req.user._id,
      isDeleted: false,
      ...(folder && folder !== 'root' ? { folder } : { folder: null })
    };

    const files = await File.find(query)
      .populate('folder', 'name path')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await File.countDocuments(query);

    res.json({
      success: true,
      files: files.map(file => ({
        id: file._id,
        name: file.name,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        url: file.cloudinaryUrl,
        folder: file.folder,
        createdAt: file.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve files'
    });
  }
};

// Get file by ID
const getFileById = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id,
      isDeleted: false
    }).populate('folder', 'name path');

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Update last accessed
    file.lastAccessed = new Date();
    await file.save();

    res.json({
      success: true,
      file: {
        id: file._id,
        name: file.name,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        url: file.cloudinaryUrl,
        folder: file.folder,
        lastAccessed: file.lastAccessed,
        createdAt: file.createdAt
      }
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve file'
    });
  }
};

//Dowload file
const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    // If file stored in cloudinary
    if (file.url) {
      return res.redirect(file.url); // Streams directly from Cloudinary
    }

    res.status(400).json({ success: false, message: "File does not have a valid URL" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 
const restoreFile = async (req, res) => {
  try {
    const file = await File.findByIdAndUpdate(
      req.params.id,
      { isDeleted: false },
      { new: true }
    );
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    res.json({ success: true, message: "File restored successfully", file });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTrashedFiles = async (req, res) => {
  try {
    const trashedFiles = await File.find({ isDeleted: true });
    res.json({ success: true, trashedFiles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const unshareFile = async (req, res) => {
  try {
    const file = await File.findByIdAndUpdate(
      req.params.id,
      { isShared: false, shareToken: null },
      { new: true }
    );
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    res.json({ success: true, message: "File unshared successfully", file });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const renameFile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "New name required" });

    const file = await File.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    res.json({ success: true, message: "File renamed successfully", file });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete file
const deleteFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Soft delete
    await file.softDelete();

    // Update user storage (optional - you might want to keep this for trash restore)
    // await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: -file.size } });

    res.json({
      success: true,
      message: 'File moved to trash'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file'
    });
  }
};

// Search files
const searchFiles = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const files = await File.find({
      owner: req.user._id,
      isDeleted: false,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { originalName: { $regex: q, $options: 'i' } }
      ]
    })
    .populate('folder', 'name path')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      files: files.map(file => ({
        id: file._id,
        name: file.name,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        url: file.cloudinaryUrl,
        folder: file.folder,
        createdAt: file.createdAt
      })),
      query: q,
      count: files.length
    });

  } catch (error) {
    console.error('Search files error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

const shareFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // generate share token
    file.shareToken = crypto.randomBytes(16).toString("hex");
    file.isShared = true;

    await file.save();

    res.json({
      message: "File shared successfully",
      shareUrl: `${process.env.FRONTEND_URL}/share/${file.shareToken}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error sharing file" });
  }
};

module.exports = {
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
};