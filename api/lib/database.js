/**
 * Database connection and utilities for Neon
 */

import { Pool, neon } from '@neondatabase/serverless';

let pool = null;

/**
 * Get database connection pool
 */
export function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    pool = new Pool({ connectionString });
  }
  
  return pool;
}

/**
 * Execute a query with automatic connection management
 */
export async function query(text, params = []) {
  const db = getDb();
  const client = await db.connect();
  
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute a query with current user context for RLS
 * This sets the app.current_user_id session variable before running the query
 */
export async function queryWithUser(userId, text, params = []) {
  const db = getDb();
  const client = await db.connect();
  
  try {
    // Set the current user ID for RLS policies
    // Neon doesn't support parameterized SET statements, so we need to escape and interpolate
    const escapedUserId = userId.replace(/'/g, "''");
    await client.query(`SET app.current_user_id = '${escapedUserId}'`);
    
    const result = await client.query(text, params);
    return result;
  } finally {
    // Clear the session variable and release connection
    // Set to empty string instead of using RESET which might not work for custom variables
    await client.query("SET app.current_user_id = ''");
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction with user context
 */
export async function transactionWithUser(userId, queries) {
  const db = getDb();
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    // Set the current user ID for RLS policies
    // Neon doesn't support parameterized SET statements, so we need to escape and interpolate
    const escapedUserId = userId.replace(/'/g, "''");
    await client.query(`SET app.current_user_id = '${escapedUserId}'`);
    
    const results = [];
    
    for (const { text, params = [] } of queries) {
      const result = await client.query(text, params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Clear the session variable and release connection
    // Set to empty string instead of using RESET which might not work for custom variables
    await client.query("SET app.current_user_id = ''");
    client.release();
  }
}

/**
 * Insert a new user profile (called during signup)
 * This bypasses RLS by using elevated privileges
 */
export async function insertUserProfile(userData) {
  const {
    id,
    email,
    name,
    avatar_url,
    provider,
    username,
    display_name,
    public_key,
    external_id
  } = userData;
  
  const text = `
    INSERT INTO user_profiles (
      id, email, name, avatar_url, provider, username, display_name, public_key, external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  
  const params = [id, email, name, avatar_url, provider, username, display_name, public_key, external_id || null];
  
  // Use regular query (not queryWithUser) since this is admin operation
  const result = await query(text, params);
  return result.rows[0];
}

/**
 * Get user by ID (for public key lookups, etc.)
 */
export async function getUserById(userId) {
  const text = 'SELECT * FROM user_profiles WHERE id = $1';
  const result = await query(text, [userId]);
  return result.rows[0] || null;
}

/**
 * Search for discoverable users
 */
export async function searchUsers(searchParams = {}) {
  const { username, email, limit = 20, offset = 0 } = searchParams;
  
  let whereClause = 'WHERE discoverable = true';
  const params = [];
  let paramCount = 0;
  
  if (username) {
    paramCount++;
    whereClause += ` AND username ILIKE $${paramCount}`;
    params.push(`%${username}%`);
  }
  
  if (email) {
    paramCount++;
    whereClause += ` AND email ILIKE $${paramCount}`;
    params.push(`%${email}%`);
  }
  
  paramCount++;
  const limitParam = paramCount;
  paramCount++;
  const offsetParam = paramCount;
  
  const text = `
    SELECT id, email, name, username, display_name, avatar_url, public_key, created_at
    FROM user_profiles 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
  
  params.push(limit, offset);
  
  const result = await query(text, params);
  return result.rows;
}

/**
 * Health check for database connection
 */
export async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as current_time');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      database: 'neon'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      database: 'neon'
    };
  }
}

/**
 * Execute a conditional update with optimistic locking
 * Returns { success: boolean, conflict: boolean, result?: any }
 */
export async function conditionalUpdate(userId, table, id, updates, expectedTimestamp) {
  const db = getDb();
  const client = await db.connect();
  
  try {
    // Set the current user ID for RLS policies
    await client.query(`SET app.current_user_id = '${userId}'`);
    
    await client.query('BEGIN');
    
    // Check current timestamp
    const checkResult = await client.query(
      `SELECT updated_at FROM ${table} WHERE id = $1`,
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, conflict: false, error: 'Not found' };
    }
    
    const currentTimestamp = checkResult.rows[0].updated_at;
    
    // Check for conflict
    if (expectedTimestamp && new Date(currentTimestamp) > new Date(expectedTimestamp)) {
      await client.query('ROLLBACK');
      return { 
        success: false, 
        conflict: true, 
        currentTimestamp: currentTimestamp.toISOString() 
      };
    }
    
    // Build update query
    const updateFields = Object.keys(updates);
    const updateValues = Object.values(updates);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const updateQuery = `
      UPDATE ${table} 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND updated_at = $${updateFields.length + 2}
      RETURNING *
    `;
    
    const result = await client.query(updateQuery, [id, ...updateValues, expectedTimestamp]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, conflict: true };
    }
    
    await client.query('COMMIT');
    return { success: true, conflict: false, result: result.rows[0] };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get entry with version information for conflict detection
 */
export async function getEntryWithVersion(userId, entryId) {
  const result = await queryWithUser(userId, 
    `SELECT id, updated_at, EXTRACT(EPOCH FROM updated_at) as version
     FROM entries WHERE id = $1`, 
    [entryId]
  );
  
  return result.rows[0] || null;
}

/**
 * Batch operation with conflict detection
 * Useful for syncing multiple entries
 */
export async function batchUpdateWithConflictDetection(userId, operations) {
  const db = getDb();
  const client = await db.connect();
  
  try {
    await client.query(`SET app.current_user_id = '${userId}'`);
    await client.query('BEGIN');
    
    const results = [];
    
    for (const operation of operations) {
      const { type, table, id, data, expectedTimestamp } = operation;
      
      if (type === 'update') {
        // Check for conflicts
        const checkResult = await client.query(
          `SELECT updated_at FROM ${table} WHERE id = $1`,
          [id]
        );
        
        if (checkResult.rows.length === 0) {
          results.push({ id, success: false, error: 'Not found' });
          continue;
        }
        
        const currentTimestamp = checkResult.rows[0].updated_at;
        
        if (expectedTimestamp && new Date(currentTimestamp) > new Date(expectedTimestamp)) {
          results.push({ 
            id, 
            success: false, 
            conflict: true,
            currentTimestamp: currentTimestamp.toISOString()
          });
          continue;
        }
        
        // Perform update
        const updateFields = Object.keys(data);
        const updateValues = Object.values(data);
        const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        
        const updateResult = await client.query(
          `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [id, ...updateValues]
        );
        
        results.push({ id, success: true, result: updateResult.rows[0] });
      }
    }
    
    await client.query('COMMIT');
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}