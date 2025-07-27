/**
 * API handlers for entries (Cloudflare Pages compatible)
 */

import { v4 as uuidv4 } from 'uuid';
import { getUserEntries, getSharedEntries, createEntry, getEntry, updateEntry, deleteEntry } from '../lib/database.js';
import { authenticateUser } from '../lib/middleware.js';

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function validateEntryData(data) {
  const { title, content } = data;
  
  if (!title || !content) {
    return { valid: false, error: 'Title and content are required' };
  }
  
  if (title.length > 500) {
    return { valid: false, error: 'Title too long (max 500 characters)' };
  }
  
  if (content.length > 100000) {
    return { valid: false, error: 'Content too long (max 100,000 characters)' };
  }
  
  return { valid: true };
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * GET /api/entries - List user entries
 */
export async function listEntriesHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { limit, offset, search, tags } = c.req.query();
    
    const options = {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      search: search || '',
      tags: tags ? tags.split(',') : []
    };

    const entries = await getUserEntries(auth.userId, options, c.env);
    
    return c.json({
      success: true,
      data: entries,
      pagination: {
        limit: options.limit,
        offset: options.offset
      }
    });
  } catch (error) {
    console.error('Error listing entries:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch entries' 
    }, 500);
  }
}

/**
 * POST /api/entries - Create new entry
 */
export async function createEntryHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const validation = validateEntryData(body);
    
    if (!validation.valid) {
      return c.json({ 
        success: false, 
        error: validation.error 
      }, 400);
    }

    const entry = await createEntry(auth.userId, {
      title: body.title,
      content: body.content,
      isPublic: body.isPublic || false
    }, c.env);

    return c.json({
      success: true,
      data: entry
    }, 201);
  } catch (error) {
    console.error('Error creating entry:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to create entry' 
    }, 500);
  }
}

/**
 * GET /api/entries/:id - Get single entry
 */
export async function getEntryHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entryId = c.req.param('id');
    const entry = await getEntry(entryId, auth.userId, c.env);

    if (!entry) {
      return c.json({ 
        success: false, 
        error: 'Entry not found' 
      }, 404);
    }

    return c.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Error fetching entry:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch entry' 
    }, 500);
  }
}

/**
 * PUT /api/entries/:id - Update entry
 */
export async function updateEntryHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entryId = c.req.param('id');
    const body = await c.req.json();
    
    const validation = validateEntryData(body);
    if (!validation.valid) {
      return c.json({ 
        success: false, 
        error: validation.error 
      }, 400);
    }

    const updatedEntry = await updateEntry(entryId, auth.userId, {
      title: body.title,
      content: body.content,
      isPublic: body.isPublic
    }, c.env);

    if (!updatedEntry) {
      return c.json({ 
        success: false, 
        error: 'Entry not found or access denied' 
      }, 404);
    }

    return c.json({
      success: true,
      data: updatedEntry
    });
  } catch (error) {
    console.error('Error updating entry:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to update entry' 
    }, 500);
  }
}

/**
 * DELETE /api/entries/:id - Delete entry
 */
export async function deleteEntryHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entryId = c.req.param('id');
    const deleted = await deleteEntry(entryId, auth.userId, c.env);

    if (!deleted) {
      return c.json({ 
        success: false, 
        error: 'Entry not found or access denied' 
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting entry:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to delete entry' 
    }, 500);
  }
}

/**
 * GET /api/entries/shared-with-me - Get shared entries
 */
export async function getSharedEntriesHandler(c) {
  try {
    const auth = authenticateUser(c.req, c.env);
    if (!auth.isAuthenticated) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const entries = await getSharedEntries(auth.userId, c.env);
    
    return c.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Error fetching shared entries:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch shared entries' 
    }, 500);
  }
}
