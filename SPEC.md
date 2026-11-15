# SPEC

The full build spec lives in the Claude Docs page
"PRESS START News Cards: Build Spec for Claude Code":
https://claude.ai/artifact/3Ay5nA3ZpghJwcHFrdwjZm

Export it as Markdown from the doc's menu and replace this file with it, so the
spec travels with the repo.

## Status

- [x] Phase 1, feeds: `config.yml`, fetch, normalise, filter, seen state. `npm run fetch` writes `tmp/items.json`.
- [~] Phase 2, AI cards: built and tested with mocks; `npm run dry-run` needs ANTHROPIC_API_KEY, then Elliott's tone and accuracy review.
  - Model `claude-haiku-5-5` ($0.10 / $0.50 per million tokens, checked 2026-11-14).
  - Uses structured outputs (JSON schema) instead of a forced tool call; same guarantee of valid JSON.
  - No `temperature`: current models reject non-default values. Thinking off, effort low instead.
- [x] Phase 3, dedupe and Steam art. `npm run phase3-check` shows groups and Steam matches with no AI calls.
  - Dedupe adds a second rule beside Jaccard 0.6 (3+ shared words that make up 60% of the shorter title), because Jaccard alone left most real duplicates apart.
- [~] Phase 4, widget: `docs/widget.js` (9 KB) and `docs/index.html` built and checked locally (desktop and phone, dark and light, Show more to 36, empty state). `npm run sample` makes preview data; open `index.html?sample=1`.
  Still to do, needs Elliott's accounts:
  1. Create a public GitHub repo `press-start-news` and push this folder.
  2. Repo Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/docs`.
  3. Check `https://<github-user>.github.io/press-start-news/?sample=1` loads.
  4. Squarespace: add a Code block with the install snippet (swap in your GitHub user name).
  5. Check the live page on desktop and phone. If cards don't load and the browser console shows a CORS error, switch to the `cards.js` fallback (the widget already reads `window.PS_NEWS`).
- [ ] Phase 5, automation
