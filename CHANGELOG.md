# Changelog

All notable changes to this project will be documented in this file.

The project follows Semantic Versioning where practical during early development.

## [Unreleased]

### Added

- Pixel-based overlap detection for adjacent multi-viewport capture segments
- Canvas adapter for reading cropped segment pixels during offscreen composition
- Confidence, RGB-difference, and candidate-count diagnostics for segment joins
- Automated tests for exact, shifted, unrelated, invalid, and short image inputs

### Changed

- Multi-viewport composition now searches within 80 physical pixels of the geometric overlap estimate
- Strong pixel matches refine the overlap used for composition
- Pixel comparison samples the central image region while excluding 15 percent from each horizontal edge

### Fixed

- Reduced the risk of duplicated or missing text rows at multi-viewport segment joins
- Preserved geometric overlap as a fallback when pixel matching is weak or unavailable

### Known limitations

- Pixel overlap detection compares sampled RGB values and can be affected by dynamic content or rendering changes between screenshots
- Low-confidence joins continue to use the geometric overlap estimate

### Added

- Escape-based cancellation for long multi-viewport capture sessions
- Vitest-based automated unit testing
- Automated tests for overlap conversion, composed-height calculation, scroll validation, session-state transitions, progress calculation, safety limits, and cancellation behavior
- Programmatic cancellation and Escape-key listener disposal

### Changed

- Long captures now display an instruction to press Escape to cancel
- Cancellation checks run before and after scrolling, rendering waits, screenshot requests, and composition
- Concurrent capture sessions are blocked while another capture is active

### Fixed

- Restored the original conversation scroll position after cancellation
- Restored suppressed ChatGPT interface elements after cancellation
- Prevented composition and Preview creation after cancellation
- Released captured segment Data URL references after cancellation or failure
- Removed the Escape listener after capture completion or cancellation

### Security

- Confirmed zero production dependency vulnerabilities with `npm audit --omit=dev`

### Known limitations

- Cancellation is cooperative and cannot interrupt a `captureVisibleTab()` request already in progress
- Offscreen composition cannot currently be interrupted after its request has been sent
- Full `npm audit` can still report advisories in development-only dependencies

### Added

- IndexedDB storage for cropped PNG capture blobs
- Capture previews addressed by `captureId`
- Refresh-safe preview loading from persistent Blob storage
- Blob-backed PNG downloads through temporary object URLs
- Explicit capture deletion from the preview page
- Automatic capture expiration after 24 hours
- Opportunistic cleanup of expired capture records

### Changed

- Replaced Base64 PNG Data URL storage with native PNG Blob storage
- Preview pages now load captures directly from IndexedDB
- Preview URLs now include the selected `captureId`

### Fixed

- Reduced storage overhead caused by Base64-encoded PNG captures
- Revoked preview object URLs when captures are replaced and when preview pages unload
- Kept the injected content script self-contained without runtime ES module imports

### Known limitations

- Visible-tab screenshots still enter the offscreen processing pipeline temporarily as Data URLs
- Expired capture cleanup runs opportunistically when a capture is saved or a preview is opened
- Single-viewport capture requires the complete selected range to be visible
- Multi-viewport scrolling, overlap detection, and image composition are not implemented
- The crop preserves the original horizontal layout and can include empty space between differently aligned message blocks
- Very distant endpoints may require controlled scrolling because both endpoints may not be mounted simultaneously
- `logicalIndex` represents the order of conversation turns currently mounted in the DOM, not the global position in the complete conversation
- ChatGPT virtualization and DOM remounting may change mounted turn counts while scrolling
- ChatGPT semantic DOM attributes may change and require regression monitoring

### Planned

- Multi-viewport capture and composition
- Overlap detection between adjacent viewport captures
- Semantic image slicing
- PNG, ZIP, and image-backed PDF export
- Automated unit and browser tests

## [0.2.0] - 2026-11-17

### Added

- Single-viewport capture of a fully visible selected conversation range
- Visible-tab capture through the Manifest V3 service worker
- Offscreen-document image cropping with Canvas
- CSS-to-physical-pixel crop scaling derived from captured image dimensions
- Capture preview with physical-pixel dimensions
- Downloadable PNG output with request-based filenames

### Fixed

- Removed picker markers and status notifications before screenshot capture
- Prevented device-pixel-ratio assumptions by measuring horizontal and vertical capture scales
- Used a shared storage key between the service worker and preview page

### Known limitations

- Capture results were stored temporarily as Base64 PNG Data URLs in extension-local storage
- Single-viewport capture required the complete selected range to be visible
- Multi-viewport scrolling and image composition were not implemented

## [0.1.0] - 2026-11-17

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

- Turn fingerprints used an in-memory normalized text prefix and mounted logical index
- Conversation text prefixes were held temporarily in memory but were not persisted or logged
- Very distant endpoints could require controlled scrolling because both endpoints might not be mounted simultaneously

## [0.0.2] - 2026-11-17

### Added

- Manifest V3 extension build with Vite
- Toolbar-action content-script injection
- ChatGPT assistant-message detection using the semantic data-markdown-text-style attribute
- ChatGPT user-message detection using the semantic data-user-message-bubble attribute
- Shared ChatAdapter contract
- Unified ConversationTurn model with role, DOM element, and mounted logical index
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

- The extension shell identified mounted user and assistant messages but did not capture screenshots
- Detected turn counts could change when ChatGPT virtualized or remounted the conversation DOM

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
- Project .gitignore
- EditorConfig configuration

### Changed

- Set the project package version to 0.0.1
- Configured the project to use ES modules

### Fixed

- Resolved the TypeScript 7 and typescript-eslint compatibility conflict
- Pinned TypeScript to the supported 6.x release line
- Corrected the @eslint/js package version to a published compatible release
