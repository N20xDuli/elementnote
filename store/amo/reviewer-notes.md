# Reviewer notes / 审核说明

Extension: ElementNote — 页面元素批注转 AI 提示词
Version: 1.0.0
Add-on ID: `elementnote@local`
License: MIT
Source: plain JavaScript, no build step, no minification, no remote code.

## What it does

ElementNote lets a developer select an element on any page (like DevTools' element picker), write a short annotation, and copy a structured Markdown prompt containing:

- page URL, title, viewport and scroll position
- CSS selector, XPath, parent path, siblings, text, HTML snippet, attributes
- document/viewport coordinates and element size
- selected computed styles
- React/Vue/Angular component stack and source location, when detectable

The prompt is pasted by the user into an AI assistant to modify frontend code. The extension itself never sends data anywhere.

## Permissions justification

| Permission | Why it is required |
|---|---|
| `host_permissions: <all_urls>` | The core feature is selecting elements on **any** page the user is debugging. A content script injects a hidden Shadow DOM host and only shows UI after the user presses the shortcut or clicks "Start annotating". There is no alternative narrower permission that supports an arbitrary-page element picker. |
| `scripting` | React/Vue/Angular component metadata (e.g. `__reactFiber$`) is accessible only in the page's main world. The extension injects a small read-only function into the main world to read component names/source locations. No page scripts are executed. |
| `storage` | Annotations and element context are stored in `browser.storage.local`, partitioned by page URL. |
| `clipboardWrite` | User-initiated "copy prompt" action writes the generated Markdown to the clipboard. |

No `tabs`, `webRequest`, `cookies`, `history`, or network permissions are requested.

## Data handling

- No network requests: no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, remote script, `eval`, or `new Function`.
- No analytics, telemetry, accounts, ads, or remote configuration.
- Data is written only to `browser.storage.local` on the local machine.
- Data leaves the browser only when the user explicitly copies a prompt and pastes it elsewhere.
- Users can delete annotations individually or clear a page; uninstalling clears extension storage.

The manifest declares `data_collection_permissions.required: ["none"]` because the extension does not collect or transmit data outside the extension. Page content is processed locally to build the prompt; it is not sent to the developer or any server.

## How to test (about 60 seconds)

1. Install the XPI; open any normal `http(s)` page (for example `https://developer.mozilla.org/`).
2. Press `Alt+Shift+C`, or click the toolbar icon → "开始批注" (Start annotating).
   - If the shortcut is not registered in your profile, use the toolbar icon; Firefox lets users assign shortcuts in `about:addons` → gear → Manage Extension Shortcuts.
3. Move the mouse: the hovered element is outlined with a size label.
4. Click an element: an annotation panel opens. Type a note and press `Enter`.
5. A numbered badge appears on the element; the toolbar shows the count.
6. Press `C` (or click "复制提示词"): the generated prompt is copied. Paste it into any text editor; it should contain the page URL, CSS selector, XPath, coordinates, and computed styles.
7. Click the extension icon: the popup lists the annotation for the current page; "定位" scrolls back to the element, "编辑"/"删除" manage it.
8. Open the extension's console/background page: no network activity should be present.

Notes for testing:

- The content script creates a hidden host `#elementnote-root` on all pages at `document_idle`; the toolbar/hint stay hidden until the user activates annotation mode. This is expected and not a visual change on normal browsing.
- Component stack detection only works on pages built with React/Vue/Angular dev builds; it is best-effort and silently returns nothing otherwise.
- The bundled `demo/` page is **not** included in the AMO XPI. Any normal page works for testing.

## Linter warnings

`web-ext lint` reports 0 errors and 4 warnings:

1. `BACKGROUND_SERVICE_WORKER_IGNORED` — intentional cross-browser manifest: Chrome/Edge use `background.service_worker`, Firefox uses `background.scripts`. Firefox ignores the former.
2. `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` — this extension targets desktop Firefox; `strict_min_version` is 140.0 and the data-collection key is supported on Firefox for Android 142+. The extension is not submitted for Android.
3. `INLINE_SCRIPT` in `demo/index.html` — the demo page is not included in the AMO XPI.
4. `UNSAFE_VAR_ASSIGNMENT` in `src/content.js` — `shadow.innerHTML` is assigned a constant template string (`MARKUP`) that contains no user input; it builds the isolated Shadow DOM UI.

## Source code

The uploaded package contains plain, readable JavaScript:

- `manifest.json`
- `src/background.js` — shortcut handling + main-world component probe
- `src/content.js` — element picker, annotation UI, context collection, prompt preview/copy
- `src/lib/prompt.js` — pure prompt builder
- `src/popup.*` — extension popup
- `icons/`

No source build or transpilation is required; reviewers can diff the XPI directly against the source tree.

## Contact

https://github.com/N20xDuli/elementnote/issues
