# rossev.dev

Source for my personal site, [rossev.dev](https://rossev.dev).

Everything about me lives in one file, `src/data/profile.ts`. The site, the PDF CV (`public/gleb-rosev-cv.pdf`), `/llms.txt` and the OG card are all generated from it, so they can't drift apart. Change a date there and it changes everywhere on the next build.

`/llms.txt` is the same profile as plain Markdown, for people who read the site through an AI assistant.

Built in two evenings with Gemini Argon. Astro 5, TypeScript, HTMX for the partials, a small hand-written canvas engine for the 3D topology (`src/scripts/iso-engine.ts`). Hosted on Vercel.

The GR monogram at the top of "Beyond the CV" is a neural cellular automaton ([Mordvintsev et al., 2020](https://distill.pub/2020/growing-ca/)) trained from scratch by `scripts/nca/train.py` (PyTorch, run it in a throwaway venv; see the header) and run in a Web Worker by `src/scripts/nca/`. The page only ships a ~0.4 KB loader up front; the model code and float16 weights (`public/nca/gr.bin`) load when the block nears the screen, and never on Save-Data or 2G, where a static SVG of the monogram stays. `bun test tests/nca.test.ts` checks the shipped weights still grow and heal.

`/how-its-built/` shows every merged PR of this repo with its receipts: the test committed red first, what was caught before merge, what I decided. It renders `src/data/build-story.json`, which `bun run build-story` makes from `gh pr view` plus the hand-written `src/data/build-story-highlights.json` (one entry per PR; the script refuses to write if a PR has no entry, no red test and no reason, untranslated copy, or a finding that doesn't point at that PR or one of its commits). The JSON records `throughSha`, the main commit it was generated through, and `bun test` only requires the PRs merged up to that commit. So rerun `bun run build-story` after merges and commit the JSON: a stale page doesn't turn main red, it just lags. Regenerating keeps any `ciVerdicts` CI has appended, and the script fails if a red-test commit touches anything outside `tests/`. It is not part of `bun run build`, because Vercel has no GitHub token.

## Run it

```bash
bun install
bun dev          # local dev server
bun run build    # regenerates CV, llms.txt and OG card, then builds the site
```

`bun run generate:cv` regenerates the CV, `llms.txt` and OG card without building the site.

## Performance budgets

Speed is part of the point of this site, so every `git push` has to prove it's still fast. There's no CI. Instead, a pre-push hook (`.githooks/pre-push`) checks out each pushed branch, exactly as pushed, into a throwaway worktree and runs `bun run perf` on it. That builds the site, checks the bytes in `dist/` (HTML, inline CSS, JS, preloaded fonts) and runs Lighthouse 3× mobile and 3× desktop against `astro preview`, judging the median. A form factor that breaches gets 5 more runs before it fails the push, because Lighthouse is noisy. The whole thing takes about a minute and needs local Chrome; without Chrome it checks bytes only and says Lighthouse was NOT run. Pushes of tags, deletions and docs-only changes skip the gate.

`bun install` wires the hook up: the `prepare` script sets `core.hooksPath` to `.githooks`, which overrides `.git/hooks` and any global `core.hooksPath` for this repo.

All budgets live in `perf-budgets.json`; `tests/perf-budget.test.ts` reads the same file. If a budget breaks, the push is blocked, the full report lands in `.perf/last-report.md`, and if the `claude` CLI is installed the read-only `perf-watchdog` agent (`.claude/agents/perf-watchdog.md`) reads it with the pushed diff and says what got slower and the smallest fix.

```bash
bun run perf                          # the full gate on the working tree
PERF_SKIP_LIGHTHOUSE=1 bun run perf   # bytes only, ~1s
PERF_RUNS=5 bun run perf              # more Lighthouse runs per form factor
PERF_SKIP_LIGHTHOUSE=1 git push       # push with the byte budgets only
PERF_NO_AGENT=1 git push              # gate without the agent's diagnosis
git push --no-verify                  # skip the gate entirely
```

## Analytics

Vercel Web Analytics and Speed Insights count pageviews and performance. Custom funnel events go to [Umami Cloud](https://cloud.umami.is) (free; Vercel Hobby has no custom events). The Umami script only loads when `PUBLIC_UMAMI_WEBSITE_ID` is set in the Vercel project env, and only reports on `rossev.dev`.

To track a new control, declare the event and its props (max 2) in `EVENTS` in `src/scripts/analytics.ts`, then tag the element: `data-track="<event>"` plus `data-track-<prop>="<value>"`. One delegated click listener sends it, so HTMX partials work too. `bun test` fails on undeclared names or props.

| Event | Props | Fires on |
| --- | --- | --- |
| `cta_book` | `placement` (nav, hero, footer, reader, build-story), `lang` | cal.com link |
| `email_copy` / `email_click` | `placement` (hero, footer) | copy-email button / mailto link |
| `cv_download` | `placement` (hero, footer) | CV PDF link |
| `linkedin_click` | `placement` (hero, writing, footer) | LinkedIn profile link |
| `case_open` | `id` | a job's case study expanded by the visitor (not the `?case=` auto-open on load); BLUEPRINT sends this and `topology_interact` |
| `skill_click` / `toolbox_copy` | `skill` / none | toolbox |
| `post_open` / `post_linkedin` | `id` | READ BRIEF / LinkedIn original |
| `post_filter` | `filter` (all, ai, leadership, systems, delivery) | writing filter tab |
| `topology_interact` | `action` (domain, fault, xray, reset, packet, stratum, step, blueprint; drag = horizontal drag on the canvas) | topology, once per action per view |
| `nca_interact` | `action` (erase = drag or tap on the canvas, key, reset) | GR monogram in Beyond the CV, once per action per view |
| `lang_switch` / `theme_switch` | `to` | EN/RU (only on an actual change), THEME |
| `section_view` | `section` (experience, writing, contact) | section top past 60% of the viewport, once per view |
| `booking_confirmed` | `source` (nav, hero, footer, reader, build-story, unknown) | `/booked` after a cal.com redirect carrying a booking `uid`, once per booking |

`section_view` also fires for sections passed on the way: a nav jump to `#contact` smooth-scrolls past Experience and Writing, so they count too.

Every cal.com link carries `?utm_source=rossev.dev&utm_medium=site&utm_content=<placement>`, built by `calUrl()`.

### Bookings

cal.com sends visitors to `/booked` after they book: event type → Advanced → Redirect on booking → `https://rossev.dev/booked/`, with "Forward parameters" on. Without forwarding there is no `uid` and no `utm_content`, so no `booking_confirmed` is sent. The forwarded query also carries the booking (email, name, phone, guests...). A classic inline script in the page's `<head>` keeps only whether a `uid` is present and the `utm_content` placement (`bookingSource()`), then strips the whole query before the deferred Umami and Vercel scripts read the URL. Vercel's server logs still see the full redirect URL. Reschedules are not counted: cal.com forwards the booking page's `rescheduleUid`, and a non-empty one means no event.

Umami funnel: `cta_book` (event) → `booking_confirmed` (event). Use the event, not the `/booked` path: a reload re-counts the pageview, but the stripped URL has no `uid` to send the event again. `reader` and `build-story` bookings start on `/writing/*` and `/how-its-built/`, so a `/` (path) first step makes it a home-only funnel; prepend it only for that.

## License

Code is MIT. The texts, the CV and everything about me personally are not: see [LICENSE](LICENSE).
