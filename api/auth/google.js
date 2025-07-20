/**
 * Google OAuth token exchange endpoint
 * POST /api/auth/google - Exchange authorization code for user data
 */

import { publicEndpoint } from '../lib/middleware.js';
import { insertUserProfile, getUserById } from '../lib/database.js';

export default publicEndpoint(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code);
    
    if (!tokenResponse.access_token) {
      return res.status(400).json({
        success: false,
        error: 'Failed to exchange authorization code'
      });
    }

    // Get user info from Google
    const userInfo = await getUserInfoFromGoogle(tokenResponse.access_token);
    
    if (!userInfo.email) {
      return res.status(400).json({
        success: false,
        error: 'Failed to get user information from Google'
      });
    }

    // Generate public key for E2E encryption (in a real app, user would do this client-side)
    const publicKey = generateMockPublicKey();

    // Create or update user profile
    let user;
    const existingUser = await getUserByEmail(userInfo.email);
    
    if (existingUser) {
      // Update existing user
      user = existingUser;
    } else {
      // Create new user
      const userData = {
        id: `google_${userInfo.id}`,
        email: userInfo.email,
        name: userInfo.name,
        avatar_url: userInfo.picture,
        provider: 'google',
        public_key: publicKey
      };
      
      user = await insertUserProfile(userData);
    }

    // Return user session data
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar_url,
          provider: user.provider,
          public_key: user.public_key
        },
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    return res.status(500).json({
      success: false,
      error: 'OAuth exchange failed',
      message: error.message
    });
  }
});

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForTokens(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:1420/auth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const tokenParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString()
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorData}`);
  }

  return await response.json();
}

/**
 * Get user information from Google API
 */
async function getUserInfoFromGoogle(accessToken) {
  const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
  
  const response = await fetch(userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get user by email (helper function)
 */
async function getUserByEmail(email) {
  try {
    const { query } = await import('../lib/database.js');
    const result = await query('SELECT * FROM user_profiles WHERE email = $1', [email]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

/**
 * Generate a mock public key (in real app, this would be done client-side)
 */
function generateMockPublicKey() {
  // In a real implementation, the client would generate the key pair
  // and only send the public key to the server
  return `pk_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}