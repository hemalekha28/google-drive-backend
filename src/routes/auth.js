const express = require('express');
const passport = require('passport');
const { authenticate } = require('../middleware/auth');
const { registerValidation, loginValidation } = require('../middleware/validation');
const {
  register,
  login,
  getProfile,
  updateProfile,
  googleCallback
} = require('../controllers/authController');

const router = express.Router();

// Initialize passport configuration
require('../config/passport');

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

// Google OAuth routes
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/error' }),
  googleCallback
);

module.exports = router;