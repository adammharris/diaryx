// src/hooks.server.js

/**
 * @param {string} origin
 */
function isAllowedOrigin(origin) {
  // Allow requests from the vercel preview URL and localhost for development
  if (origin && (origin.endsWith('-diaryx.vercel.app') || origin.startsWith('http://localhost:'))) {
    return true;
  }
  // Allow requests from the production domain
  if (process.env.NODE_ENV === 'production' && origin === 'https://your-production-domain.com') {
    return true;
  }
  return false;
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const origin = event.request.headers.get('Origin');
  
  // This is for all /api routes
  if (event.url.pathname.startsWith('/api')) {
    // This is a preflight request. We need to handle it separately.
    if (event.request.method === 'OPTIONS') {
      if (isAllowedOrigin(origin)) {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      } else {
         return new Response('CORS preflight check failed', { status: 403 });
      }
    }

    // This is a normal API request. We resolve it and add the CORS header.
    const response = await resolve(event);
    if (isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
    return response;
  }

  // For all other requests, just resolve them.
  return await resolve(event);
}