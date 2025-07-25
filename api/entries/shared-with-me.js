/**
 * Shared Entries endpoint
 * GET /api/entries/shared-with-me - Get entries shared with current user
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser } from '../lib/database.js';

export default async function handler(req, res) {
  const { method } = req;
  
  if (method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['GET']
    });
  }
  
  return requireAuth(getSharedEntries)(req, res);
}

/**
 * Get entries shared with the current user
 * Excludes entries authored by the current user (those are "owned", not "shared")
 * Returns encrypted entries with access keys for decryption
 */
async function getSharedEntries(req, res) {
  try {
    const userId = req.user.userId;
    const {
      limit = 50,
      offset = 0,
      tag_ids,
      author_ids,
      created_after,
      created_before
    } = req.query;
    
    let whereClause = '';
    const params = [];
    let paramCount = 0;
    
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
    
    // Filter by authors
    if (author_ids) {
      const authorIdArray = Array.isArray(author_ids) ? author_ids : [author_ids];
      paramCount++;
      whereClause += ` AND e.author_id = ANY($${paramCount})`;
      params.push(authorIdArray);
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
    
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;
    
    // Main query: Get shared entries with access keys and author info
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
        up.public_key as author_public_key
      FROM entries e
      JOIN entry_access_keys eak ON e.id = eak.entry_id
      JOIN user_profiles up ON e.author_id = up.id
      WHERE eak.user_id = get_current_user_id()
        AND e.author_id != get_current_user_id()  -- Exclude own entries
        AND e.is_published = true                 -- Only published entries can be shared
        ${whereClause}
      ORDER BY eak.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await queryWithUser(userId, query, params);
    
    console.log('Raw shared entries query result:', {
      rowCount: result.rows.length,
      sampleFields: result.rows[0] ? Object.keys(result.rows[0]) : [],
      sampleRow: result.rows[0] ? {
        id: result.rows[0].id,
        encrypted_entry_key: result.rows[0].encrypted_entry_key,
        key_nonce: result.rows[0].key_nonce,
        author_public_key: result.rows[0].author_public_key
      } : null
    });
    
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
    
    // Format response with proper structure
    const entriesWithMetadata = result.rows.map(entry => {
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
    
    return res.status(200).json({
      success: true,
      data: entriesWithMetadata,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: result.rows.length,
        has_more: result.rows.length === parseInt(limit)
      },
      metadata: {
        total_shared_entries: result.rows.length,
        unique_authors: [...new Set(result.rows.map(r => r.author_id))].length
      }
    });
    
  } catch (error) {
    console.error('Get shared entries error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get shared entries',
      message: error.message
    });
  }
}