/**
 * API Middleware for authentication
 */

import jwt from 'jsonwebtoken';

/**
 * Simplified authentication logic
 * Extracts user identity from JWT token or X-User-ID header.
 * This function is designed to work with Hono's request object.
 */
export function authenticateUser(honoRequest) {
  const authHeader = honoRequest.header('authorization');
  const userIdHeader = honoRequest.header('x-user-id');
  
  // Option 1: JWT Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-here';
      
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
  
  // Option 2: Simple User ID header (for development/testing)
  if (userIdHeader) {
    return {
      userId: userIdHeader,
      isAuthenticated: true,
      method: 'header'
    };
  }
  
  return { isAuthenticated: false, error: 'No authentication provided' };
}

/**
 * Hono middleware to protect routes that require authentication.
 * It uses `authenticateUser` to verify the request and sets user info
 * in the context if authentication is successful.
 */
export function requireAuth(handler) {
  return async (c) => {
    const auth = authenticateUser(c.req);
    
    if (!auth.isAuthenticated) {
      return c.json({
        success: false,
        error: 'Authentication required',
        message: auth.error || 'Please provide valid authentication'
      }, 401);
    }
    
    // Add auth info to the context for use in subsequent handlers
    c.set('auth', auth);
    
    return await handler(c);
  };
}
