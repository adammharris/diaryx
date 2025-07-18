# Diaryx - Personal Journal Application

## Overview
Diaryx is a cross-platform personal journal application built with Tauri 2.0 and Svelte 5, supporting both desktop (Tauri) and web deployment modes with optional end-to-end encryption.

## Architecture

### Platform Support
- **Desktop**: Tauri 2.0 application with native file system access
- **Web**: Browser-based application using IndexedDB for storage
- **Hybrid Storage**: Intelligent storage layer that adapts to the platform

### Core Technologies
- **Frontend**: Svelte 5 with TypeScript
- **Backend**: Tauri 2.0 (Rust)
- **Package Manager**: Bun
- **Build Adapter**: SSG (Static Site Generation) for Tauri builds
- **Styling**: Vanilla CSS with CSS custom properties for theming
- **Encryption**: Noble crypto libraries (@noble/ciphers, @noble/hashes)
- **Storage**: File system (Tauri) + IndexedDB cache, or IndexedDB only (web)
- **Frontmatter**: YAML frontmatter parsing with js-yaml library

## Project Structure

```
src/
├── lib/
│   ├── components/           # Svelte components
│   │   ├── Editor.svelte    # Main editor with encryption support
│   │   ├── EntryCard.svelte # Entry list item component
│   │   ├── PasswordPrompt.svelte # Password input modal
│   │   ├── InfoModal.svelte # Entry metadata and frontmatter display
│   │   └── Settings.svelte  # Application settings
│   ├── storage/             # Modular storage architecture
│   │   ├── index.ts        # Storage factory and singleton
│   │   ├── types.ts        # TypeScript interfaces
│   │   ├── main.adapter.ts # Main coordinating adapter
│   │   ├── tauri.adapter.ts # Tauri file system operations
│   │   ├── cache.adapter.ts # IndexedDB cache layer
│   │   ├── web.adapter.ts  # Web-only storage features
│   │   ├── preview.service.ts # Content preview generation
│   │   ├── title.service.ts # Title extraction and fallback
│   │   └── frontmatter.service.ts # YAML frontmatter parsing
│   ├── stores/             # Svelte stores
│   │   ├── theme.js       # Theme management
│   │   ├── password.ts    # Password session management
│   │   └── keyboard.js    # Mobile keyboard detection
│   └── utils/             # Utility functions
│       ├── crypto.ts      # Encryption/decryption functions
│       └── tauri.ts       # Tauri environment detection
├── routes/
│   └── +page.svelte       # Main application page
└── app.html               # HTML template

src-tauri/
├── src/
│   ├── main.rs           # Tauri app entry point
│   └── lib.rs            # Custom Tauri commands (legacy)
├── capabilities/
│   └── default.json      # Tauri permissions
└── Cargo.toml           # Rust dependencies and features
```

## Key Components

### Storage Architecture
The storage system uses a modular architecture with separation of concerns:

- **MainStorageAdapter**: Coordinates between platform-specific adapters
- **TauriStorageAdapter**: Handles file system operations using Tauri FS plugin
- **CacheStorageAdapter**: Manages IndexedDB caching and transactions
- **WebStorageAdapter**: Provides web-only storage features
- **PreviewService**: Generates content previews from markdown
- **TitleService**: Extracts and generates entry titles

### File System Integration
- **Location**: `~/Documents/Diaryx/` (BaseDirectory.Document)
- **Format**: Markdown files with `.md` extension
- **Naming**: ISO datetime format (e.g., `2025-01-15T10-30-45.md`)
- **Watching**: Automatic file change detection using `watchImmediate`

### Encryption System
- **Algorithm**: AES-GCM with PBKDF2 key derivation
- **Session Management**: Password caching per entry ID
- **Visual Indicators**: 🔒 icons for encrypted entries
- **Graceful Degradation**: Fallback titles when content is encrypted

### Frontmatter System
- **Format**: YAML frontmatter in markdown files (industry standard)
- **Parsing**: Browser-compatible js-yaml library (not gray-matter due to Buffer dependency)
- **Storage**: Embedded in `.md` files between `---` delimiters
- **Supported Fields**: tags, title, date, custom metadata
- **Info Modal**: Displays parsed frontmatter, tags, and content statistics
- **Example**:
  ```yaml
  ---
  tags: [personal, work, important]
  title: "Custom Title"
  date: 2025-01-18
  ---
  ```

## Development Practices

### Svelte 5 Patterns
- Use `$state()` for reactive variables
- Use `$derived()` for computed values (avoid functions in templates)
- Use `$derived.by()` for complex computed values that need functions
- Use `$effect()` instead of `onMount` (avoid infinite loops by not mutating state)
- Use callback props instead of `createEventDispatcher`
- Proper TypeScript interfaces for component props

### Error Handling
- Comprehensive try-catch blocks in async operations
- Graceful fallbacks (cache → filesystem → user notification)
- Timeout protection for file system operations
- User-friendly error messages

### Performance Optimizations
- Debounced file system watching (500ms using `watch` instead of `watchImmediate`)
- IndexedDB transaction optimization
- Lazy loading of encryption utilities
- Efficient preview generation
- Mobile keyboard detection with VirtualKeyboard API and visual viewport fallbacks

## Build Commands

### Development
```bash
# Web development
bun run dev

# Tauri development
bun run tauri dev
```

### Production
```bash
# Web build
bun run build

# Tauri build (uses SSG adapter)
bun run tauri build
```

### Package Management
```bash
# Install dependencies
bun install

# Add new dependency
bun add package-name

# Add dev dependency
bun add -d package-name
```

### Testing
```bash
# Run tests (check package.json for available scripts)
bun test

# Type checking
bun run check
```

## Configuration

### Tauri Permissions
Required permissions in `src-tauri/capabilities/default.json`:
- `fs:allow-document-read-recursive`
- `fs:allow-document-write-recursive`
- `fs:allow-watch` (for file system watching)
- `fs:allow-unwatch`
- `dialog:default` (for native dialogs)

### Cargo Features
Required features in `src-tauri/Cargo.toml`:
- File system watching capabilities (check current Cargo.toml)

### SvelteKit Configuration
- Uses SSG adapter for Tauri builds
- Handles both client-side and static generation
- Platform-specific build optimizations

## Common Tasks

### Adding New Storage Adapters
1. Create new adapter implementing `IFileSystemStorage`
2. Register in `MainStorageAdapter`
3. Update environment detection logic

### Adding New Themes
1. Add theme definition to `src/lib/stores/theme.js`
2. Update CSS custom properties
3. Test in both light and dark modes

### Adding New Encryption Algorithms
1. Extend `src/lib/utils/crypto.ts`
2. Update password store if needed
3. Ensure backward compatibility

### Debugging Storage Issues
1. Check browser console for IndexedDB errors
2. Verify file permissions in Tauri
3. Test cache invalidation logic
4. Monitor file system watcher events

## Platform Differences

### Tauri Desktop
- File system access via Tauri FS plugin
- Native system dialogs
- Automatic file change detection
- Documents directory storage
- SSG build process

### Web Browser
- IndexedDB storage only
- Browser confirm/prompt dialogs
- No file system watching
- Default demo entries
- Client-side rendering

### Mobile Platforms
- **iOS Tauri**: Uses tauri-plugin-virtual-keyboard for precise keyboard detection
- **Android Tauri**: Uses VirtualKeyboard API with `overlaysContent = true`
- **iOS Web**: Falls back to visualViewport resize detection
- **Android Web**: Uses VirtualKeyboard API or visualViewport fallback
- **Keyboard Handling**: Dynamic viewport adjustment and textarea auto-scroll
- **Safe Areas**: Proper handling of iOS safe area insets

## Security Considerations

- Passwords are stored in memory only (session-based)
- No password storage in localStorage or files
- Encryption keys derived using PBKDF2
- Safe handling of sensitive data in console logs
- Proper cleanup of password references

## Future Enhancements

### Potential Improvements
- Multi-device sync capability
- Advanced search and filtering
- Export/import functionality
- Plugin system for custom themes
- Backup and restore features
- Rich text editing support

### Known Limitations
- No real-time collaboration
- Single-user focused
- Platform-specific UI differences
- Limited file format support (markdown only)

## Troubleshooting

### Common Issues
1. **File watching not working**: Check Cargo.toml features and permissions
2. **IndexedDB errors**: Clear browser storage and restart
3. **Encryption failures**: Verify password and try again
4. **Build failures**: Check Node.js/Bun and Rust versions
5. **SSG build issues**: Verify adapter configuration
6. **Android file system loops**: Use `watch` instead of `watchImmediate` for proper debouncing
7. **Browser Buffer errors**: Use browser-compatible packages (js-yaml not gray-matter)
8. **Svelte infinite loops**: Use `$derived.by()` instead of `$effect()` for computed values
9. **Mobile keyboard detection**: Enable `navigator.virtualKeyboard.overlaysContent = true`

### Debug Tools
- Browser DevTools for web debugging
- Tauri DevTools for desktop debugging
- Console logging throughout the application
- File system monitoring tools

## Contributing Guidelines

### Code Style
- Use TypeScript for type safety
- Follow Svelte 5 patterns consistently
- Add comprehensive error handling
- Include JSDoc comments for complex functions
- Use meaningful variable and function names

### Testing
- Test both Tauri and web modes
- Verify encryption/decryption workflows
- Test file system operations
- Validate UI responsiveness

### Package Management
- Use Bun for all package operations
- Keep dependencies up to date
- Prefer exact versions for stability

---

*This documentation is generated based on the current codebase state and should be updated as the project evolves.*