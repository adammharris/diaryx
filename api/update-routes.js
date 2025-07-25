#!/usr/bin/env node

/**
 * Auto-route discovery and index.js updater
 * Scans the api directory for endpoint files and updates index.js automatically
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const API_DIR = __dirname;
const INDEX_FILE = join(API_DIR, 'index.js');

// Route patterns to detect
const ROUTE_PATTERNS = {
  // Standard CRUD patterns
  'index.js': ['GET', 'POST'],
  '[id].js': ['GET', 'PUT', 'DELETE'],
  '[entryId].js': ['GET', 'DELETE'],
  'shared-with-me.js': ['GET'],
  'batch.js': ['POST'],
  // Add more patterns as needed
};

/**
 * Recursively scan directory for API endpoint files
 */
function scanApiDirectory(dir, basePath = '') {
  const routes = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = join(basePath, item);
      
      // Skip non-API files
      if (item === 'index.js' || item === 'handlers.js' || item === 'lib' || 
          item === 'node_modules' || item.startsWith('.') || item === 'update-routes.js') {
        continue;
      }
      
      if (statSync(fullPath).isDirectory()) {
        // Recursively scan subdirectories
        routes.push(...scanApiDirectory(fullPath, relativePath));
      } else if (item.endsWith('.js')) {
        // Found an endpoint file
        const routeInfo = analyzeEndpointFile(fullPath, relativePath);
        if (routeInfo) {
          routes.push(routeInfo);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return routes;
}

/**
 * Analyze an endpoint file to determine its routes
 */
function analyzeEndpointFile(filePath, relativePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const routes = [];
    
    // Extract the directory structure to build API path
    const pathParts = relativePath.replace('.js', '').split('/');
    let apiPath = '/api/' + pathParts.join('/');
    
    // Handle dynamic parameters
    apiPath = apiPath.replace('[id]', ':id')
                     .replace('[entryId]', ':entryId')
                     .replace('[userId]', ':userId');
    
    // Detect supported HTTP methods from the file content
    const methods = [];
    if (content.includes("method === 'GET'") || content.includes('case \'GET\'')) {
      methods.push('GET');
    }
    if (content.includes("method === 'POST'") || content.includes('case \'POST\'')) {
      methods.push('POST');
    }
    if (content.includes("method === 'PUT'") || content.includes('case \'PUT\'')) {
      methods.push('PUT');
    }
    if (content.includes("method === 'DELETE'") || content.includes('case \'DELETE\'')) {
      methods.push('DELETE');
    }
    
    // If no methods detected, use default based on filename
    if (methods.length === 0) {
      const filename = pathParts[pathParts.length - 1];
      if (ROUTE_PATTERNS[filename + '.js']) {
        methods.push(...ROUTE_PATTERNS[filename + '.js']);
      } else {
        methods.push('GET'); // Default fallback
      }
    }
    
    return {
      path: apiPath,
      methods,
      file: relativePath,
      handlerName: generateHandlerName(pathParts)
    };
    
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Generate a consistent handler name from path parts
 */
function generateHandlerName(pathParts) {
  // Convert path parts to camelCase handler name
  return pathParts
    .map((part, index) => {
      // Remove brackets and capitalize
      const cleanPart = part.replace(/[\[\]]/g, '');
      return index === 0 ? cleanPart : cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1);
    })
    .join('') + 'Handler';
}

/**
 * Update index.js with discovered routes
 */
function updateIndexFile(routes) {
  try {
    let content = readFileSync(INDEX_FILE, 'utf-8');
    
    // Find the position to insert route definitions
    const routeStartMarker = '// Auto-generated routes - START';
    const routeEndMarker = '// Auto-generated routes - END';
    
    let routeDefinitions = '';
    let availableRoutes = [];
    
    // Group routes by path to handle multiple methods
    const routesByPath = {};
    routes.forEach(route => {
      if (!routesByPath[route.path]) {
        routesByPath[route.path] = {
          path: route.path,
          methods: [],
          handlerName: route.handlerName,
          file: route.file
        };
      }
      routesByPath[route.path].methods.push(...route.methods);
    });
    
    // Generate route definitions
    Object.values(routesByPath).forEach(route => {
      route.methods.forEach(method => {
        const methodLower = method.toLowerCase();
        routeDefinitions += `app.${methodLower}('${route.path}', ${route.handlerName});\n`;
        availableRoutes.push(`${method} ${route.path}`);
      });
    });
    
    // Check if markers exist, if not add them
    if (!content.includes(routeStartMarker)) {
      // Find a good place to insert - after existing routes but before catch-all
      const notFoundIndex = content.indexOf('app.notFound');
      if (notFoundIndex > -1) {
        const insertPosition = content.lastIndexOf('\n', notFoundIndex);
        content = content.slice(0, insertPosition) + 
                 `\n\n${routeStartMarker}\n${routeEndMarker}\n` + 
                 content.slice(insertPosition);
      }
    }
    
    // Replace the content between markers
    const startIndex = content.indexOf(routeStartMarker);
    const endIndex = content.indexOf(routeEndMarker);
    
    if (startIndex > -1 && endIndex > -1) {
      const before = content.slice(0, startIndex + routeStartMarker.length);
      const after = content.slice(endIndex);
      
      content = before + '\n' + routeDefinitions + after;
    }
    
    // Update available routes list in notFound handler
    const routeListStart = content.indexOf('availableRoutes: [');
    const routeListEnd = content.indexOf(']', routeListStart);
    
    if (routeListStart > -1 && routeListEnd > -1) {
      const routeListItems = availableRoutes.map(route => `      '${route}'`).join(',\n');
      const before = content.slice(0, routeListStart + 'availableRoutes: ['.length);
      const after = content.slice(routeListEnd);
      
      content = before + '\n' + routeListItems + '\n    ' + after;
    }
    
    // Write updated content
    writeFileSync(INDEX_FILE, content, 'utf-8');
    
    console.log('✅ Updated index.js with auto-discovered routes:');
    availableRoutes.forEach(route => console.log(`   ${route}`));
    
  } catch (error) {
    console.error('Error updating index.js:', error.message);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning API directory for endpoints...');
  
  const routes = scanApiDirectory(API_DIR);
  
  console.log(`📁 Found ${routes.length} route definitions:`);
  routes.forEach(route => {
    console.log(`   ${route.methods.join(', ')} ${route.path} -> ${route.file}`);
  });
  
  if (routes.length > 0) {
    console.log('\n🔄 Updating index.js...');
    updateIndexFile(routes);
  } else {
    console.log('\n⚠️  No routes found to update');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanApiDirectory, updateIndexFile };