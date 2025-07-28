/**
 * Database connection and utilities for Neon (Cloudflare Pages compatible)
 */

import { neon } from '@neondatabase/serverless';

/**
 * Get database connection for Cloudflare Pages
 * Uses the neon function instead of Pool for serverless compatibility
 */
export function getDb(env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  // Use neon() for Cloudflare Workers/Pages compatibility
  return neon(connectionString);
}

/**
 * Execute a query with the database connection
 */
export async function executeQuery(sql, env) {
  const db = getDb(env);
  return await db(sql);
}

/**
 * Execute a parameterized query
 */
export async function query(sql, params = [], env) {
  const db = getDb(env);
  return await db(sql, params);
}

/**
 * Get all entries for a user with optional filtering
 */
export async function getUserEntries(userId, options = {}, env) {
  const { limit = 50, offset = 0, search = '', tags = [] } = options;
  
  let sql = `
    SELECT 
      e.id,
      e.title,
      e.content,
      e.created_at,
      e.updated_at,
      e.is_public,
      array_agg(
        CASE 
          WHEN ut.tag_name IS NOT NULL 
          THEN json_build_object('name', ut.tag_name, 'color', t.color)
          ELSE NULL 
        END
      ) FILTER (WHERE ut.tag_name IS NOT NULL) as tags
    FROM entries e
    LEFT JOIN user_tags ut ON e.user_id = ut.user_id
    LEFT JOIN tags t ON ut.tag_name = t.name AND t.user_id = e.user_id
    WHERE e.user_id = $1
  `;
  
  const params = [userId];
  let paramIndex = 2;
  
  // Add search filter
  if (search) {
    sql += ` AND (e.title ILIKE $${paramIndex} OR e.content ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  // Add tag filters
  if (tags.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM user_tags ut2 
      WHERE ut2.user_id = e.user_id 
      AND ut2.tag_name = ANY($${paramIndex}::text[])
    )`;
    params.push(tags);
    paramIndex++;
  }
  
  sql += `
    GROUP BY e.id, e.title, e.content, e.created_at, e.updated_at, e.is_public
    ORDER BY e.updated_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(limit, offset);
  
  const db = getDb(env);
  return await db(sql, params);
}

/**
 * Get shared entries that the user has access to
 */
export async function getSharedEntries(userId, env) {
  const sql = `
    SELECT DISTINCT
      e.id,
      e.title,
      e.content,
      e.created_at,
      e.updated_at,
      e.is_public,
      u.email as owner_email,
      array_agg(
        CASE 
          WHEN ut.tag_name IS NOT NULL 
          THEN json_build_object('name', ut.tag_name, 'color', t.color)
          ELSE NULL 
        END
      ) FILTER (WHERE ut.tag_name IS NOT NULL) as tags
    FROM entries e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN entry_access_keys eak ON e.id = eak.entry_id
    LEFT JOIN user_tags ut ON e.user_id = ut.user_id
    LEFT JOIN tags t ON ut.tag_name = t.name AND t.user_id = e.user_id
    WHERE (e.is_public = true OR eak.user_id = $1)
      AND e.user_id != $1
    GROUP BY e.id, e.title, e.content, e.created_at, e.updated_at, e.is_public, u.email
    ORDER BY e.updated_at DESC
  `;
  
  const db = getDb(env);
  return await db(sql, [userId]);
}

/**
 * Create a new entry
 */
export async function createEntry(userId, { title, content, isPublic = false }, env) {
  const sql = `
    INSERT INTO entries (user_id, title, content, is_public, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING id, title, content, created_at, updated_at, is_public
  `;
  
  const db = getDb(env);
  const result = await db(sql, [userId, title, content, isPublic]);
  return result[0];
}

/**
 * Get a single entry by ID
 */
export async function getEntry(entryId, userId, env) {
  const sql = `
    SELECT 
      e.id,
      e.title,
      e.content,
      e.created_at,
      e.updated_at,
      e.is_public,
      e.user_id,
      array_agg(
        CASE 
          WHEN ut.tag_name IS NOT NULL 
          THEN json_build_object('name', ut.tag_name, 'color', t.color)
          ELSE NULL 
        END
      ) FILTER (WHERE ut.tag_name IS NOT NULL) as tags
    FROM entries e
    LEFT JOIN user_tags ut ON e.user_id = ut.user_id
    LEFT JOIN tags t ON ut.tag_name = t.name AND t.user_id = e.user_id
    LEFT JOIN entry_access_keys eak ON e.id = eak.entry_id
    WHERE e.id = $1 
      AND (e.user_id = $2 OR e.is_public = true OR eak.user_id = $2)
    GROUP BY e.id, e.title, e.content, e.created_at, e.updated_at, e.is_public, e.user_id
  `;
  
  const db = getDb(env);
  const result = await db(sql, [entryId, userId]);
  return result[0] || null;
}

/**
 * Update an entry
 */
export async function updateEntry(entryId, userId, updates, env) {
  const { title, content, isPublic } = updates;
  
  const sql = `
    UPDATE entries 
    SET title = $1, content = $2, is_public = $3, updated_at = NOW()
    WHERE id = $4 AND user_id = $5
    RETURNING id, title, content, created_at, updated_at, is_public
  `;
  
  const db = getDb(env);
  const result = await db(sql, [title, content, isPublic, entryId, userId]);
  return result[0] || null;
}

/**
 * Delete an entry
 */
export async function deleteEntry(entryId, userId, env) {
  const sql = `DELETE FROM entries WHERE id = $1 AND user_id = $2 RETURNING id`;
  
  const db = getDb(env);
  const result = await db(sql, [entryId, userId]);
  return result.length > 0;
}

/**
 * Get user by ID
 */
export async function getUser(userId, env) {
  const sql = `SELECT id, email, name, created_at FROM users WHERE id = $1`;
  
  const db = getDb(env);
  const result = await db(sql, [userId]);
  return result[0] || null;
}

/**
 * Create or update user
 */
export async function upsertUser(userData, env) {
  const { id, email, name } = userData;
  
  const sql = `
    INSERT INTO users (id, email, name, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name
    RETURNING id, email, name, created_at
  `;
  
  const db = getDb(env);
  const result = await db(sql, [id, email, name]);
  return result[0];
}

/**
 * Search users by email
 */
export async function searchUsers(query, currentUserId, env) {
  const sql = `
    SELECT id, email, name
    FROM users 
    WHERE email ILIKE $1 AND id != $2
    LIMIT 10
  `;
  
  const db = getDb(env);
  return await db(sql, [`%${query}%`, currentUserId]);
}

/**
 * Get all tags for a user
 */
export async function getUserTags(userId, env) {
  const sql = `SELECT name, color FROM tags WHERE user_id = $1 ORDER BY name`;
  
  const db = getDb(env);
  return await db(sql, [userId]);
}

/**
 * Create a new tag
 */
export async function createTag(userId, { name, color }, env) {
  const sql = `
    INSERT INTO tags (user_id, name, color, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
    RETURNING name, color, created_at
  `;
  
  const db = getDb(env);
  const result = await db(sql, [userId, name, color]);
  return result[0];
}

/**
 * Update a tag
 */
export async function updateTag(userId, tagName, { color }, env) {
  const sql = `
    UPDATE tags 
    SET color = $1 
    WHERE user_id = $2 AND name = $3
    RETURNING name, color
  `;
  
  const db = getDb(env);
  const result = await db(sql, [color, userId, tagName]);
  return result[0] || null;
}

/**
 * Delete a tag
 */
export async function deleteTag(userId, tagName, env) {
  const db = getDb(env);
  
  // First remove all user_tag assignments
  await db(`DELETE FROM user_tags WHERE user_id = $1 AND tag_name = $2`, [userId, tagName]);
  
  // Then delete the tag itself
  const result = await db(`DELETE FROM tags WHERE user_id = $1 AND name = $2 RETURNING name`, [userId, tagName]);
  return result.length > 0;
}

/**
 * Get user tag assignments
 */
export async function getUserTagAssignments(userId, env) {
  const sql = `
    SELECT ut.id, ut.tag_name, t.color
    FROM user_tags ut
    JOIN tags t ON ut.tag_name = t.name AND t.user_id = ut.user_id
    WHERE ut.user_id = $1
    ORDER BY ut.tag_name
  `;
  
  const db = getDb(env);
  return await db(sql, [userId]);
}

/**
 * Assign tag to user
 */
export async function assignUserTag(userId, tagName, env) {
  const sql = `
    INSERT INTO user_tags (user_id, tag_name, created_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id, tag_name) DO NOTHING
    RETURNING id, tag_name, created_at
  `;
  
  const db = getDb(env);
  const result = await db(sql, [userId, tagName]);
  return result[0] || null;
}

/**
 * Remove user tag assignment
 */
export async function removeUserTag(assignmentId, userId, env) {
  const sql = `DELETE FROM user_tags WHERE id = $1 AND user_id = $2 RETURNING id`;
  
  const db = getDb(env);
  const result = await db(sql, [assignmentId, userId]);
  return result.length > 0;
}

/**
 * Get access keys for entry
 */
export async function getEntryAccessKeys(entryId, userId, env) {
  const sql = `
    SELECT eak.entry_id, eak.user_id, u.email, eak.created_at
    FROM entry_access_keys eak
    JOIN users u ON eak.user_id = u.id
    JOIN entries e ON eak.entry_id = e.id
    WHERE eak.entry_id = $1 AND e.user_id = $2
    ORDER BY eak.created_at DESC
  `;
  
  const db = getDb(env);
  return await db(sql, [entryId, userId]);
}

/**
 * Create access keys in batch
 */
export async function createBatchAccessKeys(entryId, userIds, requestingUserId, env) {
  const db = getDb(env);
  
  // First verify the requesting user owns the entry
  const entryCheck = await db(
    `SELECT user_id FROM entries WHERE id = $1 AND user_id = $2`,
    [entryId, requestingUserId]
  );
  
  if (entryCheck.length === 0) {
    throw new Error('Entry not found or access denied');
  }
  
  // Create access keys for each user
  const results = [];
  for (const userId of userIds) {
    const sql = `
      INSERT INTO entry_access_keys (entry_id, user_id, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (entry_id, user_id) DO NOTHING
      RETURNING entry_id, user_id, created_at
    `;
    
    const result = await db(sql, [entryId, userId]);
    if (result.length > 0) {
      results.push(result[0]);
    }
  }
  
  return results;
}

/**
 * Revoke access key
 */
export async function revokeAccessKey(entryId, userId, requestingUserId, env) {
  const db = getDb(env);
  
  // First verify the requesting user owns the entry
  const entryCheck = await db(
    `SELECT user_id FROM entries WHERE id = $1 AND user_id = $2`,
    [entryId, requestingUserId]
  );
  
  if (entryCheck.length === 0) {
    throw new Error('Entry not found or access denied');
  }
  
  const sql = `DELETE FROM entry_access_keys WHERE entry_id = $1 AND user_id = $2 RETURNING entry_id`;
  const result = await db(sql, [entryId, userId]);
  return result.length > 0;
}
