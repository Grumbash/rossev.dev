# rossev.dev

Source for my personal site, [rossev.dev](https://rossev.dev).

Everything about me lives in one file, `src/data/profile.ts`. The site, the PDF CV (`public/gleb-rosev-cv.pdf`), `/llms.txt` and the OG card are all generated from it, so they can't drift apart. Change a date there and it changes everywhere on the next build.

`/llms.txt` is the same profile as plain Markdown, for people who read the site through an AI assistant.

Built in two evenings with Gemini Argon. Astro 5, TypeScript, HTMX for the partials, a small hand-written canvas engine for the 3D topology (`src/scripts/iso-engine.ts`). Hosted on Vercel.

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

## License

Code is MIT. The texts, the CV and everything about me personally are not: see [LICENSE](LICENSE).
