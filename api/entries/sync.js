/**
 * Batch sync operations for entries
 * POST /api/entries/sync - Sync multiple entries with conflict detection
 */

import { requireAuth } from '../lib/middleware.js';
import { queryWithUser, batchUpdateWithConflictDetection } from '../lib/database.js';

/**
 * Validate encrypted data format and integrity
 */
function validateEncryptedData(data) {
  const { encrypted_title, encrypted_content, encryption_metadata, title_hash } = data;
  
  // Check required fields
  if (!encrypted_title || !encrypted_content || !encryption_metadata || !title_hash) {
    return { valid: false, error: 'Missing required encrypted fields' };
  }
  
  // Validate Base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(encrypted_title) || !base64Regex.test(encrypted_content)) {
    return { valid: false, error: 'Invalid Base64 format in encrypted data' };
  }
  
  // Check minimum lengths for security
  if (encrypted_title.length < 20 || encrypted_content.length < 20) {
    return { valid: false, error: 'Encrypted data too short' };
  }
  
  return { valid: true };
}

export default async function handler(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'POST':
      return requireAuth(batchSync)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ['POST']
      });
  }
}

/**
 * Batch sync multiple entries with conflict detection
 */
async function batchSync(req, res) {
  try {
    const userId = req.user.userId;
    const { operations } = req.body;
    
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Operations array is required and must not be empty'
      });
    }
    
    if (operations.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 operations allowed per batch'
      });
    }
    
    // Validate each operation
    const validatedOperations = [];
    const validationErrors = [];
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const { type, entryId, data, clientModifiedAt } = operation;
      
      if (!type || !entryId) {
        validationErrors.push(`Operation ${i}: Missing type or entryId`);
        continue;
      }
      
      if (type === 'update') {
        if (!data) {
          validationErrors.push(`Operation ${i}: Missing data for update`);
          continue;
        }
        
        // Validate encrypted data if present
        if (data.encrypted_title || data.encrypted_content) {
          const validation = validateEncryptedData({
            encrypted_title: data.encrypted_title || 'dummy',
            encrypted_content: data.encrypted_content || 'dummy',
            encryption_metadata: data.encryption_metadata || '{"contentNonceB64":"dummy","version":"1"}',
            title_hash: data.title_hash || 'dummy'
          });
          
          if (!validation.valid) {
            validationErrors.push(`Operation ${i}: ${validation.error}`);
            continue;
          }
        }
        
        validatedOperations.push({
          type: 'update',
          table: 'entries',
          id: entryId,
          data: {
            ...data,
            encryption_metadata: data.encryption_metadata ? JSON.stringify(data.encryption_metadata) : undefined
          },
          expectedTimestamp: clientModifiedAt
        });
      } else {
        validationErrors.push(`Operation ${i}: Unsupported operation type: ${type}`);
      }
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation errors in operations',
        details: validationErrors
      });
    }
    
    // Execute batch operations
    const results = await batchUpdateWithConflictDetection(userId, validatedOperations);
    
    // Categorize results
    const successful = results.filter(r => r.success);
    const conflicts = results.filter(r => r.conflict);
    const errors = results.filter(r => !r.success && !r.conflict);
    
    return res.status(200).json({
      success: true,
      data: {
        total: results.length,
        successful: successful.length,
        conflicts: conflicts.length,
        errors: errors.length,
        results: results
      }
    });
    
  } catch (error) {
    console.error('Batch sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to perform batch sync',
      message: error.message
    });
  }
}
