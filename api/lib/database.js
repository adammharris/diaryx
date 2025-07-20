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