/**
 * API handlers for entry access keys
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, transactionWithUser } from '../lib/database.js';

export const listAccessKeysHandler = requireAuth(async (c) => {
  try {
    const userId = c.get('auth').userId;
    
    const query = `
      SELECT 
        eak.id,
        eak.entry_id,
        eak.user_id,
        eak.encrypted_entry_key,
        eak.key_nonce,
        eak.created_at,
        e.author_id,
        e.is_published,
        e.title_hash,
        e.content_preview_hash,
        up.name as author_name,
        up.username as author_username,
        up.display_name as author_display_name
      FROM entry_access_keys eak
      JOIN entries e ON eak.entry_id = e.id
      JOIN user_profiles up ON e.author_id = up.id
      WHERE eak.user_id = get_current_user_id()
      ORDER BY eak.created_at DESC
    `;
    
    const result = await queryWithUser(userId, query);
    
    return c.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        entry_id: row.entry_id,
        user_id: row.user_id,
        encrypted_entry_key: row.encrypted_entry_key,
        key_nonce: row.key_nonce,
        created_at: row.created_at,
        entry: {
          author_id: row.author_id,
          is_published: row.is_published,
          title_hash: row.title_hash,
          content_preview_hash: row.content_preview_hash
        },
        author: {
          id: row.author_id,
          name: row.author_name,
          username: row.author_username,
          display_name: row.author_display_name
        }
      }))
    });
    
  } catch (error) {
    console.error('List access keys error:', error);
    return c.json({
      success: false,
      error: 'Failed to list access keys',
      message: error.message
    }, 500);
  }
});

export const createBatchAccessKeysHandler = requireAuth(async (c) => {
  try {
    const userId = c.get('auth').userId;
    const { entry_id, access_keys } = await c.req.json();
    
    // Validate required fields
    if (!entry_id || !access_keys || !Array.isArray(access_keys)) {
      return c.json({
        success: false,
        error: 'entry_id and access_keys array are required'
      }, 400);
    }
    
    if (access_keys.length === 0) {
      return c.json({
        success: false,
        error: 'At least one access key must be provided'
      }, 400);
    }
    
    // Validate access keys structure
    for (const key of access_keys) {
      if (!key.user_id || !key.encrypted_entry_key || !key.key_nonce) {
        return c.json({
          success: false,
          error: 'Each access key must have user_id, encrypted_entry_key, and key_nonce'
        }, 400);
      }
    }
    
    // Verify the user is the author of the entry
    const entryCheck = await queryWithUser(userId, 
      'SELECT author_id FROM entries WHERE id = $1', 
      [entry_id]
    );
    
    if (entryCheck.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found'
      }, 404);
    }
    
    if (entryCheck.rows[0].author_id !== userId) {
      return c.json({
        success: false,
        error: 'Only entry authors can create access keys'
      }, 403);
    }
    
    // Create insert queries for batch operation
    const insertQueries = access_keys.map(key => ({
      text: `
        INSERT INTO entry_access_keys (entry_id, user_id, encrypted_entry_key, key_nonce)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (entry_id, user_id) 
        DO UPDATE SET 
          encrypted_entry_key = EXCLUDED.encrypted_entry_key,
          key_nonce = EXCLUDED.key_nonce
        RETURNING *
      `,
      params: [entry_id, key.user_id, key.encrypted_entry_key, key.key_nonce]
    }));
    
    const results = await transactionWithUser(userId, insertQueries);
    const createdKeys = results.map(r => r.rows[0]);
    
    console.log(`Successfully created/updated ${createdKeys.length} access keys for entry ${entry_id}`);
    
    return c.json({
      success: true,
      data: createdKeys.map(key => ({
        id: key.id,
        entry_id: key.entry_id,
        user_id: key.user_id,
        encrypted_entry_key: key.encrypted_entry_key,
        key_nonce: key.key_nonce,
        created_at: key.created_at
      })),
      message: `Created ${createdKeys.length} access keys`
    }, 201);
    
  } catch (error) {
    console.error('Create batch access keys error:', error);
    return c.json({
      success: false,
      error: 'Failed to create access keys',
      message: error.message
    }, 500);
  }
});

export const getEntryAccessKeyHandler = requireAuth(async (c) => {
  try {
    const userId = c.get('auth').userId;
    const { entry_id } = c.req.param();
    
    if (!entry_id) {
      return c.json({
        success: false,
        error: 'entry_id is required'
      }, 400);
    }
    
    const query = `
      SELECT 
        eak.id,
        eak.entry_id,
        eak.user_id,
        eak.encrypted_entry_key,
        eak.key_nonce,
        eak.created_at,
        e.author_id,
        e.is_published,
        up.name as author_name,
        up.username as author_username
      FROM entry_access_keys eak
      JOIN entries e ON eak.entry_id = e.id
      JOIN user_profiles up ON e.author_id = up.id
      WHERE eak.entry_id = $1 AND eak.user_id = get_current_user_id()
    `;
    
    const result = await queryWithUser(userId, query, [entry_id]);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Access key not found or access denied'
      }, 404);
    }
    
    const row = result.rows[0];
    
    return c.json({
      success: true,
      data: {
        id: row.id,
        entry_id: row.entry_id,
        user_id: row.user_id,
        encrypted_entry_key: row.encrypted_entry_key,
        key_nonce: row.key_nonce,
        created_at: row.created_at,
        entry: {
          author_id: row.author_id,
          is_published: row.is_published
        },
        author: {
          id: row.author_id,
          name: row.author_name,
          username: row.author_username
        }
      }
    });
    
  } catch (error) {
    console.error('Get entry access key error:', error);
    return c.json({
      success: false,
      error: 'Failed to get access key',
      message: error.message
    }, 500);
  }
});

export const revokeAccessKeyHandler = requireAuth(async (c) => {
  try {
    const userId = c.get('auth').userId;
    const { entry_id, user_id } = c.req.param();
    
    if (!entry_id || !user_id) {
      return c.json({
        success: false,
        error: 'entry_id and user_id are required in the URL'
      }, 400);
    }
    
    // First verify the current user is the entry author OR is revoking their own access
    const entryQuery = `
      SELECT author_id FROM entries WHERE id = $1
    `;
    
    const entryResult = await queryWithUser(userId, entryQuery, [entry_id]);
    
    if (entryResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found'
      }, 404);
    }
    
    const isAuthor = entryResult.rows[0].author_id === userId;
    const isRevokingOwnAccess = user_id === userId;
    
    if (!isAuthor && !isRevokingOwnAccess) {
      return c.json({
        success: false,
        error: 'Only entry authors can revoke access, or users can revoke their own access'
      }, 403);
    }
    
    // Delete the access key
    const deleteQuery = `
      DELETE FROM entry_access_keys 
      WHERE entry_id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const deleteResult = await queryWithUser(userId, deleteQuery, [entry_id, user_id]);
    
    if (deleteResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Access key not found'
      }, 404);
    }
    
    console.log(`Access revoked: entry ${entry_id} for user ${user_id} by ${userId}`);
    
    return c.json({
      success: true,
      message: 'Access key revoked successfully',
      data: {
        entry_id: entry_id,
        revoked_user_id: user_id,
        revoked_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Revoke access key error:', error);
    return c.json({
      success: false,
      error: 'Failed to revoke access key',
      message: error.message
    }, 500);
  }
});
