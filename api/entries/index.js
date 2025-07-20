/**
 * Entry management endpoints
 * POST /api/entries - Create new entry with encryption
 * GET /api/entries - List user's entries
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, transactionWithUser } from '../lib/database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'POST':
      return requireAuth(createEntry)(req, res);
    case 'GET':
      return requireAuth(listEntries)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['POST', 'GET']
      });
  }
}

/**
 * Create a new encrypted entry
 * Expects: encrypted content + owner's encrypted entry key
 */
async function createEntry(req, res) {
  try {
    const userId = req.user.userId;
    const {
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
    } = req.body;

    if (encrypted_frontmatter == null) {
      encrypted_frontmatter = '';
    }
    
    // Validate required fields (NOT NULL in database schema)
    const required = [
      'encrypted_title',
      'encrypted_content', 
      'encryption_metadata',
      'title_hash',
      'owner_encrypted_entry_key',
      'owner_key_nonce'
    ];
    
    const missing = required.filter(field => {
      const value = req.body[field];
      return !value || value === null || value === undefined || value === '' || value === 'null' || value === 'NULL';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid required fields',
        missing,
        note: 'Required fields cannot be null, empty, or the string "null"'
      });
    }
    
    const entryId = uuidv4();
    
    // Helper function to safely handle null values
    const safeNull = (value) => {
      if (value === null || 
          value === undefined || 
          value === 'null' || 
          value === 'NULL' || 
          value === 'undefined' ||
          value === '') {
        return null;
      }
      return value;
    };

    // Debug: Log all parameter values to identify the NULL issue
    console.log('Entry creation parameters:', {
      entryId,
      userId,
      encrypted_title: encrypted_title ? 'present' : 'NULL/undefined',
      encrypted_content: encrypted_content ? 'present' : 'NULL/undefined', 
      encrypted_frontmatter: encrypted_frontmatter,
      encryption_metadata: encryption_metadata ? 'present' : 'NULL/undefined',
      title_hash: title_hash ? 'present' : 'NULL/undefined',
      content_preview_hash: content_preview_hash ? 'present' : 'NULL/undefined',
      is_published,
      file_path: file_path ? 'present' : 'NULL/undefined',
      owner_encrypted_entry_key: owner_encrypted_entry_key ? 'present' : 'NULL/undefined',
      owner_key_nonce: owner_key_nonce ? 'present' : 'NULL/undefined'
    });
    
    // Clean all parameters - note that some fields are NOT NULL in database
    const cleanParams = [
      entryId, 
      userId, 
      encrypted_title, // NOT NULL in DB - don't apply safeNull
      encrypted_content, // NOT NULL in DB - don't apply safeNull
      encrypted_frontmatter, // NOT NULL in DB - don't apply safeNull
      (() => {
        // encryption_metadata is NOT NULL in DB
        if (!encryption_metadata) {
          console.error('encryption_metadata is required but missing');
          throw new Error('encryption_metadata is required');
        }
        try {
          return JSON.stringify(encryption_metadata);
        } catch (e) {
          console.error('Failed to stringify encryption_metadata:', e);
          throw new Error('Invalid encryption_metadata format');
        }
      })(), // Convert object to JSON string, required field
      title_hash, // NOT NULL in DB - don't apply safeNull
      safeNull(content_preview_hash), // Can be NULL
      is_published, 
      safeNull(file_path) // Can be NULL
    ];

    console.log('Cleaned parameters for entries table:', cleanParams.map((p, i) => `$${i+1}: ${p === null ? 'NULL' : typeof p} ${p === null ? '' : '(' + String(p).substring(0, 20) + '...)'}`));
    
    // Additional validation to prevent SQL injection or malformed parameters
    const hasInvalidParams = cleanParams.some((param, index) => {
      if (typeof param === 'string' && (param.includes('NULL') || param.includes('undefined'))) {
        console.error(`Invalid parameter at position ${index + 1}: "${param}" - should be actual null value`);
        return true;
      }
      return false;
    });
    
    if (hasInvalidParams) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameter values detected'
      });
    }

    // Validate parameter count matches SQL placeholders
    const expectedParamCount = 10; // Number of $1, $2, ... $10 in the SQL
    if (cleanParams.length !== expectedParamCount) {
      console.error(`Parameter count mismatch: expected ${expectedParamCount}, got ${cleanParams.length}`);
      return res.status(500).json({
        success: false,
        error: 'Internal error: parameter count mismatch'
      });
    }

    // Use transaction to create entry + access key + tag associations
    const queries = [
      // 1. Insert entry
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
      
      // 2. Insert owner's access key
      {
        text: `
          INSERT INTO entry_access_keys (entry_id, user_id, encrypted_entry_key, key_nonce)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        params: [entryId, userId, owner_encrypted_entry_key, owner_key_nonce] // Both are NOT NULL in DB
      }
    ];
    
    // 3. Add tag associations if provided
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
    
    return res.status(201).json({
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
    });
    
  } catch (error) {
    console.error('Create entry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create entry',
      message: error.message
    });
  }
}

/**
 * List entries accessible to the user
 * Includes own entries + shared entries
 */
async function listEntries(req, res) {
  try {
    const userId = req.user.userId;
    const {
      limit = 50,
      offset = 0,
      is_published,
      tag_ids,
      created_after,
      created_before
    } = req.query;
    
    let whereClause = '';
    const params = [];
    let paramCount = 0;
    
    // Filter by publication status
    if (is_published !== undefined) {
      paramCount++;
      whereClause += ` AND e.is_published = $${paramCount}`;
      params.push(is_published === 'true');
    }
    
    // Filter by creation date range
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
    
    // Filter by tags
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
    
    // Query entries with access keys
    // RLS will automatically filter to only accessible entries
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
    
    const result = await queryWithUser(userId, text, params);
    
    // Also get tags for each entry
    const entryIds = result.rows.map(row => row.id);
    let entryTags = [];
    
    if (entryIds.length > 0) {
      const tagQuery = `
        SELECT et.entry_id, t.id, t.name, t.slug, t.color
        FROM entry_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.entry_id = ANY($1)
      `;
      
      const tagResult = await queryWithUser(userId, tagQuery, [entryIds]);
      entryTags = tagResult.rows;
    }
    
    // Group tags by entry
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
    
    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      error: 'Failed to list entries',
      message: error.message
    });
  }
}