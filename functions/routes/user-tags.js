/**
 * User-tag assignment handlers (Cloudflare Pages compatible)
 */

import { getUserTagAssignments, assignUserTag, removeUserTag } from '../lib/database.js';
import { authenticateUser } from '../lib/middleware.js';

/**
 * GET /api/user-tags - List user tag assignments
 */
export async function listUserTagsHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const assignments = await getUserTagAssignments(auth.userId, c.env);
    
    return c.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Error listing user tags:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch user tags' 
    }, 500);
  }
}

/**
 * POST /api/user-tags - Assign tag to user
 */
export async function assignUserTagHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { tagName } = body;

    if (!tagName) {
      return c.json({ 
        success: false, 
        error: 'Tag name is required' 
      }, 400);
    }

    const assignment = await assignUserTag(auth.userId, tagName, c.env);
    
    return c.json({
      success: true,
      data: assignment
    }, 201);
  } catch (error) {
    console.error('Error assigning user tag:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to assign tag' 
    }, 500);
  }
}

/**
 * DELETE /api/user-tags/:id - Remove user tag assignment
 */
export async function removeUserTagHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const assignmentId = c.req.param('id');
    const removed = await removeUserTag(assignmentId, auth.userId, c.env);

    if (!removed) {
      return c.json({ 
        success: false, 
        error: 'Assignment not found' 
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag assignment removed successfully'
    });
  } catch (error) {
    console.error('Error removing user tag:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to remove tag assignment' 
    }, 500);
  }
}
