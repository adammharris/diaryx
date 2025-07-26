/**
 * API handlers for user-tag assignments
 */

import { v4 as uuidv4 } from 'uuid';
import { queryWithUser } from '../lib/database.js';
import { requireAuth } from '../lib/middleware.js';

export const listUserTagsHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.query('tag_id');

    let query = `
      SELECT ut.*, t.name as tag_name, t.color as tag_color,
             up.id as target_user_id, up.username, up.display_name, up.email, up.avatar_url, up.public_key
      FROM user_tags ut
      JOIN tags t ON ut.tag_id = t.id
      JOIN user_profiles up ON ut.target_id = up.id
      WHERE ut.tagger_id = $1
    `;
    
    const params = [auth.userId];
    
    if (tagId) {
      query += ' AND ut.tag_id = $2';
      params.push(tagId);
    }
    
    query += ' ORDER BY ut.created_at DESC';

    const result = await queryWithUser(auth.userId, query, params);

    // Group by tag or return flat list
    const userTags = result.rows.map(row => ({
      id: row.id,
      tag_id: row.tag_id,
      target_id: row.target_id,
      tagger_id: row.tagger_id,
      created_at: row.created_at,
      tag: {
        id: row.tag_id,
        name: row.tag_name,
        color: row.tag_color
      },
      target_user: {
        id: row.target_user_id,
        username: row.username,
        display_name: row.display_name,
        email: row.email,
        avatar_url: row.avatar_url,
        public_key: row.public_key
      }
    }));

    return c.json({
      success: true,
      data: userTags
    });
  } catch (error) {
    console.error('List user tags error:', error);
    return c.json({
      success: false,
      error: 'Failed to get user tags',
      message: error.message
    }, 500);
  }
});

export const assignUserTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const { tag_id, target_id } = await c.req.json();

    if (!tag_id || !target_id) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        message: 'tag_id and target_id are required'
      }, 400);
    }

    // Verify the tag belongs to the current user
    const tagResult = await queryWithUser(auth.userId,
      'SELECT id FROM tags WHERE id = $1 AND author_id = $2',
      [tag_id, auth.userId]
    );

    if (tagResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to assign it'
      }, 404);
    }

    // Verify the target user exists and is discoverable
    const userResult = await queryWithUser(auth.userId,
      'SELECT id FROM user_profiles WHERE id = $1 AND discoverable = true',
      [target_id]
    );

    if (userResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User not found',
        message: 'Target user not found or not discoverable'
      }, 404);
    }

    const userTagId = uuidv4();
    const result = await queryWithUser(auth.userId,
      `INSERT INTO user_tags (id, tagger_id, target_id, tag_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [userTagId, auth.userId, target_id, tag_id]
    );

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Assign user tag error:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return c.json({
        success: false,
        error: 'Tag already assigned',
        message: 'This tag is already assigned to this user'
      }, 409);
    }

    return c.json({
      success: false,
      error: 'Failed to assign tag',
      message: error.message
    }, 500);
  }
});

export const removeUserTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const userTagId = c.req.param('id');

    const result = await queryWithUser(auth.userId,
      'DELETE FROM user_tags WHERE id = $1 AND tagger_id = $2 RETURNING *',
      [userTagId, auth.userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User tag assignment not found',
        message: 'Assignment not found or you do not have permission to remove it'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag assignment removed successfully'
    });
  } catch (error) {
    console.error('Remove user tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to remove tag assignment',
      message: error.message
    }, 500);
  }
});
