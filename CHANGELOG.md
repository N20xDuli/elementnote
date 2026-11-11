# Changelog

All notable changes to ElementNote are documented here.

## [1.0.0] — 2026-11-11

First public release.

### Added

- Element picker with hover highlight, click-to-select and `Esc` to exit (`Alt+Shift+C` or toolbar action).
- Shadow DOM annotation panel: write a note, save with `Enter`, edit later by clicking the numbered badge.
- Structured context collection:
  - page URL, title, viewport, DPR, scroll position;
  - unique CSS selector (id → `data-testid` → unique class → id-anchored path → shortest unique path), XPath, parent path, siblings, text, HTML snippet, attributes;
  - document and viewport coordinates, element size;
  - selected computed styles;
  - React / Vue / Angular component stack and source location (best effort, read-only main-world probe).
- Markdown prompt generation with a task-requirements section, preview/edit modal, and one-click copy (`C` shortcut, toolbar, or popup).
- Annotation manager popup: per-page groups, locate, edit, delete, clear, cross-page copy.
- Per-URL storage keys in `storage.local` so different pages saved concurrently do not overwrite each other.
- Chrome/Edge (MV3 service worker) and Firefox 140+ (MV3 event page) support from one manifest.
- Open Shadow DOM picking (`host >> inner path`) and iframe-container picking.
- Local demo page with intentionally broken UI, fake React fiber, Shadow DOM and iframe sections.
- Chromium E2E suite (73 assertions, Edge + CDP, no external dependencies).
- Firefox 159 verification via Marionette (17 checks, including clipboard content).
- AMO submission pack: `store/amo/` with XPI, listing copy, privacy policy, reviewer notes and 1280×800 screenshots.
- `data_collection_permissions.required: ["none"]` for AMO's post-2025-11-03 requirement.

### Fixed during development

- Firefox content-script `window` vs `globalThis` prompt-library lookup.
- Firefox `event.target` can be a `Window`, which made `Node.contains()` throw.
- Shadow DOM component probing now recursively searches open shadow roots.
- iframe containers are selectable via geometric hit-testing.
- `:hover` styles are neutralized while the annotation panel is open.
- Storage race between different pages (moved to per-URL keys).

### Known limitations

- iframe internal documents are not collected.
- Closed shadow roots and browser-internal pages (`chrome://`, `about:`) are inaccessible.
- Same-URL concurrent writes in two tabs: last write wins.
- Firefox temporary add-ons disappear after restart; permanent install requires AMO signing.

[1.0.0]: https://github.com/N20xDuli/elementnote/releases/tag/v1.0.0
