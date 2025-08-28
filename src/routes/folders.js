const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Folder = require('../models/Folder');
const File = require('../models/File');

const {
  createFolder,
  getUserFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  restoreFolder,
  getTrashFolders,
  shareFolderWithUser,
  getFolderBreadcrumb,
  permanentlyDeleteFolder
} = require('../controllers/folderController');

const { authenticate } = require('../middleware/auth');

// Validation middlewares
const folderValidation = (req, res, next) => next();
const shareValidation = (req, res, next) => next();

const mongoIdValidation = (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid folder ID format' 
    });
  }
  next();
};

// Routes
router.post('/', authenticate, folderValidation, createFolder);
router.get('/', authenticate, getUserFolders);

// FIXED: Get trash folders with authentication
router.get('/trash', authenticate, getTrashFolders);

router.get('/:id/breadcrumb', authenticate, mongoIdValidation, getFolderBreadcrumb);
router.get('/:id', authenticate, mongoIdValidation, getFolderById);

router.put('/:id', authenticate, mongoIdValidation, folderValidation, updateFolder);

// FIXED: Permanently delete folder
router.patch('/:id/permanent', authenticate, mongoIdValidation, permanentlyDeleteFolder);

// FIXED: Soft delete folder
router.delete('/:id', authenticate, mongoIdValidation, deleteFolder);

// FIXED: Restore folder from trash
router.post('/:id/restore', authenticate, mongoIdValidation, restoreFolder);

// Share folder
router.patch('/:id/share', authenticate, mongoIdValidation, shareValidation, shareFolderWithUser);

module.exports = router;