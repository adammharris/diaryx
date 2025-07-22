# Hono Local Development Server

This is a Hono-based local development server that converts your Vercel serverless functions to run locally for development.

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Start the local Hono server:**
   ```bash
   bun run dev:hono
   ```

   Or using Node.js:
   ```bash
   npm run start
   ```

## Available Commands

- `bun run dev:hono` - Start Hono development server
- `bun run start` - Start production server 
- `bun run dev` - Start Vercel development server (original)

## API Endpoints

The server will run on `http://localhost:3001` by default.

### Available Routes:

- `GET /api/health` - Health check endpoint
- `GET /api/entries` - List user entries (requires auth)
- `POST /api/entries` - Create new entry (requires auth)
- `GET /api/entries/:id` - Get specific entry (requires auth)
- `PUT /api/entries/:id` - Update entry (requires auth)
- `DELETE /api/entries/:id` - Delete entry (requires auth)
- `GET /api/auth/google` - Google auth endpoint
- `POST /api/auth/google` - Google auth callback

## Authentication

The server supports two authentication methods:

1. **JWT Bearer Token:**
   ```
   Authorization: Bearer <your-jwt-token>
   ```

2. **Simple User ID Header (for development):**
   ```
   X-User-ID: <user-id>
   ```

## Testing

You can test the server using curl:

```bash
# Health check
curl http://localhost:3001/api/health

# List entries (with auth header)
curl -H "X-User-ID: test-user-123" http://localhost:3001/api/entries

# Create entry (with auth header)
curl -X POST -H "Content-Type: application/json" -H "X-User-ID: test-user-123" \
  -d '{"encrypted_title":"test","encrypted_content":"test","encryption_metadata":"{}","title_hash":"test","owner_encrypted_entry_key":"test","owner_key_nonce":"test"}' \
  http://localhost:3001/api/entries
```

## Architecture

The server uses a Hono adapter (`lib/hono-adapter.js`) to convert Vercel-style request/response handlers to work with Hono's context-based system. This allows you to:

- Keep your existing Vercel functions unchanged
- Run them locally with Hono for development
- Maintain compatibility with both environments

## Features

- ✅ CORS support for local development
- ✅ Request logging
- ✅ Authentication middleware
- ✅ Error handling
- ✅ Health checks
- ✅ Environment-specific configuration
- ✅ Compatible with existing Vercel functions

## Troubleshooting

1. **Database connection issues**: Make sure your `DATABASE_URL` is correct in `.env`
2. **Authentication failures**: Verify JWT_SECRET is set or use X-User-ID header for development
3. **CORS issues**: Check that your frontend URL is included in the CORS origins
4. **Port conflicts**: Change PORT in `.env` if 3001 is already in use