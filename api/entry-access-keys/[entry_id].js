/**
 * Individual Entry Access Key endpoints
 * GET /api/entry-access-keys/{entry_id} - Get access key for specific entry
 * DELETE /api/entry-access-keys/{entry_id}/{user_id} - Revoke access (requires user_id in URL)
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser } from '../lib/database.js';

export default async function handler(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'GET':
      return requireAuth(getEntryAccessKey)(req, res);
    case 'DELETE':
      return requireAuth(revokeAccessKey)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['GET', 'DELETE']
      });
  }
}

/**
 * Get access key for a specific entry (for current user)
 */
async function getEntryAccessKey(req, res) {
  try {
    const userId = req.user.userId;
    const { entry_id } = req.query;
    
    if (!entry_id) {
      return res.status(400).json({
        success: false,
        error: 'entry_id is required'
      });
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
      return res.status(404).json({
        success: false,
        error: 'Access key not found or access denied'
      });
    }
    
    const row = result.rows[0];
    
    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      error: 'Failed to get access key',
      message: error.message
    });
  }
}

/**
 * Revoke access key for a specific entry and user
 * URL format: DELETE /api/entry-access-keys/{entry_id}?user_id={user_id}
 * Or can be extended to: DELETE /api/entry-access-keys/{entry_id}/{user_id}
 */
async function revokeAccessKey(req, res) {
  try {
    const userId = req.user.userId;
    const { entry_id } = req.query;
    const target_user_id = req.query.user_id || req.body.user_id;
    
    if (!entry_id) {
      return res.status(400).json({
        success: false,
        error: 'entry_id is required'
      });
    }
    
    if (!target_user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required (query param or request body)'
      });
    }
    
    // First verify the current user is the entry author OR is revoking their own access
    const entryQuery = `
      SELECT author_id FROM entries WHERE id = $1
    `;
    
    const entryResult = await queryWithUser(userId, entryQuery, [entry_id]);
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    const isAuthor = entryResult.rows[0].author_id === userId;
    const isRevokingOwnAccess = target_user_id === userId;
    
    if (!isAuthor && !isRevokingOwnAccess) {
      return res.status(403).json({
        success: false,
        error: 'Only entry authors can revoke access, or users can revoke their own access'
      });
    }
    
    // Delete the access key
    const deleteQuery = `
      DELETE FROM entry_access_keys 
      WHERE entry_id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const deleteResult = await queryWithUser(userId, deleteQuery, [entry_id, target_user_id]);
    
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Access key not found'
      });
    }
    
    console.log(`Access revoked: entry ${entry_id} for user ${target_user_id} by ${userId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Access key revoked successfully',
      data: {
        entry_id: entry_id,
        revoked_user_id: target_user_id,
        revoked_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Revoke access key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to revoke access key',
      message: error.message
    });
  }
}