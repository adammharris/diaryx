const { protect, optionalProtect } = require('../lib/middleware');
const {
  getEntry,
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
} = require('../lib/dal');

const handler = async (req, res) => {
  // --- FIX #1: Handle the CORS Pre-flight OPTIONS request ---
  // This must be the very first thing the function does.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  const { entryId } = req.query;

  if (entryId) {
    switch (req.method) {
      case 'GET':
        return optionalProtect(getEntry)(req, res);
      case 'PUT':
        return protect(updateEntry)(req, res);
      case 'DELETE':
        return protect(deleteEntry)(req, res);
      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } else {
    switch (req.method) {
      case 'GET':
        return optionalProtect(getEntries)(req, res);
      case 'POST':
        // The createEntry function itself needs the fix for the null frontmatter.
        // Let's ensure that logic is correct.
        const createEntryWithFix = async (req, res) => {
            try {
                const userId = req.user.userId;
                
                // --- FIX #2: Use 'let' and check for null ---
                let {
                  encrypted_title,
                  encrypted_content,
                  encrypted_frontmatter,
                  encryption_metadata,
                  title_hash,
                  content_preview_hash,
                  is_published = false,
                  file_path,
                  owner_encrypted_entry_key,
                  owner_key_nonce,
                  tag_ids = []
                } = req.body;
        
                // If encrypted_frontmatter is null or undefined, default it to an empty string.
                if (encrypted_frontmatter == null) {
                  encrypted_frontmatter = '';
                }

                // Now, call the actual database logic with the corrected data.
                return createEntry(req, res, {
                    userId,
                    encrypted_title,
                    encrypted_content,
                    encrypted_frontmatter, // This is now guaranteed to be a string
                    encryption_metadata,
                    title_hash,
                    content_preview_hash,
                    is_published,
                    file_path,
                    owner_encrypted_entry_key,
                    owner_key_nonce,
                    tag_ids
                });

            } catch (error) {
                console.error('Failed to create entry wrapper:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create entry',
                    message: error.message,
                });
            }
        };
        
        return protect(createEntryWithFix)(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  }
};

module.exports = handler;