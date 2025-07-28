/**
 * Environment variable validation - validates required variables at build time
 */

interface RequiredEnvVars {
  VITE_API_BASE_URL: string;
  VITE_GOOGLE_CLIENT_ID: string;
  VITE_GOOGLE_REDIRECT_URI: string;
}

function validateEnvironmentVariables(): RequiredEnvVars {
  const missing: string[] = [];
  
  const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const VITE_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const VITE_GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI;

  if (!VITE_API_BASE_URL) missing.push('VITE_API_BASE_URL');
  if (!VITE_GOOGLE_CLIENT_ID) missing.push('VITE_GOOGLE_CLIENT_ID');
  if (!VITE_GOOGLE_REDIRECT_URI) missing.push('VITE_GOOGLE_REDIRECT_URI');

  if (missing.length > 0) {
    const errorMessage = `
❌ BUILD ERROR: Missing required environment variables:

${missing.map(env => `   • ${env}`).join('\n')}

Please set these environment variables in:
• Local development: .env file in project root
• GitHub Pages: Repository Settings → Secrets and variables → Actions → Variables

Example .env file:
VITE_API_BASE_URL="https://your-backend.domain.com"
VITE_GOOGLE_CLIENT_ID="your-google-client-id"
VITE_GOOGLE_REDIRECT_URI="https://your-site.com/auth/callback"

For GitHub Pages deployment, add these as repository variables (without quotes).
    `.trim();

    throw new Error(errorMessage);
  }

  return {
    VITE_API_BASE_URL,
    VITE_GOOGLE_CLIENT_ID,
    VITE_GOOGLE_REDIRECT_URI,
  };
}

// Validate immediately when this module is imported
export const ENV = validateEnvironmentVariables();

// Export individual variables for convenience
export const { 
  VITE_API_BASE_URL, 
  VITE_GOOGLE_CLIENT_ID, 
  VITE_GOOGLE_REDIRECT_URI 
} = ENV;