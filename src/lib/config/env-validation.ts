/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at build time and provides
 * type-safe access to configuration values throughout the application.
 * 
 * @description This module ensures that all required environment variables
 * are properly configured before the application starts. It provides:
 * - Build-time validation with helpful error messages
 * - Type-safe access to environment variables
 * - Clear setup instructions for different deployment scenarios
 * - Immediate failure with descriptive errors if variables are missing
 * 
 * Required environment variables:
 * - `VITE_API_BASE_URL`: Backend API base URL
 * - `VITE_GOOGLE_CLIENT_ID`: Google OAuth client ID
 * - `VITE_GOOGLE_REDIRECT_URI`: OAuth callback URL
 * 
 * @example
 * ```typescript
 * import { VITE_API_BASE_URL, ENV } from '$lib/config/env-validation';
 * 
 * // Use individual variables
 * const apiUrl = `${VITE_API_BASE_URL}/users`;
 * 
 * // Or use the ENV object
 * const config = {
 *   apiBase: ENV.VITE_API_BASE_URL,
 *   googleClientId: ENV.VITE_GOOGLE_CLIENT_ID
 * };
 * ```
 */

/**
 * Required environment variables interface
 * 
 * Defines the structure and types for all required environment variables.
 */
interface RequiredEnvVars {
  VITE_API_BASE_URL: string;
  VITE_GOOGLE_CLIENT_ID: string;
  VITE_GOOGLE_REDIRECT_URI: string;
}

/**
 * Validate that all required environment variables are present
 * 
 * Checks for the presence of all required environment variables and throws
 * a detailed error message if any are missing. The error includes setup
 * instructions for different deployment scenarios.
 * 
 * @returns {RequiredEnvVars} Object containing all validated environment variables
 * @throws {Error} If any required environment variables are missing
 * 
 * @example
 * ```typescript
 * try {
 *   const env = validateEnvironmentVariables();
 *   console.log('All environment variables validated successfully');
 * } catch (error) {
 *   console.error('Environment validation failed:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
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

/**
 * Validated environment variables object
 * 
 * Contains all required environment variables after validation.
 * This validation happens immediately when the module is imported,
 * ensuring the application fails fast if configuration is incomplete.
 * 
 * @example
 * ```typescript
 * import { ENV } from '$lib/config/env-validation';
 * 
 * // Access all variables through the ENV object
 * fetch(`${ENV.VITE_API_BASE_URL}/api/data`);
 * ```
 */
export const ENV = validateEnvironmentVariables();

/**
 * Individual environment variables exported for convenience
 * 
 * These are destructured from the validated ENV object for easier importing.
 * 
 * @example
 * ```typescript
 * import { VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID } from '$lib/config/env-validation';
 * 
 * const apiClient = new ApiClient(VITE_API_BASE_URL);
 * const oauthConfig = { clientId: VITE_GOOGLE_CLIENT_ID };
 * ```
 */
export const { 
  /**
   * Backend API base URL (e.g., "https://api.myapp.com")
   */
  VITE_API_BASE_URL, 
  /**
   * Google OAuth client ID for authentication
   */
  VITE_GOOGLE_CLIENT_ID, 
  /**
   * OAuth callback/redirect URI for the application
   */
  VITE_GOOGLE_REDIRECT_URI 
} = ENV;