/**
 * Auth handlers (Cloudflare Pages compatible)
 */

import { upsertUser } from '../lib/database.js';

/**
 * POST /api/auth/google - Google OAuth handler
 */
export async function googleAuthHandler(c) {
  try {
    const body = await c.req.json();
    const { token, user } = body;

    // In a real implementation, you'd verify the Google token here
    // For now, we'll just create/update the user
    if (!user || !user.id || !user.email) {
      return c.json({ 
        success: false, 
        error: 'Invalid user data' 
      }, 400);
    }

    const dbUser = await upsertUser({
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0]
    }, c.env);

    return c.json({
      success: true,
      data: {
        user: dbUser,
        token: token // In production, generate your own JWT here
      }
    });
  } catch (error) {
    console.error('Error in Google auth:', error);
    return c.json({ 
      success: false, 
      error: 'Authentication failed' 
    }, 500);
  }
}
