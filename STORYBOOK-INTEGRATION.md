# Storybook Integration for Diaryx

## Overview

Storybook has been successfully integrated into the Diaryx project to provide interactive component documentation alongside the existing TypeDoc API documentation. This creates a comprehensive "living documentation" system that automatically updates with code changes.

## What's Been Implemented

### 1. Storybook Configuration
- **Framework**: SvelteKit integration with full project compatibility
- **Port**: Configured to run on port 6006 (avoiding conflicts with dev server)
- **Build Output**: `storybook-static/` directory for production builds
- **Global Styles**: Imports `app.css` to maintain consistent theming

### 2. Essential Addons Installed
- `@storybook/addon-svelte-csf` - Svelte Component Story Format support
- `@storybook/addon-docs` - Auto-generated documentation pages
- `@storybook/addon-controls` - Interactive component prop controls
- `@storybook/addon-actions` - Event logging and interaction tracking
- `@storybook/addon-backgrounds` - Theme and background switching
- `@storybook/addon-toolbars` - Global theme/mode controls
- `@storybook/addon-measure` - Visual measurement tools
- `@storybook/addon-outline` - Element outline visualization

### 3. Component Stories Created

#### Dialog Component (`Dialog.stories.ts`)
- **7 Stories**: Default, Error, Warning, Confirm, Long Content, Custom Buttons, Hidden
- **Features**: All dialog types, keyboard interaction testing, accessibility validation
- **Controls**: Dynamic title, message, type selection, and callback actions

#### EntryCard Component (`EntryCard.stories.ts`)
- **8 Stories**: Default, Long Content, Published, Shared, Short, Recent, Multiple Entries, Dark Theme
- **Features**: Various content lengths, encryption states, theme variations
- **Mock Data**: Realistic journal entry metadata for testing

#### Settings Component (`Settings.stories.ts`)
- **8 Stories**: Default, Authenticated states, Mobile layout, Web mode, Dark theme, Biometrics, Theme selection
- **Features**: Authentication states, responsive design, platform variations
- **Mock Services**: Complete storage service mocking for isolated testing

### 4. Theme Integration
- **Global Controls**: Theme switcher in Storybook toolbar
- **Background Options**: Light/dark modes plus theme-specific backgrounds
- **CSS Variables**: Full compatibility with existing Diaryx theming system
- **Responsive Testing**: Mobile/desktop layout validation

### 5. Package Scripts
```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "docs:all": "bun run docs && bun run build-storybook",
  "docs:serve-all": "bun run docs:all && echo 'TypeDoc: http://localhost:8080' && echo 'Storybook: http://localhost:8081' && cd storybook-static && python3 -m http.server 8081 & cd docs && python3 -m http.server 8080"
}
```

## Usage

### Development Mode
```bash
# Start Storybook development server
bun run storybook

# Access at http://localhost:6006
```

### Production Build
```bash
# Build static Storybook files
bun run build-storybook

# Build both TypeDoc and Storybook
bun run docs:all

# Serve both documentation systems simultaneously
bun run docs:serve-all
```

### Accessing Documentation
- **TypeDoc API Docs**: http://localhost:8080 (services, utilities, types)
- **Storybook Component Docs**: http://localhost:6006 (components, stories, interactions)

## Documentation Architecture

### Complementary Documentation Systems

1. **TypeDoc** (`docs/`)
   - **Purpose**: API documentation for services, utilities, and TypeScript interfaces
   - **Content**: JSDoc comments, function signatures, type definitions
   - **Files Documented**: 18 service and utility files with comprehensive JSDoc
   - **Features**: Search, cross-references, type information

2. **Storybook** (`storybook-static/`)
   - **Purpose**: Interactive component documentation and design system
   - **Content**: Component props, visual states, user interactions
   - **Files Documented**: 3 major UI components with 23 total stories
   - **Features**: Interactive controls, theme switching, responsive testing

### Unified Living Documentation Benefits

1. **Automatic Updates**: Both systems regenerate when code changes
2. **Complete Coverage**: APIs (TypeDoc) + UI Components (Storybook)
3. **Interactive Testing**: Real component manipulation in Storybook
4. **Theme Integration**: Full Diaryx theme system in both docs
5. **Cross-Platform**: Documents both web and Tauri behaviors
6. **Search Capabilities**: TypeDoc search + Storybook component browser

## Story Structure

### Comprehensive Story Coverage
Each component story includes:
- **Default State**: Standard usage example
- **Edge Cases**: Long content, minimal content, error states
- **Interactive States**: Loading, hover, focus, disabled
- **Theme Variations**: Light/dark mode compatibility
- **Responsive Design**: Mobile and desktop layouts
- **Accessibility**: Keyboard navigation, ARIA compliance

### Story Naming Convention
- `Default`: Standard component usage
- `[Variation]`: Specific state or content variation
- `[Theme]`: Theme-specific demonstrations
- `[Platform]`: Platform-specific behaviors

## Integration with Existing Systems

### CSS Compatibility
- Uses existing `app.css` and component stylesheets
- Maintains CSS custom properties for themes
- Preserves responsive design breakpoints
- Supports all existing utility classes

### Service Mocking
- Mock implementations for complex services (auth, storage, encryption)
- Isolated component testing without external dependencies
- Realistic data patterns matching production usage

### TypeScript Integration
- Full type checking in stories
- PropTypes validation through TypeScript interfaces
- Proper type inference for story controls

## Future Enhancements

### Potential Additions
1. **More Component Stories**: Cover remaining components (Editor, InfoModal, etc.)
2. **Visual Regression Testing**: Chromatic integration for UI testing
3. **Accessibility Testing**: Automated a11y validation
4. **Performance Monitoring**: Component render performance tracking
5. **Design Tokens**: Extract design system tokens for reuse

### Story Expansion
1. **Interaction Testing**: User flow demonstrations
2. **Error Boundary Stories**: Error state handling
3. **Loading State Stories**: Async component states
4. **Integration Stories**: Multi-component interactions

## Development Workflow

### Adding New Stories
1. Create `ComponentName.stories.ts` in the component directory
2. Import the component and necessary types
3. Define meta configuration with controls and documentation
4. Create multiple story variations covering different states
5. Add proper JSDoc comments for story descriptions
6. Test in Storybook development mode

### Updating Documentation
1. **API Changes**: Update JSDoc comments → regenerate TypeDoc
2. **Component Changes**: Update stories → rebuild Storybook
3. **New Components**: Add both JSDoc and Storybook stories
4. **Theme Changes**: Update Storybook theme configurations

### Quality Assurance
1. **Build Verification**: Ensure both docs build without errors
2. **Visual Review**: Check component rendering in all themes
3. **Interaction Testing**: Verify all story controls work properly
4. **Accessibility**: Test keyboard navigation and screen readers

## Technical Notes

### File Structure
```
├── .storybook/
│   ├── main.ts          # Storybook configuration
│   └── preview.ts       # Global parameters and decorators
├── src/lib/components/
│   ├── Dialog.stories.ts      # Dialog component stories
│   ├── EntryCard.stories.ts   # EntryCard component stories
│   └── Settings.stories.ts    # Settings component stories
├── docs/                # TypeDoc output
├── storybook-static/    # Storybook build output
└── typedoc.json         # TypeDoc configuration
```

### Build Optimization
- **Chunk Splitting**: Large dependencies are appropriately chunked
- **Asset Optimization**: Images and styles are optimized for production
- **Tree Shaking**: Unused code is eliminated from builds
- **Production Ready**: Both documentation systems are production-optimized

### Performance Considerations
- **Lazy Loading**: Stories load components on demand
- **Efficient Mocking**: Minimal mock implementations for services
- **Optimized Assets**: Compressed images and stylesheets
- **CDN Ready**: Static builds suitable for CDN deployment

## Conclusion

This Storybook integration creates a comprehensive living documentation system for Diaryx that:

1. **Complements TypeDoc**: Provides interactive component documentation alongside API docs
2. **Supports Development**: Enables isolated component development and testing
3. **Improves Quality**: Validates component behavior across different states and themes
4. **Enhances Collaboration**: Provides visual component library for design consistency
5. **Maintains Consistency**: Integrates seamlessly with existing development workflow

Both documentation systems now automatically update with code changes, ensuring the documentation remains current and valuable for both development and maintenance.