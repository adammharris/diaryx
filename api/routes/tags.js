/**
 * API handlers for tags
 */

import { v4 as uuidv4 } from 'uuid';
import { queryWithUser } from '../lib/database.js';
import { requireAuth } from '../lib/middleware.js';

export const listTagsHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    
    const result = await queryWithUser(auth.userId, 
      'SELECT * FROM tags WHERE author_id = $1 ORDER BY created_at DESC',
      [auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('List tags error:', error);
    return c.json({
      success: false,
      error: 'Failed to get tags',
      message: error.message
    }, 500);
  }
});

export const createTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const { name, slug, color } = await c.req.json();

    if (!name || !slug || !color) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        message: 'Name, slug, and color are required'
      }, 400);
    }

    const tagId = uuidv4();
    const result = await queryWithUser(auth.userId,
      `INSERT INTO tags (id, name, slug, color, author_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [tagId, name, slug, color, auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to create tag',
      message: error.message
    }, 500);
  }
});

export const updateTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.param('id');
    const { name, slug, color } = await c.req.json();

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount}`);
      params.push(slug);
      paramCount++;
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount}`);
      params.push(color);
      paramCount++;
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update'
      }, 400);
    }

    updates.push(`updated_at = now()`);
    params.push(tagId, auth.userId);

    const result = await queryWithUser(auth.userId,
      `UPDATE tags SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND author_id = $${paramCount + 1} 
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to update it'
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to update tag',
      message: error.message
    }, 500);
  }
});

export const deleteTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.param('id');

    const result = await queryWithUser(auth.userId,
      'DELETE FROM tags WHERE id = $1 AND author_id = $2 RETURNING *',
      [tagId, auth.userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to delete it'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag deleted successfully'
    });
  } catch (error) {
    console.error('Delete tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete tag',
      message: error.message
    }, 500);
  }
});
