/**
 * Main Vercel serverless function entry point
 * Routes all API requests through Hono handlers
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Import all handlers from the new routes directory
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

const app = new Hono();

// CORS middleware
app.use('*' , cors({
  origin: process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['https://diaryx-two.vercel.app'])
    : ['http://localhost:5173', 'http://localhost:3000', 'tauri://localhost'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  credentials: true
}));

// Logging middleware
app.use('*', logger());

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    success: true,
    message: 'Hono server is running on Vercel',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'connected' : 'not configured'
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

// Export for Vercel
export default app.fetch;

// Local development server (when run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import('@hono/node-server');
  const port = process.env.PORT || 3001;

  console.log(`🔥 Hono server starting on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database URL: ${process.env.DATABASE_URL ? 'configured' : 'not configured'}`);

  serve({
    fetch: app.fetch,
    port
  });
}
