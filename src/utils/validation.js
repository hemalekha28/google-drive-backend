const mongoose = require('mongoose');

// Sanitize filename function
const sanitizeFilename = (filename) => {
  if (!filename) return 'untitled';
  
  // Remove dangerous characters and replace with safe alternatives
  return filename
    .replace(/[<>:"/\\|?*]/g, '_') // Replace dangerous chars with underscore
    .replace(/\.\./g, '_') // Replace double dots
    .replace(/^\./g, '_') // Replace leading dot
    .trim()
    .substring(0, 255) // Limit length
    || 'untitled'; // Fallback if empty after sanitization
};

// MongoDB ObjectId validation middleware
const mongoIdValidation = (req, res, next) => {
  const { id } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  next();
};

// File validation middleware (for updates, not uploads)
const fileValidation = (req, res, next) => {
  const { name, description } = req.body;
  
  // Validate name if provided
  if (name !== undefined) {
    if (typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'File name must be a string'
      });
    }
    
    if (name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File name cannot be empty'
      });
    }
    
    if (name.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'File name too long (max 255 characters)'
      });
    }
  }
  
  // Validate description if provided
  if (description !== undefined) {
    if (typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Description must be a string'
      });
    }
    
    if (description.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Description too long (max 500 characters)'
      });
    }
  }
  
  next();
};

// Share validation middleware
const shareValidation = (req, res, next) => {
  const { permissions, expiresIn, email } = req.body;
  
  // Validate permissions if provided
  if (permissions && !['read', 'write'].includes(permissions)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid permissions. Must be "read" or "write"'
    });
  }
  
  // Validate expiresIn if provided
  if (expiresIn && !['1h', '1d', '7d', '30d', 'never'].includes(expiresIn)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid expiration time. Must be "1h", "1d", "7d", "30d", or "never"'
    });
  }
  
  // Validate email if provided (for sharing with specific user)
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
  }
  
  next();
};

// Token validation middleware
const tokenValidation = (req, res, next) => {
  const { token } = req.params;
  
  if (!token || typeof token !== 'string' || token.length !== 64) {
    return res.status(400).json({
      success: false,
      message: 'Invalid share token'
    });
  }
  
  next();
};

module.exports = {
  sanitizeFilename,
  mongoIdValidation,
  fileValidation,
  shareValidation,
  tokenValidation
};