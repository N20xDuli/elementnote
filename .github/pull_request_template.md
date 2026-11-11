<!-- Thanks for contributing! Keep it focused. -->

## What does this PR change?

<!-- One or two sentences. -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Selector / prompt improvement
- [ ] Firefox / cross-browser
- [ ] Documentation / demo
- [ ] Refactor / tests only

## How was it tested?

- Browser(s) and version:
- Page(s) used:
- Commands run:

```text
node tests/e2e.mjs
npx web-ext@latest lint --source-dir . --output json
```

## Checklist

- [ ] No new network requests or remote code.
- [ ] No new permissions without justification in the PR description.
- [ ] Chrome/Edge behavior checked (and Firefox if relevant).
- [ ] README / CHANGELOG updated for user-visible changes.
- [ ] New UI content is inserted with `textContent` (not unsanitized HTML).
