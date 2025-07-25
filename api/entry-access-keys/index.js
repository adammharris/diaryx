/**
 * Entry Access Keys endpoints
 * GET /api/entry-access-keys - List user's access keys
 * POST /api/entry-access-keys/batch - Bulk create access keys (for sharing)
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, transactionWithUser } from '../lib/database.js';

export default async function handler(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'GET':
      return requireAuth(listAccessKeys)(req, res);
    case 'POST':
      return requireAuth(createBatchAccessKeys)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST']
      });
  }
}

/**
 * Get all access keys for the current user
 * Returns entries the user has access to (both owned and shared)
 */
async function listAccessKeys(req, res) {
  try {
    const userId = req.user.userId;
    
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
    
    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      error: 'Failed to list access keys',
      message: error.message
    });
  }
}

/**
 * Bulk create access keys for sharing an entry with multiple users
 * Used by the entry sharing service
 */
async function createBatchAccessKeys(req, res) {
  try {
    const userId = req.user.userId;
    const { entry_id, access_keys } = req.body;
    
    // Validate required fields
    if (!entry_id || !access_keys || !Array.isArray(access_keys)) {
      return res.status(400).json({
        success: false,
        error: 'entry_id and access_keys array are required'
      });
    }
    
    if (access_keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one access key must be provided'
      });
    }
    
    // Validate access keys structure
    for (const key of access_keys) {
      if (!key.user_id || !key.encrypted_entry_key || !key.key_nonce) {
        return res.status(400).json({
          success: false,
          error: 'Each access key must have user_id, encrypted_entry_key, and key_nonce'
        });
      }
    }
    
    // Verify the user is the author of the entry
    const entryCheck = await queryWithUser(userId, 
      'SELECT author_id FROM entries WHERE id = $1', 
      [entry_id]
    );
    
    if (entryCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    if (entryCheck.rows[0].author_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only entry authors can create access keys'
      });
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
    
    return res.status(201).json({
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
    });
    
  } catch (error) {
    console.error('Create batch access keys error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create access keys',
      message: error.message
    });
  }
}