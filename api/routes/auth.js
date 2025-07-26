/**
 * API handlers for authentication
 */

import jwt from 'jsonwebtoken';
import { insertUserProfile, getUserById } from '../lib/database.js';

async function exchangeCodeForTokens(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

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

async function getUserByGoogleId(googleId) {
  try {
    const { query } = await import('../lib/database.js');
    const result = await query('SELECT * FROM user_profiles WHERE external_id = $1', [googleId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by Google ID:', error);
    return null;
  }
}

function generateMockPublicKey() {
  return `pk_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function googleAuthHandler(c) {
  if (c.req.method !== 'POST') {
    return c.json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['POST']
    }, 405);
  }

  try {
    const rawBody = await c.req.text();
    console.log('Raw request body:', rawBody);
    
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      console.error('Body content:', rawBody);
      return c.json({
        success: false,
        error: 'Invalid JSON in request body',
        details: jsonError.message
      }, 400);
    }
    
    const { code, state, redirectUri } = body;
    
    console.log('Parsed auth request:', {
      code: code ? 'present' : 'missing',
      state: state ? 'present' : 'missing', 
      redirectUri
    });

    if (!code) {
      return c.json({
        success: false,
        error: 'Authorization code is required'
      }, 400);
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code, redirectUri);
    
    if (!tokenResponse.access_token) {
      return c.json({
        success: false,
        error: 'Failed to exchange authorization code'
      }, 400);
    }

    // Get user info from Google
    const userInfo = await getUserInfoFromGoogle(tokenResponse.access_token);
    
    if (!userInfo.email) {
      return c.json({
        success: false,
        error: 'Failed to get user information from Google'
      }, 400);
    }

    // Generate public key for E2E encryption
    const publicKey = generateMockPublicKey();

    // Create or update user profile
    let user;
    const existingUser = await getUserByGoogleId(userInfo.id) || await getUserByEmail(userInfo.email);
    
    if (existingUser) {
      user = existingUser;
    } else {
      const userData = {
        id: generateUUID(),
        email: userInfo.email,
        name: userInfo.name,
        avatar_url: userInfo.picture,
        provider: 'google',
        public_key: publicKey,
        external_id: userInfo.id
      };
      
      user = await insertUserProfile(userData);
    }

    // Generate JWT token for our backend
    const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-here';
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        sub: user.id
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Verify the token we just created
    try {
      jwt.verify(jwtToken, jwtSecret);
    } catch (testError) {
      console.error('JWT verification test failed:', testError);
      throw new Error('Generated JWT token is invalid');
    }

    return c.json({
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
        access_token: jwtToken,
        refresh_token: tokenResponse.refresh_token,
        expires_in: 24 * 60 * 60
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    return c.json({
      success: false,
      error: 'OAuth exchange failed',
      message: error.message
    }, 500);
  }
}
