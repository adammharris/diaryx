/**
 * Individual entry management
 * GET /api/entries/[id] - Get entry with access key
 * PUT /api/entries/[id] - Update entry
 * DELETE /api/entries/[id] - Delete entry
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, transactionWithUser } from '../lib/database.js';

/**
 * Validate encrypted data format and integrity
 */
function validateEncryptedData(data) {
  const { encrypted_title, encrypted_content, encryption_metadata, title_hash } = data;
  
  // Check required fields
  if (!encrypted_title || !encrypted_content || !encryption_metadata || !title_hash) {
    return { valid: false, error: 'Missing required encrypted fields' };
  }
  
  // Validate Base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(encrypted_title) || !base64Regex.test(encrypted_content)) {
    return { valid: false, error: 'Invalid Base64 format in encrypted data' };
  }
  
  // Check minimum lengths for security
  if (encrypted_title.length < 20 || encrypted_content.length < 20) {
    return { valid: false, error: 'Encrypted data too short' };
  }
  
  // Validate encryption metadata structure
  try {
    const metadata = typeof encryption_metadata === 'string' 
      ? JSON.parse(encryption_metadata) 
      : encryption_metadata;
    
    if (!metadata.contentNonceB64 || !metadata.version) {
      return { valid: false, error: 'Invalid encryption metadata structure' };
    }
    
    if (!base64Regex.test(metadata.contentNonceB64)) {
      return { valid: false, error: 'Invalid nonce format in metadata' };
    }
  } catch (error) {
    return { valid: false, error: 'Invalid encryption metadata JSON' };
  }
  
  return { valid: true };
}

export default async function handler(req, res) {
  const { method, query } = req;
  const { id } = query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Entry ID is required'
    });
  }
  
  switch (method) {
    case 'GET':
      return requireAuth(getEntry)(req, res);
    case 'PUT':
      return requireAuth(updateEntry)(req, res);
    case 'DELETE':
      return requireAuth(deleteEntry)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['GET', 'PUT', 'DELETE']
      });
  }
}

/**
 * Get entry with decryption key and metadata
 * Includes additional conflict detection metadata
 */
async function getEntry(req, res) {
  try {
    const { id } = req.query;
    const userId = req.user.userId;
    
    // Get entry with access key and author info
    // RLS will automatically filter if user doesn't have access
    const text = `
      SELECT 
        e.*,
        eak.encrypted_entry_key,
        eak.key_nonce,
        eak.created_at as access_granted_at,
        up.name as author_name,
        up.username as author_username,
        up.public_key as author_public_key,
        EXTRACT(EPOCH FROM e.updated_at) as updated_at_timestamp
      FROM entries e
      LEFT JOIN entry_access_keys eak ON e.id = eak.entry_id AND eak.user_id = $2
      LEFT JOIN user_profiles up ON e.author_id = up.id
      WHERE e.id = $1
    `;
    
    const result = await queryWithUser(userId, text, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found or access denied'
      });
    }
    
    const entry = result.rows[0];
    
    // Get tags for this entry
    const tagQuery = `
      SELECT t.id, t.name, t.slug, t.color
      FROM entry_tags et
      JOIN tags t ON et.tag_id = t.id
      WHERE et.entry_id = $1
    `;
    
    const tagResult = await queryWithUser(userId, tagQuery, [id]);
    
    return res.status(200).json({
      success: true,
      data: {
        id: entry.id,
        author_id: entry.author_id,
        encrypted_title: entry.encrypted_title,
        encrypted_content: entry.encrypted_content,
        encrypted_frontmatter: entry.encrypted_frontmatter,
        encryption_metadata: entry.encryption_metadata,
        title_hash: entry.title_hash,
        content_preview_hash: entry.content_preview_hash,
        is_published: entry.is_published,
        file_path: entry.file_path,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        updated_at_timestamp: entry.updated_at_timestamp, // For conflict detection
        access_key: entry.encrypted_entry_key ? {
          encrypted_entry_key: entry.encrypted_entry_key,
          key_nonce: entry.key_nonce,
          granted_at: entry.access_granted_at
        } : null,
        author: {
          id: entry.author_id,
          name: entry.author_name,
          username: entry.author_username,
          public_key: entry.author_public_key
        },
        tags: tagResult.rows.map(tag => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color
        }))
      }
    });
    
  } catch (error) {
    console.error('Get entry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get entry',
      message: error.message
    });
  }
}

/**
 * Update entry (only authors can update their entries - enforced by RLS)
 * Includes conflict detection and optimistic locking
 */
async function updateEntry(req, res) {
  try {
    const { id } = req.query;
    const userId = req.user.userId;
    const {
      encrypted_title,
      encrypted_content,
      encrypted_frontmatter,
      encryption_metadata,
      title_hash,
      content_preview_hash,
      is_published,
      file_path,
      tag_ids,
      client_modified_at, // Client's last known modification time for conflict detection
      if_unmodified_since // HTTP-style conditional update
    } = req.body;

    // Validate encrypted data if provided
    if (encrypted_title || encrypted_content || encryption_metadata || title_hash) {
      const validation = validateEncryptedData({
        encrypted_title: encrypted_title || 'dummy', // Use dummy for validation if not updating
        encrypted_content: encrypted_content || 'dummy',
        encryption_metadata: encryption_metadata || '{"contentNonceB64":"dummy","version":"1"}',
        title_hash: title_hash || 'dummy'
      });
      
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid encrypted data',
          details: validation.error
        });
      }
    }

    // First, get current entry state for conflict detection
    const currentEntryQuery = 'SELECT updated_at, encrypted_content FROM entries WHERE id = $1';
    const currentEntryResult = await queryWithUser(userId, currentEntryQuery, [id]);
    
    if (currentEntryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found or unauthorized'
      });
    }
    
    const currentEntry = currentEntryResult.rows[0];
    const serverModifiedTime = new Date(currentEntry.updated_at);
    
    // Conflict detection: Check if another client has modified the entry
    // client_modified_at = when the client last modified this entry locally
    // serverModifiedTime = when the server last updated this entry
    if (client_modified_at) {
      const clientModifiedTime = new Date(client_modified_at);
      const timeDifferenceMs = serverModifiedTime.getTime() - clientModifiedTime.getTime();
      
      console.log('Conflict detection check:', {
        entryId: id,
        serverLastModified: serverModifiedTime.toISOString(),
        clientLastModified: clientModifiedTime.toISOString(),
        timeDifferenceMs: timeDifferenceMs,
        interpretation: timeDifferenceMs > 0 ? 'server newer than client' : 'client newer than server'
      });
      
      // Conflict occurs when server was modified AFTER the client's last modification
      // This indicates another client/user modified the entry since this client's last change
      if (timeDifferenceMs > 1000) { // 1 second tolerance for clock skew
        console.warn('Sync conflict detected - entry modified by another client:', {
          entryId: id,
          serverLastModified: serverModifiedTime.toISOString(),
          clientLastModified: clientModifiedTime.toISOString(),
          timeDifferenceMs: timeDifferenceMs
        });
        
        return res.status(409).json({
          success: false,
          error: 'Conflict detected',
          message: 'Entry has been modified by another client since your last change',
          server_modified_at: serverModifiedTime.toISOString(),
          client_modified_at: client_modified_at,
          conflict_type: 'modification_time',
          time_difference_ms: timeDifferenceMs
        });
      } else {
        console.log('No conflict - allowing update:', {
          entryId: id,
          timeDifferenceMs: timeDifferenceMs,
          reason: timeDifferenceMs > 0 
            ? (timeDifferenceMs <= 1000 ? 'within clock skew tolerance' : 'server significantly newer') 
            : 'client modification is newer'
        });
      }
    }
    
    // HTTP-style conditional update support
    if (if_unmodified_since) {
      const ifUnmodifiedTime = new Date(if_unmodified_since);
      
      if (serverModifiedTime > ifUnmodifiedTime) {
        return res.status(412).json({
          success: false,
          error: 'Precondition failed',
          message: 'Entry has been modified since the specified time',
          server_modified_at: serverModifiedTime.toISOString(),
          if_unmodified_since: if_unmodified_since
        });
      }
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    if (encrypted_title !== undefined) {
      paramCount++;
      updates.push(`encrypted_title = $${paramCount}`);
      values.push(encrypted_title);
    }
    
    if (encrypted_content !== undefined) {
      paramCount++;
      updates.push(`encrypted_content = $${paramCount}`);
      values.push(encrypted_content);
    }
    
    if (encrypted_frontmatter !== undefined) {
      paramCount++;
      updates.push(`encrypted_frontmatter = $${paramCount}`);
      values.push(encrypted_frontmatter);
    }
    
    if (encryption_metadata !== undefined) {
      paramCount++;
      updates.push(`encryption_metadata = $${paramCount}`);
      values.push(JSON.stringify(encryption_metadata)); // Must be JSON string for PostgreSQL
    }
    
    if (title_hash !== undefined) {
      paramCount++;
      updates.push(`title_hash = $${paramCount}`);
      values.push(title_hash);
    }
    
    if (content_preview_hash !== undefined) {
      paramCount++;
      updates.push(`content_preview_hash = $${paramCount}`);
      values.push(content_preview_hash);
    }
    
    if (is_published !== undefined) {
      paramCount++;
      updates.push(`is_published = $${paramCount}`);
      values.push(is_published);
    }
    
    if (file_path !== undefined) {
      paramCount++;
      updates.push(`file_path = $${paramCount}`);
      values.push(file_path);
    }
    
    if (updates.length === 0 && tag_ids === undefined) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    const queries = [];
    
    // Update entry if there are field changes
    if (updates.length > 0) {
      paramCount++;
      paramCount++; // For the WHERE condition timestamp check
      values.push(id);
      values.push(serverModifiedTime.toISOString()); // Optimistic locking
      
      console.log('Preparing optimistic locking query:', {
        entryId: id,
        expectedTimestamp: serverModifiedTime.toISOString(),
        originalTimestamp: currentEntry.updated_at,
        timestampComparison: serverModifiedTime.toISOString() === new Date(currentEntry.updated_at).toISOString()
      });
      
      // Use optimistic locking by checking updated_at hasn't changed
      queries.push({
        text: `
          UPDATE entries 
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${paramCount - 1} AND updated_at = $${paramCount}
          RETURNING *
        `,
        params: values
      });
    }
    
    // Update tags if provided
    if (tag_ids !== undefined) {
      // Delete existing tags
      queries.push({
        text: 'DELETE FROM entry_tags WHERE entry_id = $1',
        params: [id]
      });
      
      // Add new tags
      for (const tagId of tag_ids) {
        queries.push({
          text: 'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2)',
          params: [id, tagId]
        });
      }
    }
    
    // If no entry updates, just get the current entry
    if (queries.length === 0 || queries[0].text.includes('DELETE')) {
      queries.unshift({
        text: 'SELECT * FROM entries WHERE id = $1',
        params: [id]
      });
    }
    
    const results = await transactionWithUser(userId, queries);
    const entry = results[0].rows[0];
    
    console.log('Update query executed:', {
      entryId: id,
      hasEntry: !!entry,
      queryType: queries[0]?.text?.includes('UPDATE') ? 'UPDATE' : 'OTHER'
    });
    
    if (!entry) {
      console.log('No entry returned from update - checking for optimistic lock failure');
      // Check if this was due to optimistic locking failure
      const recheckQuery = 'SELECT updated_at FROM entries WHERE id = $1';
      const recheckResult = await queryWithUser(userId, recheckQuery, [id]);
      
      if (recheckResult.rows.length > 0) {
        // Entry exists but optimistic lock failed
        const currentTime = recheckResult.rows[0].updated_at;
        console.error('Optimistic locking failure detected:', {
          entryId: id,
          expectedTimestamp: serverModifiedTime.toISOString(),
          actualTimestamp: currentTime,
          reason: 'Entry was modified between read and write'
        });
        
        return res.status(409).json({
          success: false,
          error: 'Concurrent modification detected',
          message: 'Entry was modified during update operation',
          server_modified_at: currentTime,
          conflict_type: 'concurrent_modification'
        });
      } else {
        // Entry not found or unauthorized
        return res.status(404).json({
          success: false,
          error: 'Entry not found or unauthorized'
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      data: {
        id: entry.id,
        author_id: entry.author_id,
        encrypted_title: entry.encrypted_title,
        encrypted_content: entry.encrypted_content,
        encrypted_frontmatter: entry.encrypted_frontmatter,
        encryption_metadata: entry.encryption_metadata,
        title_hash: entry.title_hash,
        content_preview_hash: entry.content_preview_hash,
        is_published: entry.is_published,
        file_path: entry.file_path,
        created_at: entry.created_at,
        updated_at: entry.updated_at
      }
    });
    
  } catch (error) {
    console.error('Update entry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update entry',
      message: error.message
    });
  }
}

/**
 * Delete entry (only authors can delete their entries - enforced by RLS)
 */
async function deleteEntry(req, res) {
  try {
    const { id } = req.query;
    const userId = req.user.userId;
    
    // Delete entry (cascading will remove access keys and tags)
    const text = 'DELETE FROM entries WHERE id = $1 RETURNING id';
    const result = await queryWithUser(userId, text, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found or unauthorized'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Entry deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete entry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete entry',
      message: error.message
    });
  }
}