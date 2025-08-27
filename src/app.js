const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const passport = require('passport');
require('./config/passport'); 

const app = express();
// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(passport.initialize());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const authRoutes = require("./routes/auth");
// Use routes
app.use("/api/auth", authRoutes);



// Test route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Google Drive Clone API',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Import and mount file routes
try {
  const fileRoutes = require('./routes/files');
  app.use('/api/files', fileRoutes);
  console.log('✅ File routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading file routes:', error.message);
  process.exit(1);
}

try {
  const folderRoutes = require('./routes/folders');
  app.use('/api/folders', folderRoutes);
  console.log('✅ Folder routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading folder routes:', error.message);
  process.exit(1);
}

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      error: error 
    })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});



// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

module.exports = app;