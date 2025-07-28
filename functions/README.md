# Cloudflare Pages Functions Setup

This directory contains the serverless API functions for DiaryX, configured to work with Cloudflare Pages.

## Structure

```
functions/
├── api/
│   └── [[route]].js          # Main API handler using Hono (catches all /api/* routes)
├── lib/
│   ├── database.js           # Cloudflare-compatible database utilities
│   └── middleware.js         # Authentication middleware
└── routes/
    ├── auth.js              # Authentication handlers
    ├── entries.js           # Entry CRUD operations
    ├── users.js             # User operations
    ├── tags.js              # Tag management
    ├── user-tags.js         # User-tag assignments
    └── entry-access-keys.js # Entry sharing access keys
```

## Key Changes for Cloudflare Pages

1. **Environment Variables**: Access via `c.env` instead of `process.env`
2. **Database**: Uses `neon()` function instead of Pool for serverless compatibility  
3. **Export**: Uses `export const onRequest = app.fetch` instead of Vercel handlers
4. **Routing**: Uses `[[route]].js` to catch all API routes under `/api/`
5. **Dependencies**: All API dependencies are included in root `package.json`

## Environment Variables

Set these in your Cloudflare Pages dashboard under **Settings > Environment Variables**:

- `DATABASE_URL` - Your Neon database connection string
- `JWT_SECRET` - Secret for JWT token verification

## Deployment

### Automatic Deployment

1. Connect your GitHub repository to Cloudflare Pages:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Click "Pages" > "Create a project" > "Connect to Git"
   - Select your repository

2. Configure build settings:
   - **Framework preset**: None (or SvelteKit if available)
   - **Build command**: `bun run build:cloudflare`
   - **Build output directory**: `.svelte-kit/output/client`
   - **Root directory**: `/` (leave empty)

3. Set environment variables in the dashboard

4. Deploy! Your API will be available at `https://your-domain.pages.dev/api/`

### Manual Deployment

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy .svelte-kit/output/client --project-name your-project-name
```

## Development

For local development with Cloudflare Pages Functions:

```bash
# Install dependencies
bun install

# Start development server with Cloudflare compatibility
bun run dev:cloudflare
```

Or use Wrangler for local testing:

```bash
# Install Wrangler globally
bun add -g wrangler

# Run local development
wrangler pages dev .svelte-kit/output/client --compatibility-date 2023-12-01
```

## API Routes

All routes are prefixed with `/api/`:

- **Auth**: `POST /api/auth/google`
- **Users**: `GET /api/users/:id`, `PUT /api/users/:id`, `GET /api/users/search`
- **Entries**: `GET|POST /api/entries`, `GET|PUT|DELETE /api/entries/:id`, `GET /api/entries/shared-with-me`
- **Tags**: `GET|POST /api/tags`, `PUT|DELETE /api/tags/:id`
- **User Tags**: `GET|POST /api/user-tags`, `DELETE /api/user-tags/:id`
- **Access Keys**: `GET /api/entry-access-keys`, `POST /api/entry-access-keys/batch`, `GET /api/entry-access-keys/:entry_id`, `DELETE /api/entry-access-keys/:entry_id/:user_id`

## Troubleshooting

- If functions don't work, check the Functions tab in Cloudflare Pages dashboard
- Ensure all environment variables are set correctly
- Check the build logs for any import errors
- Verify your database connection string is accessible from Cloudflare's network
