/**
 * Main Vercel serverless function entry point
 * Native Vercel handler without Hono for compatibility
 */

// Import handlers - we'll need to adapt these
import { googleAuthHandler } from './routes/auth.js';
import {
  listEntriesHandler,
  createEntryHandler,
  getEntryHandler,
  updateEntryHandler,
  deleteEntryHandler,
  getSharedEntriesHandler,
} from './routes/entries.js';
import { 
  getUserHandler, 
  updateUserHandler, 
  searchUsersHandler 
} from './routes/users.js';
import { 
  listTagsHandler, 
  createTagHandler, 
  updateTagHandler, 
  deleteTagHandler 
} from './routes/tags.js';
import { 
  listUserTagsHandler, 
  assignUserTagHandler, 
  removeUserTagHandler 
} from './routes/user-tags.js';
import { 
  listAccessKeysHandler, 
  createBatchAccessKeysHandler, 
  getEntryAccessKeyHandler, 
  revokeAccessKeyHandler 
} from './routes/entry-access-keys.js';

// CORS helper
function setCorsHeaders(headers, origin) {
  const allowedOrigins = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['https://diaryx-two.vercel.app'])
    : ['http://localhost:5173', 'http://localhost:3000', 'tauri://localhost'];
  
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  
  headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-User-ID';
  headers['Access-Control-Allow-Credentials'] = 'true';
  
  return headers;
}

// Route handler
async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  
  // CORS handling
  const headers = {};
  setCorsHeaders(headers, req.headers.get('origin'));
  
  if (method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }
  
  try {
    // Create Hono-like context for existing handlers
    const c = {
      req: {
        method,
        url: req.url,
        header: (key) => req.headers.get(key),
        param: (key) => {
          const match = path.match(new RegExp(`/${key}/([^/]+)`));
          return match ? match[1] : url.searchParams.get(key);
        },
        query: () => Object.fromEntries(url.searchParams.entries()),
        json: () => req.json()
      },
      json: (data, status = 200) => {
        return new Response(JSON.stringify(data), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      },
      text: (text, status = 200) => {
        return new Response(text, { status, headers });
      },
      get: (key) => {
        // For auth context
        return key === 'auth' ? c._auth : undefined;
      },
      set: (key, value) => {
        if (key === 'auth') c._auth = value;
      }
    };
    
    // Health check
    if (path === '/api/health') {
      return c.json({
        success: true,
        message: 'API server is running on Vercel',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
        database: process.env.DATABASE_URL ? 'connected' : 'not configured'
      });
    }
    
    // Route matching
    if (path === '/api/entries' && method === 'GET') return await listEntriesHandler(c);
    if (path === '/api/entries' && method === 'POST') return await createEntryHandler(c);
    if (path === '/api/entries/shared-with-me' && method === 'GET') return await getSharedEntriesHandler(c);
    if (path.match(/^\/api\/entries\/[^/]+$/) && method === 'GET') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await getEntryHandler(c);
    }
    if (path.match(/^\/api\/entries\/[^/]+$/) && method === 'PUT') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await updateEntryHandler(c);
    }
    if (path.match(/^\/api\/entries\/[^/]+$/) && method === 'DELETE') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await deleteEntryHandler(c);
    }
    
    // Auth routes
    if (path === '/api/auth/google' && method === 'POST') return await googleAuthHandler(c);
    
    // User routes
    if (path === '/api/users/search' && method === 'GET') return await searchUsersHandler(c);
    if (path.match(/^\/api\/users\/[^/]+$/) && method === 'GET') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await getUserHandler(c);
    }
    if (path.match(/^\/api\/users\/[^/]+$/) && method === 'PUT') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await updateUserHandler(c);
    }
    
    // Tag routes
    if (path === '/api/tags' && method === 'GET') return await listTagsHandler(c);
    if (path === '/api/tags' && method === 'POST') return await createTagHandler(c);
    if (path.match(/^\/api\/tags\/[^/]+$/) && method === 'PUT') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await updateTagHandler(c);
    }
    if (path.match(/^\/api\/tags\/[^/]+$/) && method === 'DELETE') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await deleteTagHandler(c);
    }
    
    // User-tag routes
    if (path === '/api/user-tags' && method === 'GET') return await listUserTagsHandler(c);
    if (path === '/api/user-tags' && method === 'POST') return await assignUserTagHandler(c);
    if (path.match(/^\/api\/user-tags\/[^/]+$/) && method === 'DELETE') {
      c.req.param = (key) => key === 'id' ? path.split('/').pop() : null;
      return await removeUserTagHandler(c);
    }
    
    // Entry access key routes
    if (path === '/api/entry-access-keys' && method === 'GET') return await listAccessKeysHandler(c);
    if (path === '/api/entry-access-keys/batch' && method === 'POST') return await createBatchAccessKeysHandler(c);
    if (path.match(/^\/api\/entry-access-keys\/[^/]+$/) && method === 'GET') {
      c.req.param = (key) => key === 'entry_id' ? path.split('/').pop() : null;
      return await getEntryAccessKeyHandler(c);
    }
    if (path.match(/^\/api\/entry-access-keys\/[^/]+\/[^/]+$/) && method === 'DELETE') {
      const parts = path.split('/');
      c.req.param = (key) => {
        if (key === 'entry_id') return parts[3];
        if (key === 'user_id') return parts[4];
        return null;
      };
      return await revokeAccessKeyHandler(c);
    }
    
    // 404 for unmatched routes
    return c.json({
      success: false,
      error: 'Not Found',
      message: `Route ${method} ${path} not found`
    }, 404);
    
  } catch (error) {
    console.error('Global error handler:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
}

// Export for Vercel
export default handleRequest;

// Local development server (when run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');
  
  // Use Hono for local development since it works fine there
  const app = new Hono();
  
  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({
      success: true,
      message: 'Hono server is running locally',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: process.env.DATABASE_URL ? 'configured' : 'not configured'
    });
  });

  // Entries routes
  app.get('/api/entries', listEntriesHandler);
  app.post('/api/entries', createEntryHandler);
  app.get('/api/entries/shared-with-me', getSharedEntriesHandler);
  app.get('/api/entries/:id', getEntryHandler);
  app.put('/api/entries/:id', updateEntryHandler);
  app.delete('/api/entries/:id', deleteEntryHandler);

  // User routes
  app.get('/api/users/search', searchUsersHandler);
  app.get('/api/users/:id', getUserHandler);
  app.put('/api/users/:id', updateUserHandler);

  // Tag management routes
  app.get('/api/tags', listTagsHandler);
  app.post('/api/tags', createTagHandler);
  app.put('/api/tags/:id', updateTagHandler);
  app.delete('/api/tags/:id', deleteTagHandler);

  // User-tag assignment routes
  app.get('/api/user-tags', listUserTagsHandler);
  app.post('/api/user-tags', assignUserTagHandler);
  app.delete('/api/user-tags/:id', removeUserTagHandler);

  // Entry access key routes
  app.get('/api/entry-access-keys', listAccessKeysHandler);
  app.post('/api/entry-access-keys/batch', createBatchAccessKeysHandler);
  app.get('/api/entry-access-keys/:entry_id', getEntryAccessKeyHandler);
  app.delete('/api/entry-access-keys/:entry_id/:user_id', revokeAccessKeyHandler);

  // Auth routes
  app.post('/api/auth/google', googleAuthHandler);

  // Catch-all for unhandled routes
  app.notFound((c) => {
    return c.json({
      success: false,
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Global error handler:', err);
    return c.json({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    }, 500);
  });

  const port = process.env.PORT || 3001;

  console.log(`🔥 Hono server starting on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database URL: ${process.env.DATABASE_URL ? 'configured' : 'not configured'}`);

  serve({
    fetch: app.fetch,
    port
  });
}
