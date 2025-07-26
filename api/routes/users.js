/**
 * API handlers for users
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, getUserById, searchUsers } from '../lib/database.js';

export const getUserHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }
    
    const user = await getUserById(id);
    
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }
    
    const isOwnProfile = auth.userId === id;
    
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

    if (isOwnProfile && user.encrypted_private_key) {
      responseData.encrypted_private_key = user.encrypted_private_key;
    }

    return c.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      success: false,
      error: 'Failed to get user',
      message: error.message
    }, 500);
  }
});

export const updateUserHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }
    
    if (id !== auth.userId) {
      return c.json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own profile'
      }, 403);
    }
    
    const body = await c.req.json();
    const {
      name,
      username,
      display_name,
      avatar_url,
      discoverable,
      public_key,
      encrypted_private_key
    } = body;
    
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
      return c.json({
        success: false,
        error: 'No valid fields to update'
      }, 400);
    }
    
    paramCount++;
    values.push(id);
    
    const text = `
      UPDATE user_profiles 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await queryWithUser(auth.userId, text, values);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User not found or unauthorized'
      }, 404);
    }
    
    const user = result.rows[0];
    
    return c.json({
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
    
    if (error.code === '23505') {
      return c.json({
        success: false,
        error: 'Username already taken'
      }, 409);
    }
    
    return c.json({
      success: false,
      error: 'Failed to update user',
      message: error.message
    }, 500);
  }
});

export async function searchUsersHandler(c) {
  try {
    const query = c.req.query();
    const { q, username, email, limit = '20', offset = '0' } = query;
    
    console.log('=== User Search Debug ===');
    console.log('Query params:', query);
    console.log('Extracted params:', { q, username, email, limit, offset });
    
    // Support both generic 'q' parameter and specific username/email
    const searchParams = {
      username: username || q,
      email: email || q,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    console.log('Search params to database:', searchParams);
    
    const users = await searchUsers(searchParams);
    
    console.log(`Found ${users.length} users`);
    console.log('First few users:', users.slice(0, 3));
    
    return c.json({
      success: true,
      users: users, // Frontend expects 'users' field
      total: users.length,
      hasMore: users.length >= parseInt(limit),
      pagination: {
        limit: searchParams.limit,
        offset: searchParams.offset,
        count: users.length
      }
    });
    
  } catch (error) {
    console.error('Search users error:', error);
    return c.json({
      success: false,
      error: 'Failed to search users',
      message: error.message
    }, 500);
  }
}
