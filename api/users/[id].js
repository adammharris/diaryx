/**
 * User profile management by ID
 * GET /api/users/[id] - Get user profile
 * PUT /api/users/[id] - Update user profile  
 * DELETE /api/users/[id] - Delete user profile
 */

import { requireAuth, publicEndpoint } from '../lib/middleware.js';
import { queryWithUser, getUserById } from '../lib/database.js';

export default async function handler(req, res) {
  const { method, query } = req;
  const { id } = query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'User ID is required'
    });
  }
  
  switch (method) {
    case 'GET':
      return publicEndpoint(getUser)(req, res);
    case 'PUT':
      return requireAuth(updateUser)(req, res);
    case 'DELETE':
      return requireAuth(deleteUser)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['GET', 'PUT', 'DELETE']
      });
  }
}

/**
 * Get user profile by ID
 */
async function getUser(req, res) {
  try {
    const { id } = req.query;
    
    const user = await getUserById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Only return public fields
    // Include encrypted private key only if user is viewing their own profile
    const isOwnProfile = req.user?.userId === id;
    const responseData = {
      id: user.id,
      name: user.name,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      public_key: user.public_key,
      discoverable: user.discoverable,
      created_at: user.created_at
    };

    // Only include encrypted_private_key for own profile
    if (isOwnProfile && user.encrypted_private_key) {
      responseData.encrypted_private_key = user.encrypted_private_key;
    }

    return res.status(200).json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user',
      message: error.message
    });
  }
}

/**
 * Update user profile
 * Users can only update their own profile (enforced by RLS)
 */
async function updateUser(req, res) {
  try {
    const { id } = req.query;
    const userId = req.user.userId;
    
    // Check if user is trying to update their own profile
    if (id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own profile'
      });
    }
    
    const {
      name,
      username,
      display_name,
      avatar_url,
      discoverable,
      public_key,
      encrypted_private_key
    } = req.body;
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name);
    }
    
    if (username !== undefined) {
      paramCount++;
      updates.push(`username = $${paramCount}`);
      values.push(username);
    }
    
    if (display_name !== undefined) {
      paramCount++;
      updates.push(`display_name = $${paramCount}`);
      values.push(display_name);
    }
    
    if (avatar_url !== undefined) {
      paramCount++;
      updates.push(`avatar_url = $${paramCount}`);
      values.push(avatar_url);
    }
    
    if (discoverable !== undefined) {
      paramCount++;
      updates.push(`discoverable = $${paramCount}`);
      values.push(discoverable);
    }
    
    if (public_key !== undefined) {
      paramCount++;
      updates.push(`public_key = $${paramCount}`);
      values.push(public_key);
    }
    
    if (encrypted_private_key !== undefined) {
      paramCount++;
      updates.push(`encrypted_private_key = $${paramCount}`);
      values.push(encrypted_private_key);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    paramCount++;
    values.push(id);
    
    const text = `
      UPDATE user_profiles 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await queryWithUser(userId, text, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found or unauthorized'
      });
    }
    
    const user = result.rows[0];
    
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
        updated_at: user.updated_at
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    
    // Handle duplicate username
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Username already taken'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to update user',
      message: error.message
    });
  }
}

/**
 * Delete user profile
 * Users can only delete their own profile (enforced by RLS)
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.query;
    const userId = req.user.userId;
    
    // Check if user is trying to delete their own profile
    if (id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only delete your own profile'
      });
    }
    
    const text = 'DELETE FROM user_profiles WHERE id = $1 RETURNING id';
    const result = await queryWithUser(userId, text, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found or unauthorized'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'User profile deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      message: error.message
    });
  }
}