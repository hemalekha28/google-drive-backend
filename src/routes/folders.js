const express = require('express');
const mongoose=require('mongoose');
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

const folderValidation = (req, res, next) => next();
const shareValidation = (req, res, next) => next();
const mongoIdValidation = (req, res, next) => {
  const { id } = req.params;
  if (!id || id.length !== 24) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }
  next();
};


// Routes
router.post('/', authenticate, folderValidation, createFolder);
router.get('/', authenticate, getUserFolders);
router.get('/trash', async (req, res) => {
  try {
    const trashedFolders = await Folder.find({ isDeleted: true });
    res.json({ success: true, trashedFolders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/breadcrumb', authenticate, mongoIdValidation, getFolderBreadcrumb);
router.get('/:id', authenticate, mongoIdValidation, getFolderById);

router.put('/:id', 
  authenticate, 
  mongoIdValidation, 
  folderValidation, 
  updateFolder
);
// Permanently delete a folder
router.patch('/:id/permanent', authenticate, mongoIdValidation, permanentlyDeleteFolder);


router.delete('/:id', authenticate, mongoIdValidation, deleteFolder);
router.post('/:id/restore', authenticate, mongoIdValidation, restoreFolder);

router.patch('/:id/share', 
  authenticate, 
  mongoIdValidation,
  shareValidation,
  shareFolderWithUser
);

module.exports = router;