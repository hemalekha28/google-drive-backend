const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true,
    maxlength: [100, 'Folder name cannot be more than 100 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  path: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#1976d2'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
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
  }
}, {
  timestamps: true
});

// Indexes for better performance
folderSchema.index({ owner: 1, isDeleted: 1 });
folderSchema.index({ parent: 1, isDeleted: 1 });
folderSchema.index({ path: 1 });
folderSchema.index({ shareToken: 1 });
folderSchema.index({ isShared: 1 });

// Pre-validate middleware for path generation
folderSchema.pre('validate', async function(next) {
  if (this.isModified('parent') || this.isNew) {
    if (this.parent) {
      const parentFolder = await this.constructor.findById(this.parent);
      if (parentFolder) {
        this.path = `${parentFolder.path}/${this.name}`;
      }
    } else {
      this.path = `/${this.name}`;
    }
  }
  next();
});

// Method to soft delete
folderSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Method to restore from trash
folderSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

// Method to check folder access
folderSchema.methods.isAccessibleBy = function(userId) {
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

// Method to get breadcrumb
folderSchema.methods.getBreadcrumb = async function() {
  const breadcrumb = [];
  let currentFolder = this;
  
  while (currentFolder) {
    breadcrumb.unshift({
      _id: currentFolder._id,
      name: currentFolder.name
    });
    
    if (currentFolder.parent) {
      currentFolder = await this.constructor.findById(currentFolder.parent);
    } else {
      break;
    }
  }
  
  breadcrumb.unshift({ _id: null, name: 'Root' });
  return breadcrumb;
};

module.exports = mongoose.model('Folder', folderSchema);