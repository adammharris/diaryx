/**
 * Main Vercel serverless function entry point
 * Routes all API requests through Hono handlers
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Import all handlers from consolidated file
import {
  googleAuthHandler,
  getUserHandler,
  updateUserHandler,
  searchUsersHandler,
  entriesHandler,
  getEntryHandler,
  updateEntryHandler,
  deleteEntryHandler,
  // Tag management handlers
  tagsHandler,
  updateTagHandler,
  deleteTagHandler,
  // User-tag assignment handlers
  userTagsHandler,
  removeUserTagHandler,
  // Entry access key handlers
  entryAccessKeysHandler,
  // Shared entries handlers
  getSharedEntriesHandler,
  getEntrySharedUsersHandler
} from './handlers.js';

const app = new Hono();

// CORS middleware
app.use('*', cors({
  origin: process.env.NODE_ENV === 'production' 
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
    environment: process.env.NODE_ENV || 'production',
    database: process.env.DATABASE_URL ? 'connected' : 'not configured'
  });
});

// Entries routes (native Hono handlers)
app.get('/api/entries', entriesHandler);
app.post('/api/entries', entriesHandler);
app.get('/api/entries/shared-with-me', getSharedEntriesHandler);
app.get('/api/entries/:id', getEntryHandler);
app.put('/api/entries/:id', updateEntryHandler);
app.delete('/api/entries/:id', deleteEntryHandler);
app.get('/api/entries/:id/shared', getEntrySharedUsersHandler);

// User routes (native Hono handlers)
app.get('/api/users/search', searchUsersHandler);
app.get('/api/users/:id', getUserHandler);
app.put('/api/users/:id', updateUserHandler);

// Tag management routes
app.get('/api/tags', tagsHandler);
app.post('/api/tags', tagsHandler);
app.put('/api/tags/:id', updateTagHandler);
app.delete('/api/tags/:id', deleteTagHandler);

// User-tag assignment routes
app.get('/api/user-tags', userTagsHandler);
app.post('/api/user-tags', userTagsHandler);
app.delete('/api/user-tags/:id', removeUserTagHandler);

// Entry access key routes
app.get('/api/entry-access-keys', entryAccessKeysHandler);
app.post('/api/entry-access-keys/batch', entryAccessKeysHandler);
app.get('/api/entry-access-keys/:entryId', entryAccessKeysHandler);
app.delete('/api/entry-access-keys/:entryId/:userId', entryAccessKeysHandler);

// Auth routes (native Hono handlers)
app.post('/api/auth/google', googleAuthHandler);

// Catch-all for unhandled routes
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
    availableRoutes: [
      'GET /api/health',
      'GET /api/entries',
      'POST /api/entries', 
      'GET /api/entries/:id',
      'PUT /api/entries/:id',
      'DELETE /api/entries/:id',
      'GET /api/entries/shared-with-me',
      'GET /api/entries/:id/shared',
      'GET /api/users/search',
      'GET /api/users/:id',
      'PUT /api/users/:id',
      'GET /api/tags',
      'POST /api/tags',
      'PUT /api/tags/:id',
      'DELETE /api/tags/:id',
      'GET /api/user-tags',
      'POST /api/user-tags',
      'DELETE /api/user-tags/:id',
      'GET /api/entry-access-keys',
      'POST /api/entry-access-keys/batch',
      'GET /api/entry-access-keys/:entryId',
      'DELETE /api/entry-access-keys/:entryId/:userId',
      'POST /api/auth/google'
    ]
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
  console.log(`\nAvailable routes:`);
  console.log(`  GET    http://localhost:${port}/api/health`);
  console.log(`  GET    http://localhost:${port}/api/entries`);
  console.log(`  POST   http://localhost:${port}/api/entries`);
  console.log(`  GET    http://localhost:${port}/api/entries/:id`);
  console.log(`  PUT    http://localhost:${port}/api/entries/:id`);
  console.log(`  DELETE http://localhost:${port}/api/entries/:id`);
  console.log(`  GET    http://localhost:${port}/api/entries/shared-with-me`);
  console.log(`  GET    http://localhost:${port}/api/entries/:id/shared`);
  console.log(`  GET    http://localhost:${port}/api/users/search`);
  console.log(`  GET    http://localhost:${port}/api/users/:id`);
  console.log(`  PUT    http://localhost:${port}/api/users/:id`);
  console.log(`  GET    http://localhost:${port}/api/tags`);
  console.log(`  POST   http://localhost:${port}/api/tags`);
  console.log(`  PUT    http://localhost:${port}/api/tags/:id`);
  console.log(`  DELETE http://localhost:${port}/api/tags/:id`);
  console.log(`  GET    http://localhost:${port}/api/user-tags`);
  console.log(`  POST   http://localhost:${port}/api/user-tags`);
  console.log(`  DELETE http://localhost:${port}/api/user-tags/:id`);
  console.log(`  GET    http://localhost:${port}/api/entry-access-keys`);
  console.log(`  POST   http://localhost:${port}/api/entry-access-keys/batch`);
  console.log(`  GET    http://localhost:${port}/api/entry-access-keys/:entryId`);
  console.log(`  DELETE http://localhost:${port}/api/entry-access-keys/:entryId/:userId`);
  console.log(`  POST   http://localhost:${port}/api/auth/google`);

  serve({
    fetch: app.fetch,
    port
  });
}