import { Hono } from 'hono';

// Import Cloudflare-compatible route handlers
import { googleAuthHandler } from '../routes/auth.js';
import {
  listEntriesHandler,
  createEntryHandler,
  getEntryHandler,
  updateEntryHandler,
  deleteEntryHandler,
  getSharedEntriesHandler,
} from '../routes/entries.js';
import { 
  getUserHandler, 
  updateUserHandler, 
  searchUsersHandler 
} from '../routes/users.js';
import { 
  listTagsHandler, 
  createTagHandler, 
  updateTagHandler, 
  deleteTagHandler 
} from '../routes/tags.js';
import { 
  listUserTagsHandler, 
  assignUserTagHandler, 
  removeUserTagHandler 
} from '../routes/user-tags.js';
import { 
  listAccessKeysHandler, 
  createBatchAccessKeysHandler, 
  getEntryAccessKeyHandler, 
  revokeAccessKeyHandler 
} from '../routes/entry-access-keys.js';

// Create Hono app without base path (Cloudflare Pages handles the /api routing)
const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    success: true,
    message: 'Hono server is running on Cloudflare Pages!',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.post('/auth/google', googleAuthHandler);

// User routes
app.get('/users/search', searchUsersHandler);
app.get('/users/:id', getUserHandler);
app.put('/users/:id', updateUserHandler);

// Entries routes
app.get('/entries', listEntriesHandler);
app.post('/entries', createEntryHandler);
app.get('/entries/shared-with-me', getSharedEntriesHandler);
app.get('/entries/:id', getEntryHandler);
app.put('/entries/:id', updateEntryHandler);
app.delete('/entries/:id', deleteEntryHandler);

// Tag management routes
app.get('/tags', listTagsHandler);
app.post('/tags', createTagHandler);
app.put('/tags/:id', updateTagHandler);
app.delete('/tags/:id', deleteTagHandler);

// User-tag assignment routes
app.get('/user-tags', listUserTagsHandler);
app.post('/user-tags', assignUserTagHandler);
app.delete('/user-tags/:id', removeUserTagHandler);

// Entry access key routes
app.get('/entry-access-keys', listAccessKeysHandler);
app.post('/entry-access-keys/batch', createBatchAccessKeysHandler);
app.get('/entry-access-keys/:entry_id', getEntryAccessKeyHandler);
app.delete('/entry-access-keys/:entry_id/:user_id', revokeAccessKeyHandler);

// Export for Cloudflare Pages Functions
export const onRequest = app.fetch;
