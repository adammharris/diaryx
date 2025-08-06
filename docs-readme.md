# Diaryx Services API Documentation

This documentation is automatically generated from the TypeScript source code using TypeDoc and JSDoc comments.

## Available Services

### 🔐 **Authentication Services**
- **API Auth Service** - Google OAuth with PKCE support for web and Tauri
- **Biometric Auth Service** - WebAuthn biometric authentication

### 🔒 **Encryption Services** 
- **E2E Encryption Service** - End-to-end encryption with NaCl cryptography

### 💾 **Storage Services**
- **Storage Service** - Unified storage for local filesystem and cloud sync

### 🏷️ **Sharing Services**
- **Tag Service** - Tag management and user assignment for content sharing

## Usage

### Generate Documentation
```bash
# Generate fresh documentation
bun run docs

# Generate and serve locally
bun run docs:serve
```

### View Documentation
Open `docs/index.html` in your browser, or use the serve command to view at `http://localhost:8080`

## Living Documentation

This documentation is "living" because it:
- ✅ **Stays current** - Generated directly from source code
- ✅ **Shows real examples** - Includes actual usage patterns  
- ✅ **Type-safe** - Leverages TypeScript for accuracy
- ✅ **Version controlled** - Updates with code changes
- ✅ **Interactive** - Browsable HTML with search and navigation

The JSDoc comments in the source files provide detailed information about each method, including parameters, return types, examples, and error conditions.