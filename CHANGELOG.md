# Changelog

All notable changes to this project will be documented in this file.

The project follows Semantic Versioning where practical during early development.

## [Unreleased]

### Planned

- Minimal Manifest V3 extension shell
- ChatGPT message highlighting
- Start and end message selection
- Single-viewport capture
- IndexedDB-based temporary image storage
- Capture preview page

## [0.0.1] - 2026-11-16

### Added

- Initial Git repository
- TypeScript 6 configuration
- Vite 8 dependency and initial build structure
- ESLint 10 configuration
- Prettier configuration
- Chrome Extension API types
- Initial source directory structure
- Test directory placeholders
- Documentation directory
- GitHub workflow directory
- Project `.gitignore`
- EditorConfig configuration

### Changed

- Set the project package version to `0.0.1`
- Configured the project to use ES modules

### Fixed

- Resolved the TypeScript 7 and `typescript-eslint` compatibility conflict
- Pinned TypeScript to the supported 6.x release line
- Corrected the `@eslint/js` package version to a published compatible release

### Added

- Manifest V3 extension build with Vite
- Toolbar-action content-script injection
- ChatGPT assistant-message detection using the semantic `data-markdown-text-style` attribute
- ChatGPT user-message detection using the semantic `data-user-message-bubble` attribute
- Unified `ConversationTurn` model with role, DOM element, and mounted logical index
- DOM-order sorting for mounted user and assistant conversation turns
- Role-specific highlighting: blue for user messages and green for assistant messages
- Viewport-center selection of the nearest mounted conversation turn
- Visible success and error notifications
- Runtime diagnostics for matched selectors, role counts, and mounted turn counts

### Fixed

- Replaced obsolete ChatGPT conversation-turn selectors
- Avoided generated CSS suffixes as primary selectors
- Added structural fallback selectors for generated ChatGPT markup
- Removed silent detection failures by adding visible status notifications
- Repaired malformed TypeScript introduced by copying formatted text into source files

### Known limitations

- `logicalIndex` represents the order of conversation turns currently mounted in the DOM, not the global position in the complete conversation
- ChatGPT virtualization and DOM remounting may change mounted turn counts while scrolling
- ChatGPT semantic DOM attributes may change and require regression monitoring
- The current feature highlights the turn nearest to the viewport center but does not yet provide start/end range selection
