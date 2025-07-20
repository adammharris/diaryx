/**
 * Individual entry management
 * GET /api/entries/[id] - Get entry with access key
 * PUT /api/entries/[id] - Update entry
 * DELETE /api/entries/[id] - Delete entry
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, transactionWithUser } from '../lib/database.js';

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
        eak.created_at as access_granted_at,
        up.name as author_name,
        up.username as author_username,
        up.public_key as author_public_key
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
        access_key: entry.encrypted_entry_key ? {
          encrypted_entry_key: entry.encrypted_entry_key,
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
      tag_ids
    } = req.body;
    
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
      values.push(id);
      
      queries.push({
        text: `
          UPDATE entries 
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${paramCount}
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
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found or unauthorized'
      });
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