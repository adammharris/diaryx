/**
 * Entry access key handlers (Cloudflare Pages compatible)
 */

import { getEntryAccessKeys, createBatchAccessKeys, revokeAccessKey } from '../lib/database.js';
import { authenticateUser } from '../lib/middleware.js';

/**
 * GET /api/entry-access-keys - List access keys for user's entries
 */
export async function listAccessKeysHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // This would need to be implemented to list all access keys for user's entries
    // For now, return empty array
    return c.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error listing access keys:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch access keys' 
    }, 500);
  }
}

/**
 * POST /api/entry-access-keys/batch - Create access keys for multiple users
 */
export async function createBatchAccessKeysHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { entryId, userIds } = body;

    if (!entryId || !userIds || !Array.isArray(userIds)) {
      return c.json({ 
        success: false, 
        error: 'Entry ID and array of user IDs are required' 
      }, 400);
    }

    const accessKeys = await createBatchAccessKeys(entryId, userIds, auth.userId, c.env);
    
    return c.json({
      success: true,
      data: accessKeys
    }, 201);
  } catch (error) {
    console.error('Error creating access keys:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to create access keys' 
    }, 500);
  }
}

/**
 * GET /api/entry-access-keys/:entry_id - Get access keys for specific entry
 */
export async function getEntryAccessKeyHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entryId = c.req.param('entry_id');
    const accessKeys = await getEntryAccessKeys(entryId, auth.userId, c.env);
    
    return c.json({
      success: true,
      data: accessKeys
    });
  } catch (error) {
    console.error('Error fetching entry access keys:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch access keys' 
    }, 500);
  }
}

/**
 * DELETE /api/entry-access-keys/:entry_id/:user_id - Revoke access key
 */
export async function revokeAccessKeyHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entryId = c.req.param('entry_id');
    const userId = c.req.param('user_id');
    
    const revoked = await revokeAccessKey(entryId, userId, auth.userId, c.env);

    if (!revoked) {
      return c.json({ 
        success: false, 
        error: 'Access key not found or access denied' 
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Access key revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking access key:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to revoke access key' 
    }, 500);
  }
}
