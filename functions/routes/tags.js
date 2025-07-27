/**
 * Tag handlers (Cloudflare Pages compatible)
 */

import { getUserTags, createTag, updateTag, deleteTag } from '../lib/database.js';
import { authenticateUser } from '../lib/middleware.js';

/**
 * GET /api/tags - List user tags
 */
export async function listTagsHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const tags = await getUserTags(auth.userId, c.env);
    
    return c.json({
      success: true,
      data: tags
    });
  } catch (error) {
    console.error('Error listing tags:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch tags' 
    }, 500);
  }
}

/**
 * POST /api/tags - Create new tag
 */
export async function createTagHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { name, color } = body;

    if (!name || !color) {
      return c.json({ 
        success: false, 
        error: 'Name and color are required' 
      }, 400);
    }

    const tag = await createTag(auth.userId, { name, color }, c.env);
    
    return c.json({
      success: true,
      data: tag
    }, 201);
  } catch (error) {
    console.error('Error creating tag:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to create tag' 
    }, 500);
  }
}

/**
 * PUT /api/tags/:id - Update tag
 */
export async function updateTagHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const tagName = c.req.param('id');
    const body = await c.req.json();
    const { color } = body;

    if (!color) {
      return c.json({ 
        success: false, 
        error: 'Color is required' 
      }, 400);
    }

    const updatedTag = await updateTag(auth.userId, tagName, { color }, c.env);

    if (!updatedTag) {
      return c.json({ 
        success: false, 
        error: 'Tag not found' 
      }, 404);
    }

    return c.json({
      success: true,
      data: updatedTag
    });
  } catch (error) {
    console.error('Error updating tag:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to update tag' 
    }, 500);
  }
}

/**
 * DELETE /api/tags/:id - Delete tag
 */
export async function deleteTagHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const tagName = c.req.param('id');
    const deleted = await deleteTag(auth.userId, tagName, c.env);

    if (!deleted) {
      return c.json({ 
        success: false, 
        error: 'Tag not found' 
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to delete tag' 
    }, 500);
  }
}
