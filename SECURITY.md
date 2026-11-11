# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security-sensitive reports. Use GitHub's private vulnerability reporting:

1. Open <https://github.com/N20xDuli/elementnote/security/advisories/new>
2. Describe the issue, affected version, browser, and reproduction steps.
3. If private reporting is unavailable, open an issue titled `security: <short summary>` **without exploit details** and ask for a private channel.

We will acknowledge within 7 days, assess impact, and coordinate a fix and disclosure timeline.

## Scope

ElementNote runs content scripts on pages you visit and can read page DOM text/attributes locally. Relevant security areas include:

- XSS via page content rendered into the annotation UI (the UI currently uses textContent for user content; the Shadow DOM markup is a constant template).
- Prompt injection is **not** a vulnerability by itself: the generated prompt includes page text by design, and the user chooses which AI to paste it into.
- Permission abuse: the extension requests `<all_urls>`, `scripting`, `storage`, `clipboardWrite`; any change that silently expands permissions is security-relevant.
- Data exfiltration: the extension must make no network requests; any `fetch`/XHR/WebSocket/remote code addition is a vulnerability.

## What is out of scope

- Browser-level restrictions (`chrome://`, `about:`, add-on stores).
- Issues in third-party AI services where users paste prompts.
- Reports requiring physical access to an unlocked device.
- Social engineering.

## Design commitments

- No telemetry, analytics, accounts, or remote configuration.
- Annotations and page context stay in `browser.storage.local`.
- No remote code; the package is plain JavaScript.
