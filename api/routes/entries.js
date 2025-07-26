/**
 * API handlers for entries
 */

import { v4 as uuidv4 } from 'uuid';
import { queryWithUser, transactionWithUser } from '../lib/database.js';
import { requireAuth } from '../lib/middleware.js';

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function validateEncryptedData(data) {
  const { encrypted_title, encrypted_content, encryption_metadata, title_hash, owner_encrypted_entry_key } = data;
  
  // Check required fields (for creation)
  if (!encrypted_title || !encrypted_content || !encryption_metadata || !title_hash || !owner_encrypted_entry_key) {
    return { valid: false, error: 'Missing required encrypted fields' };
  }
  
  // Validate Base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(encrypted_title) || 
      !base64Regex.test(encrypted_content) || 
      !base64Regex.test(owner_encrypted_entry_key)) {
    return { valid: false, error: 'Invalid Base64 format in encrypted data' };
  }
  
  // Check minimum lengths for security
  if (encrypted_title.length < 20 || 
      encrypted_content.length < 20 || 
      owner_encrypted_entry_key.length < 40) {
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

function validateEncryptedDataUpdate(data) {
  const { encrypted_title, encrypted_content, encryption_metadata, title_hash } = data;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  
  // Only validate fields that are provided (partial updates allowed)
  if (encrypted_title && (!base64Regex.test(encrypted_title) || encrypted_title.length < 20)) {
    return { valid: false, error: 'Invalid encrypted_title format or too short' };
  }
  
  if (encrypted_content && (!base64Regex.test(encrypted_content) || encrypted_content.length < 20)) {
    return { valid: false, error: 'Invalid encrypted_content format or too short' };
  }
  
  if (title_hash && !base64Regex.test(title_hash)) {
    return { valid: false, error: 'Invalid title_hash format' };
  }
  
  // Validate encryption metadata structure if provided
  if (encryption_metadata) {
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
  }
  
  return { valid: true };
}

// =============================================================================
// ENTRY HANDLERS
// =============================================================================

export const listEntriesHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const query = c.req.query();
    const {
      limit = '50',
      offset = '0',
      is_published,
      tag_ids,
      created_after,
      created_before
    } = query;
    
    let whereClause = '';
    const params = [];
    let paramCount = 0;
    
    if (is_published !== undefined) {
      paramCount++;
      whereClause += ` AND e.is_published = $${paramCount}`;
      params.push(is_published === 'true');
    }
    
    if (created_after) {
      paramCount++;
      whereClause += ` AND e.created_at >= $${paramCount}`;
      params.push(created_after);
    }
    
    if (created_before) {
      paramCount++;
      whereClause += ` AND e.created_at <= $${paramCount}`;
      params.push(created_before);
    }
    
    if (tag_ids) {
      const tagIdArray = Array.isArray(tag_ids) ? tag_ids : [tag_ids];
      paramCount++;
      whereClause += ` AND EXISTS (
        SELECT 1 FROM entry_tags et 
        WHERE et.entry_id = e.id AND et.tag_id = ANY($${paramCount})
      )`;
      params.push(tagIdArray);
    }
    
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;
    
    const text = `
      SELECT 
        e.*,
        eak.encrypted_entry_key,
        eak.key_nonce,
        eak.created_at as access_granted_at,
        up.name as author_name,
        up.username as author_username,
        up.public_key as author_public_key
      FROM entries e
      LEFT JOIN entry_access_keys eak ON e.id = eak.entry_id AND eak.user_id = get_current_user_id()
      LEFT JOIN user_profiles up ON e.author_id = up.id
      WHERE 1=1 ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await queryWithUser(auth.userId, text, params);
    
    // Get tags for each entry
    const entryIds = result.rows.map(row => row.id);
    let entryTags = [];
    
    if (entryIds.length > 0) {
      const tagQuery = `
        SELECT et.entry_id, t.id, t.name, t.slug, t.color
        FROM entry_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.entry_id = ANY($1)
      `;
      
      const tagResult = await queryWithUser(auth.userId, tagQuery, [entryIds]);
      entryTags = tagResult.rows;
    }
    
    const entriesWithTags = result.rows.map(entry => {
      const tags = entryTags.filter(tag => tag.entry_id === entry.id);
      
      return {
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
        tags: tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color
        }))
      };
    });
    
    return c.json({
      success: true,
      data: entriesWithTags,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: result.rows.length
      }
    });
    
  } catch (error) {
    console.error('List entries error:', error);
    return c.json({
      success: false,
      error: 'Failed to list entries',
      message: error.message
    }, 500);
  }
});

export const createEntryHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const body = await c.req.json();
    
    let {
      encrypted_title,
      encrypted_content,
      encrypted_frontmatter,
      encryption_metadata,
      title_hash,
      content_preview_hash,
      is_published = false,
      file_path,
      owner_encrypted_entry_key,
      owner_key_nonce,
      tag_ids = []
      // client_modified_at // For potential future conflict detection
    } = body;
    
    // Validate required fields
    const required = [
      'encrypted_title',
      'encrypted_content', 
      'encryption_metadata',
      'title_hash',
      'owner_encrypted_entry_key',
      'owner_key_nonce'
    ];
    
    const missing = required.filter(field => {
      const value = body[field];
      return !value || value === null || value === undefined || value === '' || value === 'null' || value === 'NULL';
    });
    
    if (missing.length > 0) {
      return c.json({
        success: false,
        error: 'Missing or invalid required fields',
        missing,
        note: 'Required fields cannot be null, empty, or the string "null"'
      }, 400);
    }

    // Validate encrypted data integrity
    const validation = validateEncryptedData({
      encrypted_title,
      encrypted_content,
      encryption_metadata,
      title_hash,
      owner_encrypted_entry_key
    });
    
    if (!validation.valid) {
      return c.json({
        success: false,
        error: 'Invalid encrypted data',
        details: validation.error
      }, 400);
    }

    // Validate owner_key_nonce format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(owner_key_nonce) || owner_key_nonce.length < 16) {
      return c.json({
        success: false,
        error: 'Invalid key nonce format'
      }, 400);
    }
    
    const entryId = uuidv4();
    const userId = auth.userId;
    
    const cleanParams = [
      entryId, 
      userId, 
      encrypted_title,
      encrypted_content,
      encrypted_frontmatter || null,
      JSON.stringify(encryption_metadata),
      title_hash,
      content_preview_hash || null,
      is_published, 
      file_path || null
    ];
    
    const queries = [
      {
        text: `
          INSERT INTO entries (
            id, author_id, encrypted_title, encrypted_content, encrypted_frontmatter,
            encryption_metadata, title_hash, content_preview_hash, is_published, file_path
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        params: cleanParams
      },
      {
        text: `
          INSERT INTO entry_access_keys (entry_id, user_id, encrypted_entry_key, key_nonce)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        params: [entryId, userId, owner_encrypted_entry_key, owner_key_nonce]
      }
    ];
    
    // Add tag associations if provided
    if (tag_ids.length > 0) {
      for (const tagId of tag_ids) {
        queries.push({
          text: 'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2)',
          params: [entryId, tagId]
        });
      }
    }
    
    const results = await transactionWithUser(userId, queries);
    const entry = results[0].rows[0];
    const accessKey = results[1].rows[0];
    
    return c.json({
      success: true,
      data: {
        entry: {
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
        },
        access_key: {
          id: accessKey.id,
          entry_id: accessKey.entry_id,
          user_id: accessKey.user_id,
          encrypted_entry_key: accessKey.encrypted_entry_key,
          key_nonce: accessKey.key_nonce,
          created_at: accessKey.created_at
        }
      }
    }, 201);
    
  } catch (error) {
    console.error('Create entry error:', error);
    return c.json({
      success: false,
      error: 'Failed to create entry',
      message: error.message
    }, 500);
  }
});

export const getEntryHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'Entry ID is required'
      }, 400);
    }
    
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
    
    const result = await queryWithUser(auth.userId, text, [id, auth.userId]);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found or access denied'
      }, 404);
    }
    
    const entry = result.rows[0];
    
    const tagQuery = `
      SELECT t.id, t.name, t.slug, t.color
      FROM entry_tags et
      JOIN tags t ON et.tag_id = t.id
      WHERE et.entry_id = $1
    `;
    
    const tagResult = await queryWithUser(auth.userId, tagQuery, [id]);
    
    return c.json({
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
        updated_at_timestamp: entry.updated_at_timestamp,
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
    return c.json({
      success: false,
      error: 'Failed to get entry',
      message: error.message
    }, 500);
  }
});

export const updateEntryHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    const body = await c.req.json();
    
    console.log('PUT /api/entries/:id request:', {
      id,
      userId: auth.userId,
      bodyKeys: Object.keys(body),
      bodySize: JSON.stringify(body).length,
      hasEncryptionKeys: {
        owner_encrypted_entry_key: !!body.owner_encrypted_entry_key,
        owner_key_nonce: !!body.owner_key_nonce,
        owner_encrypted_entry_key_length: body.owner_encrypted_entry_key?.length,
        owner_key_nonce_length: body.owner_key_nonce?.length
      }
    });
    
    if (!id) {
      return c.json({
        success: false,
        error: 'Entry ID is required'
      }, 400);
    }
    
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
      owner_encrypted_entry_key,
      owner_key_nonce
      // client_modified_at, // For potential future conflict detection
      // if_unmodified_since // HTTP-style conditional update
    } = body;

    // Validate encrypted data if provided (different validation for updates)
    if (encrypted_title || encrypted_content || encryption_metadata || title_hash) {
      const validation = validateEncryptedDataUpdate({
        encrypted_title,
        encrypted_content,
        encryption_metadata,
        title_hash
      });
      
      if (!validation.valid) {
        console.log('Validation failed:', validation.error);
        return c.json({
          success: false,
          error: 'Invalid encrypted data',
          details: validation.error
        }, 400);
      }
    }

    // Validate encryption keys if both are provided
    if (owner_encrypted_entry_key || owner_key_nonce) {
      // Both must be provided together
      if (!owner_encrypted_entry_key || !owner_key_nonce) {
        return c.json({
          success: false,
          error: 'Both owner_encrypted_entry_key and owner_key_nonce must be provided together'
        }, 400);
      }

      // Validate Base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(owner_encrypted_entry_key) || !base64Regex.test(owner_key_nonce)) {
        return c.json({
          success: false,
          error: 'Invalid Base64 format in encryption keys'
        }, 400);
      }

      // Check minimum lengths for security
      if (owner_encrypted_entry_key.length < 40 || owner_key_nonce.length < 16) {
        return c.json({
          success: false,
          error: 'Encryption keys too short'
        }, 400);
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
      values.push(JSON.stringify(encryption_metadata));
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
      return c.json({
        success: false,
        error: 'No valid fields to update'
      }, 400);
    }
    
    let query;
    let queryParams;
    
    if (updates.length > 0) {
      paramCount++;
      values.push(id);
      
      query = `
        UPDATE entries 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;
      queryParams = values;
    } else {
      // Only updating tags
      query = 'SELECT * FROM entries WHERE id = $1';
      queryParams = [id];
    }
    
    const queries = [];
    
    if (updates.length > 0) {
      queries.push({
        text: query,
        params: queryParams
      });
    }
    
    // Update tags if provided
    if (tag_ids !== undefined) {
      queries.push({
        text: 'DELETE FROM entry_tags WHERE entry_id = $1',
        params: [id]
      });
      
      for (const tagId of tag_ids) {
        queries.push({
          text: 'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2)',
          params: [id, tagId]
        });
      }
    }
    
    // Update encryption keys if provided
    if (owner_encrypted_entry_key && owner_key_nonce) {
      console.log('Updating encryption keys for entry:', {
        entryId: id,
        userId: auth.userId,
        encryptedKeyLength: owner_encrypted_entry_key.length,
        nonceLength: owner_key_nonce.length
      });
      
      queries.push({
        text: `
          INSERT INTO entry_access_keys (entry_id, user_id, encrypted_entry_key, key_nonce)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (entry_id, user_id) 
          DO UPDATE SET 
            encrypted_entry_key = EXCLUDED.encrypted_entry_key,
            key_nonce = EXCLUDED.key_nonce
        `,
        params: [id, auth.userId, owner_encrypted_entry_key, owner_key_nonce]
      });
    } else {
      console.log('No encryption keys provided for entry update:', {
        entryId: id,
        hasEncryptedKey: !!owner_encrypted_entry_key,
        hasNonce: !!owner_key_nonce
      });
    }
    
    // If no entry updates but need to get current entry for tags-only/keys-only update
    if (queries.length === 0 || (updates.length === 0 && (tag_ids !== undefined || (owner_encrypted_entry_key && owner_key_nonce)))) {
      queries.unshift({
        text: 'SELECT * FROM entries WHERE id = $1',
        params: [id]
      });
    }
    
    const results = await transactionWithUser(auth.userId, queries);
    const entry = results[0].rows[0];
    
    if (!entry) {
      return c.json({
        success: false,
        error: 'Entry not found or unauthorized'
      }, 404);
    }
    
    return c.json({
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
    return c.json({
      success: false,
      error: 'Failed to update entry',
      message: error.message
    }, 500);
  }
});

export const deleteEntryHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'Entry ID is required'
      }, 400);
    }
    
    const text = 'DELETE FROM entries WHERE id = $1 RETURNING id';
    const result = await queryWithUser(auth.userId, text, [id]);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found or unauthorized'
      }, 404);
    }
    
    return c.json({
      success: true,
      message: 'Entry deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete entry error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete entry',
      message: error.message
    }, 500);
  }
});

export const getSharedEntriesHandler = requireAuth(async (c) => {
    try {
    const userId = c.get('auth').userId;
    console.log('=== Shared Entries Debug ===');
    console.log('Current user ID:', userId);
    const {
      limit = 50,
      offset = 0,
      tag_ids,
      author_ids,
      created_after,
      created_before
    } = c.req.query();
    
    const params = [];
    let paramCount = 0;

    // User ID params must be first
    paramCount++;
    const userIdParam = paramCount;
    params.push(userId);

    paramCount++;
    const userIdParam2 = paramCount;
    params.push(userId);

    // Filter params
    let whereClause = '';
    if (tag_ids) {
      const tagIdArray = Array.isArray(tag_ids) ? tag_ids : [tag_ids];
      paramCount++;
      whereClause += ` AND EXISTS (
        SELECT 1 FROM entry_tags et 
        WHERE et.entry_id = e.id AND et.tag_id = ANY($${paramCount})
      )`;
      params.push(tagIdArray);
    }
    
    if (author_ids) {
      const authorIdArray = Array.isArray(author_ids) ? author_ids : [author_ids];
      paramCount++;
      whereClause += ` AND e.author_id = ANY($${paramCount})`;
      params.push(authorIdArray);
    }
    
    if (created_after) {
      paramCount++;
      whereClause += ` AND e.created_at >= $${paramCount}`;
      params.push(created_after);
    }
    
    if (created_before) {
      paramCount++;
      whereClause += ` AND e.created_at <= $${paramCount}`;
      params.push(created_before);
    }
    
    // Pagination params
    paramCount++;
    const limitParam = paramCount;
    params.push(parseInt(limit));

    paramCount++;
    const offsetParam = paramCount;
    params.push(parseInt(offset));
    
    const query = `
      SELECT 
        e.id,
        e.author_id,
        e.encrypted_title,
        e.encrypted_content,
        e.encrypted_frontmatter,
        e.encryption_metadata,
        e.title_hash,
        e.content_preview_hash,
        e.is_published,
        e.file_path,
        e.created_at,
        e.updated_at,
        eak.encrypted_entry_key,
        eak.key_nonce,
        eak.created_at as access_granted_at,
        up.name as author_name,
        up.username as author_username,
        up.display_name as author_display_name,
        up.public_key as author_public_key,
        get_current_user_id() as debug_current_user_id  -- Debug field
      FROM entries e
      JOIN entry_access_keys eak ON e.id = eak.entry_id
      JOIN user_profiles up ON e.author_id = up.id
      WHERE eak.user_id = $${userIdParam}
        AND e.author_id != $${userIdParam2}
        AND e.is_published = true
        ${whereClause}
      ORDER BY eak.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    
    const result = await queryWithUser(userId, query, params);
    
    console.log('Raw shared entries query result:', {
      rowCount: result.rows.length,
      queryUserId: userId,
      sampleFields: result.rows[0] ? Object.keys(result.rows[0]) : [],
      sampleRow: result.rows[0] ? {
        id: result.rows[0].id,
        author_id: result.rows[0].author_id,
        debug_current_user_id: result.rows[0].debug_current_user_id,
        encrypted_entry_key: result.rows[0].encrypted_entry_key,
        key_nonce: result.rows[0].key_nonce,
        author_public_key: result.rows[0].author_public_key
      } : null
    });
    
    // Debug: Check if any entries are being returned for the current user's own entries
    const ownEntries = result.rows.filter(row => row.author_id === userId);
    if (ownEntries.length > 0) {
      console.log('ERROR: Found own entries in shared results:', ownEntries.map(e => ({ id: e.id, author_id: e.author_id })));
    } else {
      console.log('SUCCESS: No own entries found in shared results');
    }
    
    // Get tags for each entry
    const entryIds = result.rows.map(row => row.id);
    let entryTags = [];
    
    if (entryIds.length > 0) {
      const tagQuery = `
        SELECT 
          et.entry_id,
          t.id,
          t.name,
          t.slug,
          t.color,
          t.author_id as tag_author_id
        FROM entry_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.entry_id = ANY($1)
      `;
      
      const tagResult = await queryWithUser(userId, tagQuery, [entryIds]);
      entryTags = tagResult.rows;
    }
    
    // Filter out any entries authored by current user (extra safety check)
    const filteredRows = result.rows.filter(entry => entry.author_id !== userId);
    
    if (result.rows.length !== filteredRows.length) {
      console.log('FILTERED OUT own entries:', result.rows.length - filteredRows.length);
    }

    // Format response with proper structure
    const entriesWithMetadata = filteredRows.map(entry => {
      const tags = entryTags.filter(tag => tag.entry_id === entry.id);
      
      return {
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
        // Access key information for decryption
        access_key: {
          encrypted_entry_key: entry.encrypted_entry_key,
          key_nonce: entry.key_nonce,
          granted_at: entry.access_granted_at
        },
        // Author information
        author: {
          id: entry.author_id,
          name: entry.author_name,
          username: entry.author_username,
          display_name: entry.author_display_name,
          public_key: entry.author_public_key
        },
        // Tags associated with this entry
        tags: tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color,
          author_id: tag.tag_author_id
        })),
        // Sharing metadata
        sharing: {
          shared_at: entry.access_granted_at,
          is_shared_entry: true
        }
      };
    });
    
    return c.json({
      success: true,
      data: entriesWithMetadata,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: filteredRows.length,
        has_more: filteredRows.length === parseInt(limit)
      },
      metadata: {
        total_shared_entries: filteredRows.length,
        unique_authors: [...new Set(filteredRows.map(r => r.author_id))].length
      }
    });
    
  } catch (error) {
    console.error('Get shared entries error:', error);
    return c.json({
      success: false,
      error: 'Failed to get shared entries',
      message: error.message
    });
  }
});
