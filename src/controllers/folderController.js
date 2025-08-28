const Folder = require('../models/Folder');
const File = require('../models/File');
const User = require('../models/User');
const { sanitizeFilename } = require('../utils/validation');
const mongoose = require('mongoose');

// Create folder
const createFolder = async (req, res) => {
  try {
    const { name, parent, color } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Folder name is required'
      });
    }

    // Check if folder with same name exists in the same parent
    let existingQuery = {
      name: sanitizeFilename(name),
      owner: req.user._id,
      parent: parent || null,
      isDeleted: false
    };

    const existingFolder = await Folder.findOne(existingQuery);
    if (existingFolder) {
      return res.status(400).json({
        success: false,
        message: 'Folder with this name already exists in this location'
      });
    }

    // If parent is specified, check if it exists and user has access
    if (parent) {
      const parentFolder = await Folder.findOne({
        _id: parent,
        $or: [
          { owner: req.user._id },
          { 'shareSettings.sharedWith.user': req.user._id, 'shareSettings.sharedWith.permissions': { $in: ['write', 'admin'] } }
        ],
        isDeleted: false
      });

      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found or access denied'
        });
      }
    }

    const folder = new Folder({
      name: sanitizeFilename(name),
      owner: req.user._id,
      parent: parent || null,
      color: color || '#1976d2'
    });

    await folder.save();
    await folder.populate('parent', 'name path');

    res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      folder: {
        id: folder._id,
        name: folder.name,
        path: folder.path,
        parent: folder.parent,
        color: folder.color,
        createdAt: folder.createdAt
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user folders
const getUserFolders = async (req, res) => {
  try {
    const { parent, search, page = 1, limit = 50 } = req.query;

    let query = {
      $or: [
        { owner: req.user._id },
        { 'shareSettings.sharedWith.user': req.user._id }
      ],
      isDeleted: false
    };

    // Parent filter
    if (parent && parent !== 'root') {
      query.parent = parent;
    } else if (parent === 'root') {
      query.parent = null;
    }

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const folders = await Folder.find(query)
      .populate('parent', 'name path')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Folder.countDocuments(query);

    // Get folder stats (file count, total size)
    const foldersWithStats = await Promise.all(folders.map(async (folder) => {
      const fileStats = await File.aggregate([
        {
          $match: {
            folder: folder._id,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalSize: { $sum: '$size' }
          }
        }
      ]);

      const stats = fileStats[0] || { count: 0, totalSize: 0 };

      return {
        id: folder._id,
        name: folder.name,
        path: folder.path,
        parent: folder.parent,
        owner: folder.owner,
        color: folder.color,
        fileCount: stats.count,
        totalSize: stats.totalSize,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      };
    }));

    res.json({
      success: true,
      folders: foldersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user folders error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get folder by ID
const getFolderById = async (req, res) => {
  try {
    const folder = await Folder.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user._id },
        { 'shareSettings.sharedWith.user': req.user._id }
      ],
      isDeleted: false
    })
    .populate('parent', 'name path')
    .populate('owner', 'name email')
    .populate('shareSettings.sharedWith.user', 'name email');

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }

    // Get folder contents
    const [subfolders, files] = await Promise.all([
      Folder.find({
        parent: folder._id,
        $or: [
          { owner: req.user._id },
          { 'shareSettings.sharedWith.user': req.user._id }
        ],
        isDeleted: false
      })
      .populate('owner', 'name email')
      .sort({ name: 1 }),

      File.find({
        folder: folder._id,
        $or: [
          { owner: req.user._id },
          { 'shareSettings.sharedWith.user': req.user._id }
        ],
        isDeleted: false
      })
      .populate('owner', 'name email')
      .sort({ name: 1 })
    ]);

    // Get folder statistics
    const folderStats = await File.aggregate([
      {
        $match: {
          folder: folder._id,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$size' }
        }
      }
    ]);

    const stats = folderStats[0] || { totalFiles: 0, totalSize: 0 };

    res.json({
      success: true,
      folder: {
        id: folder._id,
        name: folder.name,
        path: folder.path,
        parent: folder.parent,
        owner: folder.owner,
        color: folder.color,
        shareSettings: folder.shareSettings,
        stats: {
          totalFiles: stats.totalFiles,
          totalSubfolders: subfolders.length,
          totalSize: stats.totalSize
        },
        contents: {
          folders: subfolders.map(f => ({
            id: f._id,
            name: f.name,
            path: f.path,
            color: f.color,
            owner: f.owner,
            createdAt: f.createdAt
          })),
          files: files.map(f => ({
            id: f._id,
            name: f.name,
            originalName: f.originalName || f.name,
            size: f.size,
            mimeType: f.mimeType,
            url: f.url,
            owner: f.owner,
            createdAt: f.createdAt
          }))
        },
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }
    });
  } catch (error) {
    console.error('Get folder by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update folder
const updateFolder = async (req, res) => {
  try {
    const { name, parent, color } = req.body;

    const folder = await Folder.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user._id },
        { 'shareSettings.sharedWith.user': req.user._id, 'shareSettings.sharedWith.permissions': { $in: ['write', 'admin'] } }
      ],
      isDeleted: false
    });

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found or access denied'
      });
    }

    // Check for name conflicts if name is being changed
    if (name && name !== folder.name) {
      const existingFolder = await Folder.findOne({
        name: sanitizeFilename(name),
        owner: req.user._id,
        parent: parent !== undefined ? parent : folder.parent,
        isDeleted: false,
        _id: { $ne: folder._id }
      });

      if (existingFolder) {
        return res.status(400).json({
          success: false,
          message: 'Folder with this name already exists in this location'
        });
      }

      folder.name = sanitizeFilename(name);
    }

    // Update parent if provided
    if (parent !== undefined) {
      if (parent) {
        // Verify new parent exists and user has access
        const parentFolder = await Folder.findOne({
          _id: parent,
          $or: [
            { owner: req.user._id },
            { 'shareSettings.sharedWith.user': req.user._id, 'shareSettings.sharedWith.permissions': { $in: ['write', 'admin'] } }
          ],
          isDeleted: false
        });

        if (!parentFolder) {
          return res.status(404).json({
            success: false,
            message: 'Parent folder not found or access denied'
          });
        }

        // Prevent moving folder into itself or its descendants
        const descendants = await getDescendants(folder._id);
        if (descendants.includes(parent) || parent === folder._id.toString()) {
          return res.status(400).json({
            success: false,
            message: 'Cannot move folder into itself or its subdirectories'
          });
        }

        folder.parent = parent;
      } else {
        folder.parent = null;
      }
    }

    // Update color if provided
    if (color) {
      folder.color = color;
    }

    await folder.save();
    await folder.populate('parent', 'name path');

    res.json({
      success: true,
      message: 'Folder updated successfully',
      folder: {
        id: folder._id,
        name: folder.name,
        path: folder.path,
        parent: folder.parent,
        color: folder.color,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }
    });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to get descendants
const getDescendants = async (folderId) => {
  try {
    const folder = await Folder.findById(folderId);
    if (!folder) return [];

    const descendants = await Folder.find({
      path: { $regex: `^${folder.path}/` }
    }).select('_id');

    return descendants.map(d => d._id.toString());
  } catch (error) {
    console.error('Get descendants error:', error);
    return [];
  }
};

// Delete folder (soft delete)
const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    
    const folder = await Folder.findOne({
      _id: id,
      owner: req.user._id,
      isDeleted: false
    });

    if (!folder) {
      return res.status(404).json({ 
        success: false, 
        message: "Folder not found or access denied" 
      });
    }

    // Find all descendant folders
    const descendants = await Folder.find({
      path: { $regex: `^${folder.path}/` },
      owner: req.user._id
    });

    const allFolderIds = [folder._id, ...descendants.map(f => f._id)];

    // Mark folders as deleted
    await Folder.updateMany(
      { _id: { $in: allFolderIds } },
      { isDeleted: true, deletedAt: new Date() }
    );

    // Mark files inside these folders as deleted
    await File.updateMany(
      { folder: { $in: allFolderIds } },
      { isDeleted: true, deletedAt: new Date() }
    );

    res.json({ 
      success: true, 
      message: "Folder moved to trash successfully" 
    });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Restore folder from trash
const restoreFolder = async (req, res) => {
  try {
    const folder = await Folder.findOne({
      _id: req.params.id,
      owner: req.user._id,
      isDeleted: true
    });

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found in trash'
      });
    }

    // Get all descendant folders
    const descendants = await Folder.find({
      path: { $regex: `^${folder.path}/` },
      owner: req.user._id,
      isDeleted: true
    });

    const allFolderIds = [folder._id, ...descendants.map(f => f._id)];

    // Restore the folder and all its descendants
    await Folder.updateMany(
      { _id: { $in: allFolderIds } },
      { 
        isDeleted: false, 
        deletedAt: null 
      }
    );

    // Restore all files in these folders
    await File.updateMany(
      { folder: { $in: allFolderIds } },
      { 
        isDeleted: false, 
        deletedAt: null 
      }
    );

    res.json({
      success: true,
      message: 'Folder and its contents restored successfully'
    });
  } catch (error) {
    console.error('Restore folder error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get trash folders
const getTrashFolders = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const folders = await Folder.find({
      owner: req.user._id,
      isDeleted: true
    })
    .populate('parent', 'name path')
    .sort({ deletedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Folder.countDocuments({
      owner: req.user._id,
      isDeleted: true
    });

    res.json({
      success: true,
      folders: folders.map(folder => ({
        id: folder._id,
        name: folder.name,
        path: folder.path,
        parent: folder.parent,
        color: folder.color,
        deletedAt: folder.deletedAt,
        createdAt: folder.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get trash folders error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
const permanentlyDeleteFolder = async (req, res) => {
  try {
    const { id } = req.params;

    const folder = await Folder.findOne({
      _id: id,
      owner: req.user._id,
      isDeleted: true
    });

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found in trash"
      });
    }

    // Find all descendants (also must belong to same user)
    const descendants = await Folder.find({
      path: { $regex: `^${folder.path}/` },
      owner: req.user._id
    });

    const allFolderIds = [folder._id, ...descendants.map(f => f._id)];

    // Delete all files in these folders
    await File.deleteMany({ 
      folder: { $in: allFolderIds },
      owner: req.user._id
    });

    // Delete the folders themselves
    await Folder.deleteMany({ _id: { $in: allFolderIds } });

    res.json({
      success: true,
      message: `Folder "${folder.name}" and all contents permanently deleted`
    });
  } catch (error) {
    console.error("Permanently delete folder error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// Share folder with user
const shareFolderWithUser = async (req, res) => {
  try {
    const { email, permissions = 'read' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const folder = await Folder.findOne({
      _id: req.params.id,
      owner: req.user._id,
      isDeleted: false
    });

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }

    // Find user to share with
    const userToShareWith = await User.findOne({ email });
    if (!userToShareWith) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow sharing with yourself
    if (userToShareWith._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot share folder with yourself'
      });
    }

    // Initialize shareSettings if it doesn't exist
    if (!folder.shareSettings) {
      folder.shareSettings = { isPublic: false, sharedWith: [] };
    }

    // Check if already shared
    const existingShareIndex = folder.shareSettings.sharedWith.findIndex(
      share => share.user.toString() === userToShareWith._id.toString()
    );

    if (existingShareIndex !== -1) {
      // Update existing share
      folder.shareSettings.sharedWith[existingShareIndex].permissions = permissions;
      folder.shareSettings.sharedWith[existingShareIndex].sharedAt = new Date();
    } else {
      // Add new share
      folder.shareSettings.sharedWith.push({
        user: userToShareWith._id,
        permissions,
        sharedAt: new Date()
      });
    }

    await folder.save();

    res.json({
      success: true,
      message: `Folder shared with ${email} successfully`
    });
  } catch (error) {
    console.error('Share folder error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get folder breadcrumb
const getFolderBreadcrumb = async (req, res) => {
  try {
    const folderId = req.params.id;
    const breadcrumb = [];

    let currentFolder = await Folder.findOne({
      _id: folderId,
      $or: [
        { owner: req.user._id },
        { 'shareSettings.sharedWith.user': req.user._id }
      ],
      isDeleted: false
    });

    if (!currentFolder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }

    // Build breadcrumb trail
    while (currentFolder) {
      breadcrumb.unshift({
        id: currentFolder._id,
        name: currentFolder.name,
        path: currentFolder.path
      });

      if (currentFolder.parent) {
        currentFolder = await Folder.findOne({
          _id: currentFolder.parent,
          $or: [
            { owner: req.user._id },
            { 'shareSettings.sharedWith.user': req.user._id }
          ],
          isDeleted: false
        });
      } else {
        currentFolder = null;
      }
    }

    // Add root folder
    breadcrumb.unshift({
      id: 'root',
      name: 'My Drive',
      path: ''
    });

    res.json({
      success: true,
      breadcrumb
    });
  } catch (error) {
    console.error('Get folder breadcrumb error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createFolder,
  getUserFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  restoreFolder,
  getTrashFolders,
  permanentlyDeleteFolder,
  shareFolderWithUser,
  getFolderBreadcrumb
};