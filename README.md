# ChatRange Visual Exporter

A Manifest V3 browser extension for selecting a range of messages in an AI conversation and exporting the selected range as ordered, high-resolution visual content.

> **Project status:** Early development / experimental

## Problem

Long AI conversations can contain mixed Arabic and English text, syntax-highlighted code blocks, tables, images, and other complex content.

Existing screenshot workflows usually require one of the following:

- Capturing the entire page as one extremely tall image
- Manually scrolling, capturing, cropping, naming, and ordering multiple images
- Exporting to formats that do not preserve the original browser rendering
- Importing unreadably compressed images into visual whiteboards such as Miro

The project aims to provide a reliable workflow:

1. Select a start message.
2. Select an end message.
3. Capture the selected range using native browser screenshots.
4. Process overlapping viewport captures.
5. Divide the result into readable visual slices.
6. Preview and export the slices in a stable order.

## Project goals

The extension aims to preserve:

- Arabic right-to-left text
- Mixed Arabic and English content
- Arabic ligatures and bidirectional alignment
- Syntax-highlighted code blocks
- Tables and embedded images
- Browser zoom
- Fractional display scaling
- Correct visual ordering
- User privacy through local processing

## Current scope

The initial development phase supports:

- ChatGPT
- Chromium-based browsers
- Local image processing
- A start/end message picker
- Native viewport capture
- PNG preview and export

The following features are planned for later phases:

- Semantic image slicing
- Multi-column overlap correction
- ZIP and image-backed PDF export
- Gemini support
- Optional direct Miro integration

## Planned architecture

The project is divided into several browser-extension contexts:

- **Content Script:** message selection, DOM inspection, scrolling, and geometry
- **Chat Adapter:** site-specific selectors and message normalization
- **Service Worker:** capture scheduling, job coordination, locking, and cancellation
- **Offscreen Document:** image decoding, cropping, composition, and encoding
- **IndexedDB:** temporary storage of capture tiles and output images
- **Preview Page:** inspection, download, and explicit cleanup
- **Pure TypeScript Core:** capture planning, overlap matching, and semantic slicing

## Development roadmap

### Phase 0

Build a working vertical slice:

- Select two ChatGPT messages
- Capture one visible viewport
- Crop the conversation column
- Store the result temporarily
- Open a preview page

### Phase 0.2

Implement reliable job lifecycle management:

- Explicit job states
- Window-level capture locks
- Cooperative cancellation
- Per-job Offscreen operation queues
- Cleanup after success, cancellation, or failure

### Phase 1A

Extract a testable image-processing core:

- Capture planning
- Multi-column overlap matching
- Semantic boundary scoring
- Image-slice planning

### Phase 1B

Improve the preview and export experience:

- Contact-sheet preview
- Numbered PNG export
- ZIP export
- Image-backed PDF export
- Explicit clipboard queue

### Phase 1C

Add automated quality checks:

- Vitest unit tests
- Playwright browser tests
- Visual-regression fixtures
- GitHub Actions workflows

### Later phases

- Gemini adapter
- More resilient site adapters
- Optional Miro OAuth and direct board placement

## Technology stack

- TypeScript 6
- Vite 8
- Manifest V3
- ESLint 10
- Prettier 3
- Chrome Extension APIs
- IndexedDB
- OffscreenCanvas
- Vitest, planned
- Playwright, planned
- GitHub Actions, planned

## Development requirements

- Node.js 26 or newer
- npm
- Git
- Chrome, Brave, or another Chromium-based browser
- VSCodium or Visual Studio Code

## Install dependencies

```bash
npm ci
```
