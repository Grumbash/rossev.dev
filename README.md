# rossev.dev

Source for my personal site, [rossev.dev](https://rossev.dev).

Everything about me lives in one file, `src/data/profile.ts` (the LinkedIn posts sit next to it in `src/data/posts.json`, so a script can add to them). The site, the PDF CV (`public/gleb-rosev-cv.pdf`), `/llms.txt` and the OG card are all generated from it, so they can't drift apart. Change a date there and it changes everywhere on the next build.

`/llms.txt` is the same profile as plain Markdown, for people who read the site through an AI assistant.

Built in two evenings with Gemini Argon. Astro 5, TypeScript, HTMX for the partials, a small hand-written canvas engine for the 3D topology (`src/scripts/iso-engine.ts`). Hosted on Vercel.

The GR monogram at the top of "Beyond the CV" is a neural cellular automaton ([Mordvintsev et al., 2020](https://distill.pub/2020/growing-ca/)) trained from scratch by `scripts/nca/train.py` (PyTorch, run it in a throwaway venv; see the header) and run in a Web Worker by `src/scripts/nca/`. The page only ships a ~0.4 KB loader up front; the model code and float16 weights (`public/nca/gr.bin`) load when the block nears the screen, and never on Save-Data or 2G, where a static SVG of the monogram stays. `bun test tests/nca.test.ts` checks the shipped weights still grow and heal.

In the hero topology's take-over, a fault you inject runs on a toy service (`src/scripts/policy/service.ts`: a queue, four nodes, a deploy pipeline with the judge) kept alive by a small learned policy, an MLP of about a thousand parameters (`public/policy/policy.bin`, float16, ~2 KB, fetched only when you inject a fault). It sees only the noisy dashboard. It was trained by imitation from a teacher that sees the hidden fault (`src/scripts/policy/expert.ts`), then DAgger, and has to beat doing nothing and match or beat an on-call runbook frozen before training (`src/scripts/policy/rules.ts`). With the judge off a bad deploy still ships, and an overload beyond capacity still fails. `bun test tests/policy.test.ts` checks all of it.

### Retrain the policy

```bash
uv venv /tmp/nca-venv && VIRTUAL_ENV=/tmp/nca-venv uv pip install torch numpy
/tmp/nca-venv/bin/python scripts/policy/train.py                 # --device auto: cuda if present, else cpu
/tmp/nca-venv/bin/python scripts/policy/train.py --device mps    # or cpu / cuda; --hidden 32,32 for a bigger net
bun scripts/policy/rollouts.ts table                             # noop / runbook / teacher baselines
```

`scripts/policy/train.py` exports teacher rollouts with `bun scripts/policy/rollouts.ts export`, clones them, then runs DAgger rounds (the policy drives, the teacher labels every state it visits, the data is aggregated and the policy retrained). It scores each checkpoint with `rollouts.ts score` on validation seeds and overwrites `public/policy/policy.bin` and `tests/fixtures/policy-parity.json` only when the best one beats the shipped weights. About two minutes on a laptop CPU.

`/how-its-built/` shows every merged PR of this repo with its receipts: the test committed red first, what was caught before merge, what I decided. It renders `src/data/build-story.json`, which `bun run build-story` makes from `gh pr view` plus the hand-written `src/data/build-story-highlights.json`. It refreshes itself: on every push to main, `.github/workflows/build-story.yml` reruns the script and, if the JSON changed, runs `bun test` and `bun run build` and opens or updates one PR from `bot/build-story` (it never pushes to main; while that PR is open it leaves the branch alone once a human commits to it, and with no open PR it recreates the branch from main; a stale open PR is closed when main already has the data). A merged PR without a highlight shows up **pending**: its card has only the facts (title, date, red test, commits, diff size, PR link) and says my notes are pending; its findings don't count. To fill one in, add its entry to `build-story-highlights.json` (in the bot PR or any branch; give `noRedTest` when the PR has no red test first, `preLoop` only for work from before the loop) and either rerun `bun run build-story` and commit the JSON, or merge and let the workflow propose it. The script refuses to write if a curated entry lacks copy, a PR has no red test and no reason, copy is untranslated, a finding doesn't point at that PR or one of its commits, a highlight has no PR in the story, or a red-test commit touches anything outside `tests/` (beyond newly added stubs that only throw `not implemented`, and the fixture tooling named in the script; a red commit git can't see, e.g. a squash-merged PR, is a warning). PRs from any `bot/` branch (`bot/build-story`, `bot/publora-sync`) and PRs that only touch `src/data/build-story*.json` (#15) are left out, so merging a bot PR changes nothing; an unchanged story keeps the file byte for byte, `generatedAt` and `throughSha` included. The JSON records `throughSha`, the main commit it was generated through, and `bun test` only requires the PRs merged up to that commit, so a lagging page never turns main red. Regenerating keeps any `ciVerdicts` CI has appended. It is not part of `bun run build`, because Vercel has no GitHub token.

## Run it

```bash
bun install
bun dev          # local dev server
bun run build    # regenerates CV, llms.txt and OG card, then builds the site
```

`bun run generate:cv` regenerates the CV, `llms.txt` and OG card without building the site.

## Performance budgets

Speed is part of the point of this site, so every PR has to prove it's still fast. `bun run perf` builds the site, checks the bytes in `dist/` (HTML, inline CSS, JS, preloaded fonts) and runs Lighthouse 3× mobile and 3× desktop against `astro preview`, judging the median. A form factor that breaches gets 5 more runs before it fails, because Lighthouse is noisy. It takes about a minute and needs Chrome; without Chrome it checks bytes only and says Lighthouse was NOT run. CI runs it on every PR (see [CI](#ci)).

All budgets live in `perf-budgets.json`; `tests/perf-budget.test.ts` reads the same file. The full report lands in `.perf/last-report.md`.

```bash
bun run perf                          # the full gate on the working tree
PERF_SKIP_LIGHTHOUSE=1 bun run perf   # bytes only, ~1s
PERF_RUNS=5 bun run perf              # more Lighthouse runs per form factor
```

## CI

`.github/workflows/perf.yml` runs on every PR that touches what ships (`src/`, `public/`, `scripts/`, `tests/`, config, `package.json`, `bun.lock`, `perf-budgets.json`). Docs-only PRs skip it. It runs `bun test`, then `bun run perf`: the build, the byte budgets and Lighthouse 3× mobile and 3× desktop. The report goes to the job summary, and the check fails if any budget is breached.

The watchdog (`scripts/ci/watchdog.ts`) keeps one sticky comment on the PR and updates it on every push: a short budget table when everything is green. On a breach it sends the report and the PR diff (without lockfiles, binaries and generated files) to a model on [OpenRouter](https://openrouter.ai), which names the change behind each breach and the smallest fix. The comment shows the answer with the model and the cost. The model gets no tools, and its answer is rendered as plain text: no links, images, HTML or @mentions. If OpenRouter is down or the key is missing, the comment says the watchdog is unavailable and the gate still decides.

By default the watchdog asks `nvidia/nemotron-3-ultra-550b-a55b:free` and, if that free model errors or hits its rate limit, OpenRouter falls back to `z-ai/glm-5.3-flash`. The comment names the model that actually answered. To change it, set a repo variable `WATCHDOG_MODEL` to an OpenRouter model id, or several separated by commas for a fallback chain: Settings → Secrets and variables → Actions → Variables. Most current models reason before answering, so the request asks for low reasoning effort to leave room for the answer.

Cost: the model is called only on a breach, once per push. The input is capped (report plus at most 60 KB of diff and 8 KB of diff stat, about 20k tokens) and so is the answer (1500 tokens), so a breach usually costs nothing on the free model and at most about $0.0008 when it falls back to GLM-5.3 Flash ($0.031/M in, $0.085/M out, November 2026). Free models on OpenRouter are rate-limited and their providers may log prompts; here the prompt is a public repo's diff, so that is fine. Green runs, test failures and runs cancelled by a newer push cost nothing. Actions minutes are free on a public repo.

The check is not a required status check, and should not be made one as is: docs-only PRs never run it, so a required `perf` would wait on them forever.

PRs from forks get the gate but no comment: GitHub gives them no secrets and a read-only token.

The key lives only in the `OPENROUTER_API_KEY` repo secret. To rotate it: create a new key on openrouter.ai with a spend limit, update the `OPENROUTER_API_KEY` secret (Settings → Secrets and variables → Actions → Secrets), then delete the old key on OpenRouter.

## Publora sync

I publish on LinkedIn through [Publora](https://publora.com). Twice a day (06:17 and 17:43 UTC; GitHub drops scheduled runs under load, and a run with nothing new does nothing) `.github/workflows/publora-sync.yml` runs `scripts/ci/publora-sync.ts`: it lists my published LinkedIn posts in Publora, skips the ones already on the site, and turns each new one into an entry in `src/data/posts.json`. Then `bun test` and `bun run build`, and one PR from `bot/publora-sync`. Nothing new means no commit and no PR. It never pushes to `main`: I review the entry on the PR's Vercel preview, edit it in the PR if needed, and merge.

- A post counts once LinkedIn has it (`published` on the LinkedIn target, also in partially published groups) and its date is on or after `PUBLORA_SINCE` (repo variable, default `2025-08-01`, the month of my oldest own post).
- "Already on the site" is matched by the numeric LinkedIn activity id, since the site keeps vanity URLs and Publora returns URNs. The date comes from the same id.
- The post page carries the full text, so the site is the original and LinkedIn is linked as "also on LinkedIn". The English text is the LinkedIn original, cleaned without a model (mentions become names, trailing hashtags go). The model writes the card (title, takeaway, quote, 3 bullets in EN and RU) and the Russian adaptation of the full text.
- Posts already on the site with only a brief get their full text the same way, once Publora or the backfill has them: the original in English, a Russian adaptation, and a brief regenerated from that text (the old hand-written briefs could contradict it). The url, slug, id, date and color stay; the PR shows the old title next to the new one.
- Long-form posts I write for the site first have no LinkedIn url (no "on LinkedIn" button, the site is the original in the JSON-LD). When I later post them on LinkedIn with a link to `rossev.dev/writing/<slug>/` (or `/ru/…`) in the text, the sync recognises the copy: that post gets the LinkedIn url and keeps its own earlier date, with no model call and no second entry.
- For a carousel, the site gets the caption only; the slides stay on LinkedIn.
- Posts I published without Publora come from `src/data/linkedin-backfill.json` (LinkedIn id, vanity url, full text), taken once from my feed: every own post since August 2025 (43), without job shares, bare reshares, or posts whose LinkedIn id I could not pin down. Publora's copy wins when both have a post. Same rules otherwise: a new post counts from `PUBLORA_SINCE` and unless it is on the ignore list (the ignore list is about importing; it does not stop a post already on the site from getting its full text).
- A run is bounded by time, not by a post count: it starts no model call after 12 minutes (new posts newest first, then full-text fills), which leaves the job's 20 minutes for one last call, tests and build. With Haiku (~6-8 s a call) the whole backfill (~43 calls, ~$0.04) lands in one PR; if the model is slow, the run stops cleanly and the rest come in the first run after the open PR is merged (the bot branch is rebuilt from `main` each run). The PR says how many are waiting.
- The model answers under a strict JSON schema, gets no tools, and sees the post as data. Its answer is checked field by field: exact shape, Russian where Russian belongs, and no number the post never said. A post that fails is skipped, listed in the PR with the reason, and retried the next day; the others still land.
- New posts go on top of the grid, with the next `post-N` id, the category label the site already uses and the next color.
- A post I don't want on the site: add its LinkedIn id (the PR lists it) to `src/data/publora-ignore.json` on `main` and close the PR. Closing alone would bring it back the next day.

The model is `anthropic/claude-haiku-5.5,z-ai/glm-5.3-flash` by default (`DEFAULT_MODEL` in the script): Haiku first, GLM-5.3 Flash as OpenRouter's fallback when Haiku errors or is rate-limited. Both were picked in a bake-off of 13 cheap models on two real posts, judged on the Russian adaptation and on passing the validator. To change it, set a repo variable `PUBLORA_SYNC_MODEL` to any OpenRouter model id that supports structured outputs. It uses the same `OPENROUTER_API_KEY` as the watchdog, through the same client (`scripts/ci/openrouter.ts`).

Cost: about $0.001 per post with Haiku (measured $0.0009–0.0010), about $0.0005 when GLM answers. The PR shows the model and the exact cost of the run. Days with nothing new make no model call.

Secrets:

```bash
gh secret set PUBLORA_API_KEY --repo Grumbash/rossev.dev      # Publora → Settings → API keys
gh secret set PUBLORA_SYNC_TOKEN --repo Grumbash/rossev.dev   # fine-grained PAT, see below
```

`PUBLORA_SYNC_TOKEN` is a fine-grained personal access token for this repo only, with Contents and Pull requests set to read and write. It is needed because a PR opened with the default `GITHUB_TOKEN` does not trigger `perf.yml`, and the repo does not let GitHub Actions create PRs. Give it an expiry and rotate it like the OpenRouter key. It can write the repo, so it only ever reaches the `publish` job, which runs no package code: the job that runs packages, tests and the build (`sync` in publora-sync.yml, `refresh` in build-story.yml) hands it the changed files as an artifact, and `publish` cuts the bot branch only from a commit already on `main`, and the protect-main ruleset (PRs only, no bypass) keeps the token off `main`. `tests/ci.test.ts` holds every workflow to that.

Run it now instead of waiting for the schedule:

```bash
gh workflow run publora-sync.yml --repo Grumbash/rossev.dev
```

Local dry run (writes `src/data/posts.json` and `.publora/pr-body.md` in the working tree, pushes nothing):

```bash
PUBLORA_API_KEY=... OPENROUTER_API_KEY=... PR_BODY_PATH=.publora/pr-body.md bun scripts/ci/publora-sync.ts
git diff src/data/posts.json            # look, then `git checkout src/data/posts.json` to drop it
```

If I edit the entry in the PR, the next run leaves the branch alone: it only rewrites `bot/publora-sync` while every commit on it is the bot's.

## Analytics

Vercel Web Analytics and Speed Insights count pageviews and performance (plain `/_vercel/*/script.js` tags, see Security headers). Custom funnel events go to [Umami Cloud](https://cloud.umami.is) (free; Vercel Hobby has no custom events). The Umami script only loads when `PUBLIC_UMAMI_WEBSITE_ID` is set in the Vercel project env, and only reports on `rossev.dev`.

To track a new control, declare the event and its props (max 2) in `EVENTS` in `src/scripts/analytics.ts`, then tag the element: `data-track="<event>"` plus `data-track-<prop>="<value>"`. One delegated click listener sends it, so HTMX partials work too. `bun test` fails on undeclared names or props.

| Event | Props | Fires on |
| --- | --- | --- |
| `cta_book` | `placement` (nav, hero, footer, reader, build-story), `lang` | cal.com link |
| `email_copy` / `email_click` | `placement` (hero, footer) | copy-email button / mailto link |
| `cv_download` | `placement` (hero, footer) | CV PDF link |
| `linkedin_click` | `placement` (hero, writing, footer) | LinkedIn profile link |
| `case_click` | `id`, `placement` | homepage link to a case page, from the hero or experience section |
| `case_open` | `id` | a job's case study expanded by the visitor (not the `?case=` auto-open on load); BLUEPRINT sends this and `topology_interact` |
| `skill_click` / `toolbox_copy` | `skill` / none | toolbox |
| `post_open` / `post_linkedin` | `id` | READ BRIEF / LinkedIn original |
| `post_filter` | `filter` (all, ai, leadership, systems, delivery) | writing filter tab |
| `topology_interact` | `action`, `outcome` (free play behind Explore: domain, fault, xray, reset, packet, stratum, step, blueprint; drag = horizontal drag on the canvas; case = YAGNI case link, play = phone Play, explore = Explore toggle; the PR #11 replay: replay = the film first started, takeover = the visitor took over, resume = the film came back, scrub = a timeline stop used, outcome = a result landed, with `outcome` caught, shipped, recovered, failed, healed or unhealed; recovered and failed are the learned policy's runs on the toy service) | topology, once per action (and outcome) per view |
| `nca_interact` | `action` (erase = drag or tap on the canvas, key, reset, case = bridge link to the YAGNI case) | GR monogram in Beyond the CV, once per action per view |
| `vad_demo` | `action` (start = Say hello clicked and the mic asked, denied = mic permission refused, detected = speech heard, error = no mic, unsupported browser or failed load), `ms` (detected only: onset latency bucket <100, 100-199, 200-399, 400-799, 800+) | voice demo in the Sully case; Save-Data and a quiet 15 s send nothing |
| `lang_switch` / `theme_switch` | `to` | EN/RU link to the same page in the other locale (`/` ↔ `/ru/`), THEME |
| `depth_switch` | `to` | Depth dial on a technical post: `plain` (for people) or `engineers` |
| `section_view` | `section` (experience, writing, contact) | section top past 60% of the viewport, once per view |
| `booking_confirmed` | `source` (nav, hero, footer, reader, build-story, unknown) | `/booked` after a cal.com redirect carrying a booking `uid`, once per booking |

`section_view` also fires for sections passed on the way: a nav jump to `#contact` smooth-scrolls past Experience and Writing, so they count too.

Every cal.com link carries `?utm_source=rossev.dev&utm_medium=site&utm_content=<placement>`, built by `calUrl()`.

### Bookings

cal.com sends visitors to `/booked` after they book: event type → Advanced → Redirect on booking → `https://rossev.dev/booked/`, with "Forward parameters" on. Without forwarding there is no `uid` and no `utm_content`, so no `booking_confirmed` is sent. The forwarded query also carries the booking (email, name, phone, guests...). A classic inline script in the page's `<head>` keeps only whether a `uid` is present and the `utm_content` placement (`bookingSource()`), then strips the whole query before the deferred Umami and Vercel scripts read the URL. Vercel's server logs still see the full redirect URL. Reschedules are not counted: cal.com forwards the booking page's `rescheduleUid`, and a non-empty one means no event.

Umami funnel: `cta_book` (event) → `booking_confirmed` (event). Use the event, not the `/booked` path: a reload re-counts the pageview, but the stripped URL has no `uid` to send the event again. `reader` and `build-story` bookings start on `/writing/*` and `/how-its-built/` (and their `/ru/` twins), so a `/` (path) first step makes it a home-only funnel; prepend it only for that. A booking made from a `/ru/` page carries `lang=ru` (`calUrl`); `/booked/` forwards it to `/ru/booked/` before anything is tracked.

## Security headers

`vercel.json` sends them on every path: HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin` (a Referer never carries a path or query, so the `/booked/` PII stays out of it), a `Permissions-Policy` that gives the microphone to this origin only, COOP, and a CSP. The CSP allows scripts from this origin, Umami Cloud and three inline scripts by their sha256 hash: the theme bootstrap in `Base.astro` and the `/booked` query strip (EN and RU). No `'unsafe-inline'`, no eval, no `blob:`. So markup has no `onclick=`: a control names its handler in `data-action` (plus `data-arg`), and `src/scripts/actions.ts` dispatches from one listener, only to the actions it lists. Vercel Analytics and Speed Insights load as plain `/_vercel/*/script.js` tags, and the VAD worklet is `public/vad/tap-worklet.js`.

`tests/security-headers.test.ts` builds the site and fails when an inline script's hash is missing from `script-src` (it prints the hash to add) or a listed hash is no longer emitted. Changing the theme snippet or `bookingSource()` means updating `vercel.json` in the same PR.

## License

Code is MIT. The texts, the CV and everything about me personally are not: see [LICENSE](LICENSE).

The voice demo in the Sully case runs [Silero VAD](https://github.com/snakers4/silero-vad) v6.2.3 (MIT, Silero Team; notice in `public/vad/LICENSE-silero-vad.txt`). `scripts/vad/export.py` turns the official `silero_vad_16k_op15.onnx` into the float16 weights in `public/vad/`; `src/scripts/vad/model.ts` is a TypeScript port, held to the ONNX model's output by `tests/vad-model.test.ts`.
