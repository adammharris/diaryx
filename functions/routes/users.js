/**
 * User handlers (Cloudflare Pages compatible)
 */

import { getUser, searchUsers } from '../lib/database.js';
import { authenticateUser } from '../lib/middleware.js';

/**
 * GET /api/users/:id - Get user by ID
 */
export async function getUserHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userId = c.req.param('id');
    const user = await getUser(userId, c.env);

    if (!user) {
      return c.json({ 
        success: false, 
        error: 'User not found' 
      }, 404);
    }

    return c.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch user' 
    }, 500);
  }
}

/**
 * PUT /api/users/:id - Update user
 */
export async function updateUserHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userId = c.req.param('id');
    
    // Only allow users to update themselves
    if (userId !== auth.userId) {
      return c.json({ 
        success: false, 
        error: 'Access denied' 
      }, 403);
    }

    const body = await c.req.json();
    // Implementation would go here
    
    return c.json({
      success: true,
      message: 'User update not implemented yet'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to update user' 
    }, 500);
  }
}

/**
 * GET /api/users/search - Search users
 */
export async function searchUsersHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { q } = c.req.query();
    
    if (!q || q.length < 2) {
      return c.json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      }, 400);
    }

    const users = await searchUsers(q, auth.userId, c.env);
    
    return c.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error searching users:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to search users' 
    }, 500);
  }
}
