const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true
  },
  cloudinaryUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  // Sharing functionality
  isShared: {
    type: Boolean,
    default: false
  },
  shareToken: {
    type: String,
    default: null,
    sparse: true,
    unique: true
  },
  shareExpiresAt: {
    type: Date,
    default: null
  },
  sharePermissions: {
    type: String,
    enum: ['read', 'write'],
    default: 'read'
  },
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['read', 'write'],
      default: 'read'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Tags for organization
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  // Version control (for future use)
  version: {
    type: Number,
    default: 1
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
fileSchema.index({ owner: 1, isDeleted: 1 });
fileSchema.index({ folder: 1, isDeleted: 1 });
fileSchema.index({ shareToken: 1 });
fileSchema.index({ name: 'text', originalName: 'text' });
fileSchema.index({ mimeType: 1 });
fileSchema.index({ createdAt: -1 });

// Virtual for file URL
fileSchema.virtual('url').get(function() {
  return this.cloudinaryUrl;
});

// Instance method for soft delete
fileSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Instance method for restore
fileSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

// Instance method to check if file is accessible by user
fileSchema.methods.isAccessibleBy = function(userId) {
  // Owner always has access
  if (this.owner.toString() === userId.toString()) {
    return { access: true, permission: 'admin' };
  }
  
  // Check if shared with user
  const sharedItem = this.sharedWith.find(
    item => item.user.toString() === userId.toString()
  );
  
  if (sharedItem) {
    return { access: true, permission: sharedItem.permissions };
  }
  
  return { access: false, permission: null };
};

// Static method to get user's storage usage - FIXED VERSION
fileSchema.statics.getUserStorageUsage = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId), // Fixed deprecated usage
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$size' },
        totalFiles: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { totalSize: 0, totalFiles: 0 };
};

// Pre-save middleware
fileSchema.pre('save', function(next) {
  // Update lastAccessed when file is modified
  if (this.isModified() && !this.isModified('lastAccessed')) {
    this.lastAccessed = new Date();
  }
  next();
});

// Pre-remove middleware to clean up Cloudinary files
fileSchema.pre('remove', async function(next) {
  try {
    const { deleteFromCloudinary } = require('../utils/uploadToCloud');
    await deleteFromCloudinary(this.cloudinaryPublicId);
    next();
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    next(); // Continue with deletion even if Cloudinary fails
  }
});

module.exports = mongoose.models.File || mongoose.model("File", fileSchema);