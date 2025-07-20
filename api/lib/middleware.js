/**
 * API Middleware for authentication, CORS, and request handling
 */

import jwt from 'jsonwebtoken';
import cors from 'cors';

/**
 * CORS middleware configuration
 */
export const corsMiddleware = cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com', 'tauri://localhost']  // Update with your actual domains
    : ['http://localhost:5173', 'http://localhost:3000', 'tauri://localhost'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  credentials: true
});

/**
 * Simplified authentication middleware
 * For now, we'll use a simple JWT token or X-User-ID header
 * In production, integrate with your chosen auth provider (Firebase, Auth0, etc.)
 */
export function authenticateUser(req) {
  const authHeader = req.headers.authorization;
  const userIdHeader = req.headers['x-user-id'];
  
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
 * Authentication middleware wrapper
 */
export function requireAuth(handler) {
  return async (req, res) => {
    // Apply CORS
    await new Promise((resolve, reject) => {
      corsMiddleware(req, res, (result) => {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      });
    });
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Authenticate user
    const auth = authenticateUser(req);
    
    if (!auth.isAuthenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: auth.error || 'Please provide valid authentication'
      });
    }
    
    // Add auth info to request
    req.user = auth;
    
    try {
      return await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  };
}

/**
 * Public endpoint wrapper (no auth required)
 */
export function publicEndpoint(handler) {
  return async (req, res) => {
    // Apply CORS
    await new Promise((resolve, reject) => {
      corsMiddleware(req, res, (result) => {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      });
    });
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    try {
      return await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  };
}

/**
 * Validate request method
 */
export function validateMethod(allowedMethods) {
  return (req, res, next) => {
    if (!allowedMethods.includes(req.method)) {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods
      });
    }
    next();
  };
}

/**
 * Validate required fields in request body
 */
export function validateRequired(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missing
      });
    }
    
    next();
  };
}

/**
 * Rate limiting (simple in-memory implementation)
 * In production, use Redis or similar
 */
const rateLimitStore = new Map();

export function rateLimit(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = rateLimitStore.get(key);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
    }
    
    limit.count++;
    next();
  };
}

/**
 * Request logging middleware
 */
export function logRequest(req, res, next) {
  const start = Date.now();
  const { method, url } = req;
  const userAgent = req.headers['user-agent'];
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${userAgent}`);
  
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${method} ${url} - ${res.statusCode} - ${duration}ms`);
    originalSend.call(this, data);
  };
  
  next();
}

/**
 * Error handler wrapper
 */
export function handleError(error, req, res) {
  console.error('API Error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    user: req.user?.userId
  });
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack })
  });
}