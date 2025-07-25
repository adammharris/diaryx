# Diaryx API - Local Testing Guide

## Quick Start

### 1. Start the Development Server
```bash
cd api
bun install
bun run dev
```

The API server will start on `http://localhost:3001` with auto-logging of all available routes.

### 2. Auto-Discovery of New Endpoints
When you add new endpoint files, run:
```bash
bun run update-routes
```

This will automatically scan for new `.js` files in the API directory and update `index.js` with the appropriate routes.

### 3. Test Entry Sharing System

#### Prerequisites
- Database configured with RBAC schema
- User authenticated with E2E encryption unlocked
- At least one tag created with user assignments

#### Testing Flow

1. **Create a Tag and Assign Users**
   ```bash
   # Create a tag
   curl -X POST http://localhost:3001/api/tags \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"name": "work", "color": "#3b82f6"}'

   # Assign user to tag
   curl -X POST http://localhost:3001/api/user-tags \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"tag_id": "TAG_ID", "target_user_id": "USER_ID"}'
   ```

2. **Publish Entry with Tags**
   ```bash
   curl -X POST http://localhost:3001/api/entries \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "encrypted_title": "BASE64_ENCRYPTED_TITLE",
       "encrypted_content": "BASE64_ENCRYPTED_CONTENT", 
       "encryption_metadata": {"version": "1", "contentNonceB64": "NONCE"},
       "title_hash": "HASH",
       "owner_encrypted_entry_key": "BASE64_KEY",
       "owner_key_nonce": "NONCE",
       "is_published": true,
       "tag_ids": ["TAG_ID"]
     }'
   ```

3. **View Shared Entries**
   ```bash
   curl -X GET http://localhost:3001/api/entries/shared-with-me \
     -H "Authorization: Bearer OTHER_USER_TOKEN"
   ```

4. **Check Entry Access Keys**
   ```bash
   # List all access keys for current user
   curl -X GET http://localhost:3001/api/entry-access-keys \
     -H "Authorization: Bearer YOUR_TOKEN"

   # Get specific entry access key
   curl -X GET http://localhost:3001/api/entry-access-keys/ENTRY_ID \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Available Endpoints

### Entry Management
- `GET /api/entries` - List user's entries
- `POST /api/entries` - Create encrypted entry with tag sharing
- `GET /api/entries/:id` - Get specific entry
- `PUT /api/entries/:id` - Update entry
- `DELETE /api/entries/:id` - Delete entry

### Entry Sharing
- `GET /api/entries/shared-with-me` - Get entries shared with current user
- `GET /api/entries/:id/shared` - Get sharing info for entry (authors only)

### Entry Access Keys
- `GET /api/entry-access-keys` - List user's access keys
- `POST /api/entry-access-keys/batch` - Bulk create access keys
- `GET /api/entry-access-keys/:entryId` - Get access key for entry
- `DELETE /api/entry-access-keys/:entryId/:userId` - Revoke access

### Tag Management
- `GET /api/tags` - List user's tags
- `POST /api/tags` - Create new tag
- `PUT /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag

### User-Tag Assignments
- `GET /api/user-tags` - List tag assignments
- `POST /api/user-tags` - Assign user to tag
- `DELETE /api/user-tags/:id` - Remove tag assignment

### User Management
- `GET /api/users/search` - Search for users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile

### Authentication
- `POST /api/auth/google` - Google OAuth authentication

## Development Scripts

- `bun run dev` - Start development server
- `bun run update-routes` - Auto-discover and update routes
- `bun run dev:watch` - Update routes then start server
- `bun run deploy` - Deploy to Vercel

## Architecture Notes

### Handler Routing
The system uses a centralized `handlers.js` file with individual endpoint files for organization. The main `index.js` routes requests to appropriate handlers.

### Entry Sharing Flow
1. User publishes entry with selected tags
2. System creates `entry_tags` associations
3. `entrySharingService` generates encrypted keys for all users assigned to those tags
4. Keys stored in `entry_access_keys` table
5. Recipients can view shared entries via `/api/entries/shared-with-me`

### Security
- Row Level Security (RLS) enforced on all tables
- All encryption handled client-side with NaCl
- JWT authentication required for all endpoints
- SQL injection prevention with parameterized queries

## Troubleshooting

### Common Issues
1. **Database Connection**: Ensure `DATABASE_URL` environment variable is set
2. **Authentication**: Verify JWT tokens are valid and not expired
3. **CORS Issues**: Check origin is allowed in CORS configuration
4. **Route Not Found**: Run `bun run update-routes` after adding new endpoints

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and request logging.

### Database Schema
Ensure you've run the RBAC schema migrations:
```sql
-- See rbac-schema.sql for complete schema
```