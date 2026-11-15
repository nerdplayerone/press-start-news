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
  - Done: repo https://github.com/nerdplayerone/press-start-news, Pages on (`main` /docs), live at https://nerdplayerone.github.io/press-start-news/ . GitHub Pages sends `Access-Control-Allow-Origin: *`, so the cross-origin fetch works; the `cards.js` fallback is not needed.
  - Still to do: paste the install snippet into a Squarespace Code block, then check the page on desktop and phone:
    `<div id="ps-news" data-limit="12" data-theme="dark"></div>`
    `<script src="https://nerdplayerone.github.io/press-start-news/widget.js" defer></script>`
- [~] Phase 5, automation: `src/run.js` (full pipeline), `src/publish.js` (merge, hide, same-game merge, trim, validate), `.github/workflows/news.yml`, README. Waiting on the `ANTHROPIC_API_KEY` repo secret, then a first manual run and 24 hours of scheduled runs to review.
  - Extra dedupe pass after the AI step: cards with the same game and category within 24 h merge into one.
  - Feed cache keeps only ETag/Last-Modified, so state commits stay small.
