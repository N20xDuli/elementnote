# Contributing to ElementNote

Thanks for your interest. ElementNote is a small, dependency-free Manifest V3 extension; contributions are welcome.

## Ways to contribute

- Report a bug: use the [bug report](.github/ISSUE_TEMPLATE/bug_report.yml) template.
- Suggest a feature: use the [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) template.
- Improve prompt templates, selector generation, framework detection, docs, or translations.
- Test on a browser/OS combination you use (Chrome, Edge, Firefox; Windows/macOS/Linux).

## Development

1. Load the repository root as an unpacked extension:
   - Chrome/Edge: `chrome://extensions` → Developer mode → **Load unpacked**.
   - Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `manifest.json`.
2. Edit `src/*.js`. Reload the extension after changes (the content script is not hot-reloaded).
3. Test on a local page:
   ```bash
   cd demo
   python -m http.server 8000
   ```
   Open <http://localhost:8000>, press `Alt+Shift+C`, select elements, write annotations, press `C`, inspect the prompt.

## Tests

```bash
# Chromium/Edge: 73 assertions, headless, no npm dependencies
node tests/e2e.mjs

# Firefox: build the XPI and run the AMO linter
python tools/build_amo_xpi.py . store/amo/elementnote-1.0.0.xpi
npx web-ext@latest lint --source-dir . --output json
```

The Chromium test writes fresh screenshots to `docs/` — that is intentional. If you change UI, include the updated screenshots.

## Constraints

- **No network requests** in extension code. The value proposition is local-first.
- **No remote code**, no `eval`, no `new Function`, no bundler/runtime dependencies.
- **No new permissions** without a clear, documented reason. The current permissions are the minimum for the picker + main-world probe + clipboard + local storage.
- Keep UI isolated in Shadow DOM; avoid injecting page-visible styles.
- Keep Firefox compatibility: use the `ext` helper (`browser` when available, else `chrome`) for promise-based APIs; test with `about:debugging`.

## Pull requests

- Keep changes focused; one feature/fix per PR.
- Describe what changed, how you tested it, and which browsers you tested.
- Update `README.md` if behavior, install steps, or limitations change.
- Add a `CHANGELOG.md` entry for user-visible changes.
- By contributing, you agree your code is licensed under the MIT License.

## Commit style

Short imperative subject, optional body. Examples:

- `feat: support open shadow roots in component probe`
- `fix: avoid Node.contains(Window) in Firefox`
- `docs: add AMO self-distribution guide`
