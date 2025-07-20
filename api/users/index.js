/**
 * User management endpoints
 * POST /api/users - Create new user profile
 * GET /api/users - Search users
 * GET /api/users/[id] - Get user by ID
 */

import { requireAuth, publicEndpoint } from '../lib/middleware.js';
import { insertUserProfile, searchUsers, getUserById } from '../lib/database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'POST':
      return requireAuth(createUser)(req, res);
    case 'GET':
      return publicEndpoint(handleGetUsers)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['POST', 'GET']
      });
  }
}

/**
 * Create a new user profile
 * Called during signup flow after auth provider creates the user
 */
async function createUser(req, res) {
  try {
    const {
      email,
      name,
      username,
      display_name,
      avatar_url,
      provider = 'email',
      public_key
    } = req.body;
    
    // Validate required fields
    if (!email || !public_key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missing: ['email', 'public_key'].filter(field => !req.body[field])
      });
    }
    
    // Use authenticated user's ID or generate new UUID
    const userId = req.user.userId || uuidv4();
    
    const userData = {
      id: userId,
      email,
      name,
      username,
      display_name,
      avatar_url,
      provider,
      public_key
    };
    
    const user = await insertUserProfile(userData);
    
    return res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        public_key: user.public_key,
        discoverable: user.discoverable,
        created_at: user.created_at
      }
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    
    // Handle duplicate username/email
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'Email or username already taken'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to create user',
      message: error.message
    });
  }
}

/**
 * Search users or get specific user
 */
async function handleGetUsers(req, res) {
  try {
    const { id, username, email, limit, offset } = req.query;
    
    // Get specific user by ID
    if (id) {
      const user = await getUserById(id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          public_key: user.public_key,
          discoverable: user.discoverable,
          created_at: user.created_at
        }
      });
    }
    
    // Search users
    const searchParams = {
      username,
      email,
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0
    };
    
    const users = await searchUsers(searchParams);
    
    return res.status(200).json({
      success: true,
      data: users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        public_key: user.public_key,
        created_at: user.created_at
      }))
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get users',
      message: error.message
    });
  }
}