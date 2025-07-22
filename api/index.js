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
  deleteEntryHandler
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
app.get('/api/entries/:id', getEntryHandler);
app.put('/api/entries/:id', updateEntryHandler);
app.delete('/api/entries/:id', deleteEntryHandler);

// User routes (native Hono handlers)
app.get('/api/users', searchUsersHandler);
app.get('/api/users/:id', getUserHandler);
app.put('/api/users/:id', updateUserHandler);

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
      'GET /api/users',
      'GET /api/users/:id',
      'PUT /api/users/:id',
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