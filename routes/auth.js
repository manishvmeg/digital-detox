/**
 * routes/auth.js
 * Express router handling authentication.
 * Implements Google Identity Token verification and falls back to a sandbox account in dev.
 */

const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

/**
 * POST /api/auth/google
 * Verifies Google Sign-In Identity Token received from the client.
 */
router.post('/google', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Identity token is required.'
      });
    }

    // Bypass check for demo if Client ID is missing
    if (!CLIENT_ID || CLIENT_ID === 'your_google_oauth_client_id_here' || CLIENT_ID === '""') {
      console.warn('[Auth Warning]: GOOGLE_CLIENT_ID not set. Running in Sandbox Demo Mode.');
      
      // Return a simulated user session
      return res.status(200).json({
        success: true,
        mode: 'sandbox',
        user: {
          id: 'sandbox-user-12345',
          email: 'demo.developer@hackathon.org',
          name: 'Alex Mercer (Demo)',
          picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
          givenName: 'Alex'
        }
      });
    }

    // Verify token with Google APIs
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID
    });

    const payload = ticket.getPayload();
    const userId = payload['sub'];

    res.status(200).json({
      success: true,
      mode: 'live',
      user: {
        id: userId,
        email: payload['email'],
        name: payload['name'],
        picture: payload['picture'],
        givenName: payload['given_name']
      }
    });

  } catch (error) {
    console.error('[Google Verification Error]:', error);
    res.status(401).json({
      success: false,
      message: 'Failed to verify Google Identity Token. Invalid credentials.',
      details: error.message
    });
  }
});

module.exports = router;
