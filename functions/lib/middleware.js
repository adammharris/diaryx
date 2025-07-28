/**
 * API Middleware for authentication (Cloudflare Pages compatible)
 */

import jwt from 'jsonwebtoken';

/**
 * Simplified authentication logic for Cloudflare Pages
 * Extracts user identity from JWT token or X-User-ID header.
 * This function is designed to work with Hono's request object and Cloudflare env.
 */
export function authenticateUser(honoRequest, env) {
  const authHeader = honoRequest.header('authorization');
  const userIdHeader = honoRequest.header('x-user-id');
  
  // Option 1: JWT Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwtSecret = env.JWT_SECRET || 'your-jwt-secret-here';
      
      const decoded = jwt.verify(token, jwtSecret);
      return {
        userId: decoded.userId || decoded.sub,
        email: decoded.email,
        isAuthenticated: true
      };
    } catch (error) {
      console.error('JWT verification failed:', error);
      return { isAuthenticated: false, error: 'Invalid token' };
    }
  }
  
  // Option 2: Direct User ID (for development/testing)
  if (userIdHeader) {
    return {
      userId: userIdHeader,
      email: null, // Could be fetched from database if needed
      isAuthenticated: true
    };
  }
  
  return { isAuthenticated: false, error: 'No authentication provided' };
}

/**
 * Middleware function that can be used with Hono
 */
export function createAuthMiddleware() {
  return async (c, next) => {
    const auth = authenticateUser(c.req, c.env);
    
    if (!auth.isAuthenticated) {
      return c.json({ error: auth.error || 'Authentication required' }, 401);
    }
    
    // Attach user info to context
    c.set('user', auth);
    
    await next();
  };
}

/**
 * Get authenticated user from Hono context
 */
export function getAuthenticatedUser(c) {
  return c.get('user');
}
