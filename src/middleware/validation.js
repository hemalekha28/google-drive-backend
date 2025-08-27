const { body, param, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Register validation rules
const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  handleValidationErrors
];

// Login validation rules
const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// File validation rules
const fileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot be more than 500 characters'),
  
  body('folderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid folder ID format'),
  
  handleValidationErrors
];

// Folder validation rules
const folderValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Folder name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Folder name must be between 1 and 100 characters')
    .matches(/^[^\/\\:*?"<>|]*$/)
    .withMessage('Folder name contains invalid characters'),
  
  body('parentId')
    .optional()
    .isMongoId()
    .withMessage('Invalid parent folder ID format'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot be more than 500 characters'),
  
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color code'),
  
  handleValidationErrors
];

// Share validation rules
const shareValidation = [
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('permissions')
    .optional()
    .isIn(['read', 'write', 'admin'])
    .withMessage('Permissions must be read, write, or admin'),
  
  body('expiresIn')
    .optional()
    .isIn(['1h', '1d', '7d', '30d', 'never'])
    .withMessage('Invalid expiration time'),
  
  handleValidationErrors
];

// MongoDB ObjectId validation
const mongoIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  handleValidationErrors
];

// Token validation
const tokenValidation = [
  param('token')
    .isLength({ min: 10 })
    .withMessage('Invalid token format'),
  
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  fileValidation,
  folderValidation,
  shareValidation,
  mongoIdValidation,
  tokenValidation,
  handleValidationErrors
};