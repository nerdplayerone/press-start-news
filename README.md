# PRESS START News Cards

A free, automatic gaming news feed. Every 3 hours a GitHub job reads gaming RSS feeds, Claude Haiku turns each
story into a short card ("what happened" and "why it matters"), and the cards show on the Squarespace site.
Every card links to the original article.

- Live data and full-page version: https://nerdplayerone.github.io/press-start-news/
- On the site: https://digitaldopamine.video/news
- Full spec: [SPEC.md](SPEC.md)

## Setup (one time)

1. **API key.** Repo **Settings > Secrets and variables > Actions > New repository secret**.
   Name `PRESS_START_NEWS`, value: your key from console.anthropic.com (the workflow passes it to the job as `ANTHROPIC_API_KEY`). It never goes in the code or logs.
2. **Spend limit.** In the Anthropic Console, set a monthly limit on the key (a few pounds is plenty, see Costs).
3. **First run.** **Actions > news > Run workflow**. After about 2 minutes, cards appear on the site.
4. **Squarespace.** A Code block on the page holds:
   ```html
   <div id="ps-news" data-limit="12" data-theme="dark"></div>
   <script src="https://nerdplayerone.github.io/press-start-news/widget.js" defer></script>
   ```
   Squarespace shows "Embedded scripts are disabled" while you're logged in. Check the page logged out (or on your phone).

## Day to day

**Hide a card.** Open [hidden.yml](hidden.yml) on GitHub, click the pencil, add the card's article URL (or its 12-character
ID from `docs/cards.json`), and commit. It disappears on the next run. For a fast removal, run the workflow by hand
(Actions > news > Run workflow).

**Change the feeds.** Edit the `feeds:` list in [config.yml](config.yml). Each feed has `outlet` (the name in
"Read on ..."), `url` and `priority` (1 = highest; it decides which outlet gets the main link when several cover a story).

**Other settings** in config.yml: AI calls per run (`max_calls_per_run`), relevance cut-off, archive size, blocked
title words (`denylist`), duplicate matching, model ID. Change the AI's instructions in [src/prompt.txt](src/prompt.txt).

**Colours.** Edit the `THEMES` block at the top of [docs/widget.js](docs/widget.js).

**Check a run.** Actions > news > pick a run > "Make cards". The `RUN` line shows feeds OK, items found and
filtered, stories, AI calls and tokens, Steam matches and cards published. If a whole run fails, GitHub emails you
and the site keeps showing the last good cards.

## Costs

GitHub Actions and Pages are free for a public repo. The only cost is the Claude API, model `claude-haiku-5-5`
at $0.10 per million input tokens and $0.50 per million output tokens (prices checked 15 Nov 2026; check
anthropic.com/pricing for changes).

| Case | AI calls a month | Input | Output | Cost a month |
| --- | --- | --- | --- | --- |
| Typical, about 10 new stories a run | about 2,400 | about 2.3M tokens | about 0.4M tokens | about $0.45 |
| Cap hit every run (25 a run) | 6,000 | about 5.7M tokens | about 0.9M tokens | about $1.00 |

Estimates assume about 950 input and 150 output tokens a call; the `RUN` line shows the real numbers. Prompt caching
is not used: the system prompt (about 500 tokens) is below the minimum length the API caches, so it would save nothing.

## Local commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the tests (AI and Steam calls are mocked, no credit spent) |
| `npm run fetch` | Reads the feeds into `tmp/items.json` |
| `npm run dry-run` | Makes 10 cards and prints them, writes nothing (needs `ANTHROPIC_API_KEY`) |
| `npm run phase3-check` | Shows duplicate groups and tests Steam matching, no AI calls |
| `npm run sample` / `npm run preview` | Sample cards and a local preview at http://localhost:8080/?sample=1 |
| `npm start` | The full pipeline, as the GitHub job runs it (spends API credit, writes `docs/` and `state/`) |

## Notes

- GitHub disables scheduled workflows in a public repo after 60 days with no repository activity. The job commits
  its state files almost every run, so this should not trigger. If it ever does, Actions shows a banner with an
  "Enable workflow" button.
- Scheduled runs can start a few minutes late at busy times.
