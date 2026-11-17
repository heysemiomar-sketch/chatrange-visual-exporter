# Changelog

All notable changes to this project will be documented in this file.

The project follows Semantic Versioning where practical during early development.

## [Unreleased]

### Added

- Interactive start and end conversation-turn selection
- Hover feedback for selectable conversation turns
- Visual markers for start, end, and in-range turns
- Escape-based range-selection cancellation
- Automatic normalization of reverse-order selections
- Selection of one conversation turn as both range endpoints
- Live conversation-turn rediscovery during pointer interaction
- In-memory fingerprints for resolving remounted start elements

### Fixed

- Fixed end-message selection after ChatGPT remounted conversation DOM elements
- Replaced stale element matching with live semantic turn detection
- Prevented range endpoints from depending only on initial DOM references
- Prevented duplicate active picker sessions when the toolbar action is triggered again
- Removed picker marks and event listeners after cancellation

### Known limitations

- Turn fingerprints use an in-memory normalized text prefix and mounted logical index
- Conversation text prefixes are held temporarily in memory but are not persisted or logged
- Very distant endpoints may require controlled scrolling because both endpoints may not be mounted simultaneously
- `logicalIndex` represents the order of conversation turns currently mounted in the DOM, not the global position in the complete conversation
- ChatGPT virtualization and DOM remounting may change mounted turn counts while scrolling
- ChatGPT semantic DOM attributes may change and require regression monitoring

### Planned

- Single-viewport capture
- IndexedDB-based temporary image storage
- Capture preview page
- Multi-viewport capture and composition
- Semantic image slicing
- PNG, ZIP, and image-backed PDF export
- Automated unit and browser tests

## [0.0.2] - 2026-11-17

### Added

- Manifest V3 extension build with Vite
- Toolbar-action content-script injection
- ChatGPT assistant-message detection using the semantic `data-markdown-text-style` attribute
- ChatGPT user-message detection using the semantic `data-user-message-bubble` attribute
- Shared `ChatAdapter` contract
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
- Corrected duplicate HTML output paths in the Vite build

### Known limitations

- The extension shell identifies mounted user and assistant messages but does not capture screenshots
- Detected turn counts can change when ChatGPT virtualizes or remounts the conversation DOM

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
