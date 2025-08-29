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
    unique: true,
    sparse: true
  },
  shareSettings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    sharedWith: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      permission: {
        type: String,
        enum: ['read', 'write'],
        default: 'read'
      },
      sharedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Tags for organization
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  version: {
    type: Number,
    default: 1
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
fileSchema.index({ isShared: 1 });

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
    return { access: true, permission: 'owner' };
  }
  
  // Check if shared with user
  if (this.shareSettings && this.shareSettings.sharedWith) {
    const sharedItem = this.shareSettings.sharedWith.find(
      item => item.user.toString() === userId.toString()
    );
    
    if (sharedItem) {
      return { access: true, permission: sharedItem.permission };
    }
  }
  
  // Check if public
  if (this.shareSettings && this.shareSettings.isPublic) {
    return { access: true, permission: 'read' };
  }
  
  return { access: false, permission: null };
};

// Static method to get user's storage usage
fileSchema.statics.getUserStorageUsage = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
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
    next();
  }
});

module.exports = mongoose.models.File || mongoose.model("File", fileSchema);