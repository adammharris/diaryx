/**
 * All API handlers consolidated in one file
 * Native Hono handlers for Diaryx API
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryWithUser, transactionWithUser, getUserById, insertUserProfile, searchUsers } from './lib/database.js';
import { authenticateUser } from './lib/middleware.js';

// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

function requireAuth(handler) {
  return async (c) => {
    const auth = authenticateUser({
      headers: {
        authorization: c.req.header('authorization'),
        'x-user-id': c.req.header('x-user-id')
      }
    });
    
    if (!auth.isAuthenticated) {
      return c.json({
        success: false,
        error: 'Authentication required',
        message: auth.error || 'Please provide valid authentication'
      }, 401);
    }
    
    c.set('auth', auth);
    return await handler(c);
  };
}

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
// AUTH HANDLERS
// =============================================================================

export async function googleAuthHandler(c) {
  if (c.req.method !== 'POST') {
    return c.json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['POST']
    }, 405);
  }

  try {
    const rawBody = await c.req.text();
    console.log('Raw request body:', rawBody);
    
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      console.error('Body content:', rawBody);
      return c.json({
        success: false,
        error: 'Invalid JSON in request body',
        details: jsonError.message
      }, 400);
    }
    
    const { code, state, redirectUri } = body;
    
    console.log('Parsed auth request:', {
      code: code ? 'present' : 'missing',
      state: state ? 'present' : 'missing', 
      redirectUri
    });

    if (!code) {
      return c.json({
        success: false,
        error: 'Authorization code is required'
      }, 400);
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code, redirectUri);
    
    if (!tokenResponse.access_token) {
      return c.json({
        success: false,
        error: 'Failed to exchange authorization code'
      }, 400);
    }

    // Get user info from Google
    const userInfo = await getUserInfoFromGoogle(tokenResponse.access_token);
    
    if (!userInfo.email) {
      return c.json({
        success: false,
        error: 'Failed to get user information from Google'
      }, 400);
    }

    // Generate public key for E2E encryption
    const publicKey = generateMockPublicKey();

    // Create or update user profile
    let user;
    const existingUser = await getUserByGoogleId(userInfo.id) || await getUserByEmail(userInfo.email);
    
    if (existingUser) {
      user = existingUser;
    } else {
      const userData = {
        id: generateUUID(),
        email: userInfo.email,
        name: userInfo.name,
        avatar_url: userInfo.picture,
        provider: 'google',
        public_key: publicKey,
        external_id: userInfo.id
      };
      
      user = await insertUserProfile(userData);
    }

    // Generate JWT token for our backend
    const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-here';
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        sub: user.id
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Verify the token we just created
    try {
      jwt.verify(jwtToken, jwtSecret);
    } catch (testError) {
      console.error('JWT verification test failed:', testError);
      throw new Error('Generated JWT token is invalid');
    }

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar_url,
          provider: user.provider,
          public_key: user.public_key
        },
        access_token: jwtToken,
        refresh_token: tokenResponse.refresh_token,
        expires_in: 24 * 60 * 60
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    return c.json({
      success: false,
      error: 'OAuth exchange failed',
      message: error.message
    }, 500);
  }
}

// =============================================================================
// USER HANDLERS
// =============================================================================

export const getUserHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }
    
    const user = await getUserById(id);
    
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }
    
    const isOwnProfile = auth.userId === id;
    
    const responseData = {
      id: user.id,
      name: user.name,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      public_key: user.public_key,
      discoverable: user.discoverable,
      created_at: user.created_at
    };

    if (isOwnProfile && user.encrypted_private_key) {
      responseData.encrypted_private_key = user.encrypted_private_key;
    }

    return c.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      success: false,
      error: 'Failed to get user',
      message: error.message
    }, 500);
  }
});

export const updateUserHandler = requireAuth(async (c) => {
  try {
    const id = c.req.param('id');
    const auth = c.get('auth');
    
    if (!id) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }
    
    if (id !== auth.userId) {
      return c.json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own profile'
      }, 403);
    }
    
    const body = await c.req.json();
    const {
      name,
      username,
      display_name,
      avatar_url,
      discoverable,
      public_key,
      encrypted_private_key
    } = body;
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name);
    }
    
    if (username !== undefined) {
      paramCount++;
      updates.push(`username = $${paramCount}`);
      values.push(username);
    }
    
    if (display_name !== undefined) {
      paramCount++;
      updates.push(`display_name = $${paramCount}`);
      values.push(display_name);
    }
    
    if (avatar_url !== undefined) {
      paramCount++;
      updates.push(`avatar_url = $${paramCount}`);
      values.push(avatar_url);
    }
    
    if (discoverable !== undefined) {
      paramCount++;
      updates.push(`discoverable = $${paramCount}`);
      values.push(discoverable);
    }
    
    if (public_key !== undefined) {
      paramCount++;
      updates.push(`public_key = $${paramCount}`);
      values.push(public_key);
    }
    
    if (encrypted_private_key !== undefined) {
      paramCount++;
      updates.push(`encrypted_private_key = $${paramCount}`);
      values.push(encrypted_private_key);
    }
    
    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No valid fields to update'
      }, 400);
    }
    
    paramCount++;
    values.push(id);
    
    const text = `
      UPDATE user_profiles 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await queryWithUser(auth.userId, text, values);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User not found or unauthorized'
      }, 404);
    }
    
    const user = result.rows[0];
    
    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        public_key: user.public_key,
        discoverable: user.discoverable,
        updated_at: user.updated_at
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.code === '23505') {
      return c.json({
        success: false,
        error: 'Username already taken'
      }, 409);
    }
    
    return c.json({
      success: false,
      error: 'Failed to update user',
      message: error.message
    }, 500);
  }
});

export async function searchUsersHandler(c) {
  try {
    const query = c.req.query();
    const { q, username, email, limit = '20', offset = '0' } = query;
    
    console.log('=== User Search Debug ===');
    console.log('Query params:', query);
    console.log('Extracted params:', { q, username, email, limit, offset });
    
    // Support both generic 'q' parameter and specific username/email
    const searchParams = {
      username: username || q,
      email: email || q,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    console.log('Search params to database:', searchParams);
    
    const users = await searchUsers(searchParams);
    
    console.log(`Found ${users.length} users`);
    console.log('First few users:', users.slice(0, 3));
    
    return c.json({
      success: true,
      users: users, // Frontend expects 'users' field
      total: users.length,
      hasMore: users.length >= parseInt(limit),
      pagination: {
        limit: searchParams.limit,
        offset: searchParams.offset,
        count: users.length
      }
    });
    
  } catch (error) {
    console.error('Search users error:', error);
    return c.json({
      success: false,
      error: 'Failed to search users',
      message: error.message
    }, 500);
  }
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
      bodySize: JSON.stringify(body).length
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
      tag_ids
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
    
    console.log('Update query info:', {
      updatesCount: updates.length,
      updates: updates,
      valuesLength: values.length
    });
    
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
    
    // If no entry updates but need to get current entry for tags-only update
    if (queries.length === 0 || (updates.length === 0 && tag_ids !== undefined)) {
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

// Combined entries handler for routing
export async function entriesHandler(c) {
  const method = c.req.method;
  
  switch (method) {
    case 'GET':
      return await listEntriesHandler(c);
    case 'POST':
      return await createEntryHandler(c);
    default:
      return c.json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST']
      }, 405);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function exchangeCodeForTokens(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  console.log('OAuth Token Exchange Debug:');
  console.log('- Client ID:', clientId ? `${clientId.substring(0, 20)}...` : 'MISSING');
  console.log('- Client Secret:', clientSecret ? 'SET' : 'MISSING');
  console.log('- Redirect URI:', redirectUri);
  console.log('- Code length:', code ? code.length : 'MISSING');

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const tokenParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  console.log('Token request payload:', tokenParams.toString());

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString()
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.log('Google OAuth Error Details:');
    console.log('- Status:', response.status);
    console.log('- Status Text:', response.statusText);
    console.log('- Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('- Error Data:', errorData);
    
    // Parse error data if it's JSON
    try {
      const errorJson = JSON.parse(errorData);
      console.log('- Parsed Error:', errorJson);
    } catch (e) {
      console.log('- Error data is not JSON');
    }
    
    throw new Error(`Token exchange failed: ${response.status} ${errorData}`);
  }

  const tokenResponse = await response.json();
  console.log('Token exchange successful:', { 
    access_token: tokenResponse.access_token ? 'present' : 'missing',
    refresh_token: tokenResponse.refresh_token ? 'present' : 'missing',
    expires_in: tokenResponse.expires_in 
  });
  
  return tokenResponse;
}

async function getUserInfoFromGoogle(accessToken) {
  const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
  
  const response = await fetch(userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return await response.json();
}

async function getUserByEmail(email) {
  try {
    const { query } = await import('./lib/database.js');
    const result = await query('SELECT * FROM user_profiles WHERE email = $1', [email]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

async function getUserByGoogleId(googleId) {
  try {
    const { query } = await import('./lib/database.js');
    const result = await query('SELECT * FROM user_profiles WHERE external_id = $1', [googleId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by Google ID:', error);
    return null;
  }
}

function generateMockPublicKey() {
  return `pk_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// =============================================================================
// TAG MANAGEMENT HANDLERS
// =============================================================================

export const listTagsHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    
    const result = await queryWithUser(auth.userId, 
      'SELECT * FROM tags WHERE author_id = $1 ORDER BY created_at DESC',
      [auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('List tags error:', error);
    return c.json({
      success: false,
      error: 'Failed to get tags',
      message: error.message
    }, 500);
  }
});

export const createTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const { name, slug, color } = await c.req.json();

    if (!name || !slug || !color) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        message: 'Name, slug, and color are required'
      }, 400);
    }

    const tagId = uuidv4();
    const result = await queryWithUser(auth.userId,
      `INSERT INTO tags (id, name, slug, color, author_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [tagId, name, slug, color, auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to create tag',
      message: error.message
    }, 500);
  }
});

export const updateTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.param('id');
    const { name, slug, color } = await c.req.json();

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount}`);
      params.push(slug);
      paramCount++;
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount}`);
      params.push(color);
      paramCount++;
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update'
      }, 400);
    }

    updates.push(`updated_at = now()`);
    params.push(tagId, auth.userId);

    const result = await queryWithUser(auth.userId,
      `UPDATE tags SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND author_id = $${paramCount + 1} 
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to update it'
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to update tag',
      message: error.message
    }, 500);
  }
});

export const deleteTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.param('id');

    const result = await queryWithUser(auth.userId,
      'DELETE FROM tags WHERE id = $1 AND author_id = $2 RETURNING *',
      [tagId, auth.userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to delete it'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag deleted successfully'
    });
  } catch (error) {
    console.error('Delete tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete tag',
      message: error.message
    }, 500);
  }
});

export async function tagsHandler(c) {
  const method = c.req.method;
  
  switch (method) {
    case 'GET':
      return listTagsHandler(c);
    case 'POST':
      return createTagHandler(c);
    default:
      return c.json({
        success: false,
        error: 'Method not allowed',
        message: `${method} is not supported on this endpoint`
      }, 405);
  }
}

// =============================================================================
// USER-TAG ASSIGNMENT HANDLERS
// =============================================================================

export const listUserTagsHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const tagId = c.req.query('tag_id');

    let query = `
      SELECT ut.*, t.name as tag_name, t.color as tag_color,
             up.id as target_user_id, up.username, up.display_name, up.email, up.avatar_url
      FROM user_tags ut
      JOIN tags t ON ut.tag_id = t.id
      JOIN user_profiles up ON ut.target_id = up.id
      WHERE ut.tagger_id = $1
    `;
    
    const params = [auth.userId];
    
    if (tagId) {
      query += ' AND ut.tag_id = $2';
      params.push(tagId);
    }
    
    query += ' ORDER BY ut.created_at DESC';

    const result = await queryWithUser(auth.userId, query, params);

    // Group by tag or return flat list
    const userTags = result.rows.map(row => ({
      id: row.id,
      tag_id: row.tag_id,
      target_id: row.target_id,
      tagger_id: row.tagger_id,
      created_at: row.created_at,
      tag: {
        id: row.tag_id,
        name: row.tag_name,
        color: row.tag_color
      },
      target_user: {
        id: row.target_user_id,
        username: row.username,
        display_name: row.display_name,
        email: row.email,
        avatar_url: row.avatar_url
      }
    }));

    return c.json({
      success: true,
      data: userTags
    });
  } catch (error) {
    console.error('List user tags error:', error);
    return c.json({
      success: false,
      error: 'Failed to get user tags',
      message: error.message
    }, 500);
  }
});

export const assignUserTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const { tag_id, target_id } = await c.req.json();

    if (!tag_id || !target_id) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        message: 'tag_id and target_id are required'
      }, 400);
    }

    // Verify the tag belongs to the current user
    const tagResult = await queryWithUser(auth.userId,
      'SELECT id FROM tags WHERE id = $1 AND author_id = $2',
      [tag_id, auth.userId]
    );

    if (tagResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Tag not found',
        message: 'Tag not found or you do not have permission to assign it'
      }, 404);
    }

    // Verify the target user exists and is discoverable
    const userResult = await queryWithUser(auth.userId,
      'SELECT id FROM user_profiles WHERE id = $1 AND discoverable = true',
      [target_id]
    );

    if (userResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User not found',
        message: 'Target user not found or not discoverable'
      }, 404);
    }

    const userTagId = uuidv4();
    const result = await queryWithUser(auth.userId,
      `INSERT INTO user_tags (id, tagger_id, target_id, tag_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [userTagId, auth.userId, target_id, tag_id]
    );

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Assign user tag error:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return c.json({
        success: false,
        error: 'Tag already assigned',
        message: 'This tag is already assigned to this user'
      }, 409);
    }

    return c.json({
      success: false,
      error: 'Failed to assign tag',
      message: error.message
    }, 500);
  }
});

export const removeUserTagHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const userTagId = c.req.param('id');

    const result = await queryWithUser(auth.userId,
      'DELETE FROM user_tags WHERE id = $1 AND tagger_id = $2 RETURNING *',
      [userTagId, auth.userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'User tag assignment not found',
        message: 'Assignment not found or you do not have permission to remove it'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Tag assignment removed successfully'
    });
  } catch (error) {
    console.error('Remove user tag error:', error);
    return c.json({
      success: false,
      error: 'Failed to remove tag assignment',
      message: error.message
    }, 500);
  }
});

export async function userTagsHandler(c) {
  const method = c.req.method;
  
  switch (method) {
    case 'GET':
      return listUserTagsHandler(c);
    case 'POST':
      return assignUserTagHandler(c);
    default:
      return c.json({
        success: false,
        error: 'Method not allowed',
        message: `${method} is not supported on this endpoint`
      }, 405);
  }
}

// =============================================================================
// ENTRY ACCESS KEY HANDLERS
// =============================================================================

export const getEntryAccessKeyHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const entryId = c.req.param('entryId');

    const result = await queryWithUser(auth.userId,
      'SELECT * FROM entry_access_keys WHERE entry_id = $1 AND user_id = $2',
      [entryId, auth.userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Access key not found',
        message: 'You do not have access to this entry'
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get entry access key error:', error);
    return c.json({
      success: false,
      error: 'Failed to get access key',
      message: error.message
    }, 500);
  }
});

export const createEntryAccessKeysHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const { entry_id, access_keys } = await c.req.json();

    if (!entry_id || !access_keys || !Array.isArray(access_keys)) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        message: 'entry_id and access_keys array are required'
      }, 400);
    }

    // Verify the entry belongs to the current user
    const entryResult = await queryWithUser(auth.userId,
      'SELECT id FROM entries WHERE id = $1 AND author_id = $2',
      [entry_id, auth.userId]
    );

    if (entryResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found',
        message: 'Entry not found or you do not have permission to share it'
      }, 404);
    }

    // Insert access keys in a transaction
    const queries = access_keys.map(key => ({
      text: `INSERT INTO entry_access_keys (id, entry_id, user_id, encrypted_entry_key, key_nonce) 
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (entry_id, user_id) 
             DO UPDATE SET encrypted_entry_key = EXCLUDED.encrypted_entry_key, 
                          key_nonce = EXCLUDED.key_nonce`,
      params: [uuidv4(), entry_id, key.user_id, key.encrypted_entry_key, key.key_nonce]
    }));

    await transactionWithUser(auth.userId, queries);

    return c.json({
      success: true,
      message: `${access_keys.length} access keys created successfully`
    });
  } catch (error) {
    console.error('Create entry access keys error:', error);
    return c.json({
      success: false,
      error: 'Failed to create access keys',
      message: error.message
    }, 500);
  }
});

export const revokeEntryAccessHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const entryId = c.req.param('entryId');
    const userId = c.req.param('userId');

    // Check if user is entry author or the user losing access
    const canRevoke = userId === auth.userId;
    let authorCheck = false;
    
    if (!canRevoke) {
      const entryResult = await queryWithUser(auth.userId,
        'SELECT id FROM entries WHERE id = $1 AND author_id = $2',
        [entryId, auth.userId]
      );
      authorCheck = entryResult.rows.length > 0;
    }

    if (!canRevoke && !authorCheck) {
      return c.json({
        success: false,
        error: 'Permission denied',
        message: 'You do not have permission to revoke this access'
      }, 403);
    }

    const result = await queryWithUser(auth.userId,
      'DELETE FROM entry_access_keys WHERE entry_id = $1 AND user_id = $2 RETURNING *',
      [entryId, userId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Access key not found',
        message: 'Access key not found for this entry and user'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Access revoked successfully'
    });
  } catch (error) {
    console.error('Revoke entry access error:', error);
    return c.json({
      success: false,
      error: 'Failed to revoke access',
      message: error.message
    }, 500);
  }
});

export const listUserAccessKeysHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');

    const result = await queryWithUser(auth.userId,
      `SELECT eak.*, e.title_hash, e.created_at as entry_created_at,
              up.username, up.display_name, up.email
       FROM entry_access_keys eak
       JOIN entries e ON eak.entry_id = e.id
       LEFT JOIN user_profiles up ON e.author_id = up.id
       WHERE eak.user_id = $1
       ORDER BY eak.created_at DESC`,
      [auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('List user access keys error:', error);
    return c.json({
      success: false,
      error: 'Failed to get access keys',
      message: error.message
    }, 500);
  }
});

export async function entryAccessKeysHandler(c) {
  const method = c.req.method;
  const path = c.req.path;
  
  // Handle different path patterns
  if (path.includes('/batch')) {
    if (method === 'POST') {
      return createEntryAccessKeysHandler(c);
    }
  } else if (path.match(/\/entry-access-keys\/[^/]+\/[^/]+$/)) {
    if (method === 'DELETE') {
      return revokeEntryAccessHandler(c);
    }
  } else if (path.match(/\/entry-access-keys\/[^/]+$/)) {
    if (method === 'GET') {
      return getEntryAccessKeyHandler(c);
    }
  } else if (path === '/api/entry-access-keys') {
    if (method === 'GET') {
      return listUserAccessKeysHandler(c);
    }
  }
  
  return c.json({
    success: false,
    error: 'Method not allowed',
    message: `${method} is not supported on this endpoint`
  }, 405);
}

// =============================================================================
// SHARED ENTRIES HANDLERS
// =============================================================================

export const getSharedEntriesHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');

    const result = await queryWithUser(auth.userId,
      `SELECT DISTINCT e.*, up.username as author_username, up.display_name as author_name,
              up.public_key as author_public_key
       FROM entries e
       JOIN entry_access_keys eak ON e.id = eak.entry_id
       JOIN user_profiles up ON e.author_id = up.id
       WHERE eak.user_id = $1 AND e.is_published = true
       ORDER BY e.updated_at DESC`,
      [auth.userId]
    );

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get shared entries error:', error);
    return c.json({
      success: false,
      error: 'Failed to get shared entries',
      message: error.message
    }, 500);
  }
});

export const getEntrySharedUsersHandler = requireAuth(async (c) => {
  try {
    const auth = c.get('auth');
    const entryId = c.req.param('id');

    // Verify the entry belongs to the current user
    const entryResult = await queryWithUser(auth.userId,
      'SELECT id FROM entries WHERE id = $1 AND author_id = $2',
      [entryId, auth.userId]
    );

    if (entryResult.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Entry not found',
        message: 'Entry not found or you do not have permission to view sharing info'
      }, 404);
    }

    const result = await queryWithUser(auth.userId,
      `SELECT eak.*, up.username, up.display_name, up.email, up.avatar_url,
              t.id as tag_id, t.name as tag_name, t.color as tag_color
       FROM entry_access_keys eak
       JOIN user_profiles up ON eak.user_id = up.id
       LEFT JOIN user_tags ut ON eak.user_id = ut.target_id AND ut.tagger_id = $2
       LEFT JOIN tags t ON ut.tag_id = t.id
       WHERE eak.entry_id = $1
       ORDER BY eak.created_at DESC`,
      [entryId, auth.userId]
    );

    // Group by user and collect their tags
    const usersMap = new Map();
    for (const row of result.rows) {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          user: {
            id: row.user_id,
            username: row.username,
            display_name: row.display_name,
            email: row.email,
            avatar_url: row.avatar_url
          },
          accessKey: {
            id: row.id,
            encrypted_entry_key: row.encrypted_entry_key,
            key_nonce: row.key_nonce,
            created_at: row.created_at
          },
          tags: []
        });
      }
      
      if (row.tag_id) {
        usersMap.get(row.user_id).tags.push({
          id: row.tag_id,
          name: row.tag_name,
          color: row.tag_color
        });
      }
    }

    const sharedWithUsers = Array.from(usersMap.values());

    return c.json({
      success: true,
      data: {
        entryId,
        sharedWithUsers,
        tags: [], // Could be populated with entry tags if needed
        accessKeys: result.rows
      }
    });
  } catch (error) {
    console.error('Get entry shared users error:', error);
    return c.json({
      success: false,
      error: 'Failed to get sharing info',
      message: error.message
    }, 500);
  }
});