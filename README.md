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

## Analytics

Vercel Web Analytics and Speed Insights count pageviews and performance. Custom funnel events go to [Umami Cloud](https://cloud.umami.is) (free; Vercel Hobby has no custom events). The Umami script only loads when `PUBLIC_UMAMI_WEBSITE_ID` is set in the Vercel project env, and only reports on `rossev.dev`.

To track a new control, declare the event and its props (max 2) in `EVENTS` in `src/scripts/analytics.ts`, then tag the element: `data-track="<event>"` plus `data-track-<prop>="<value>"`. One delegated click listener sends it, so HTMX partials work too. `bun test` fails on undeclared names or props.

| Event | Props | Fires on |
| --- | --- | --- |
| `cta_book` | `placement` (nav, hero, footer), `lang` | cal.com link |
| `email_copy` / `email_click` | `placement` (hero, footer) | copy-email button / mailto link |
| `cv_download` | `placement` (hero, footer) | CV PDF link |
| `linkedin_click` | `placement` (hero, writing, footer) | LinkedIn profile link |
| `case_open` | `id` | a job's case study expanded by the visitor (not the `?case=` auto-open on load); BLUEPRINT sends this and `topology_interact` |
| `skill_click` / `toolbox_copy` | `skill` / none | toolbox |
| `post_open` / `post_linkedin` | `id` | READ BRIEF / LinkedIn original |
| `post_filter` | `filter` (all, ai, leadership, systems, delivery) | writing filter tab |
| `topology_interact` | `action` (domain, fault, xray, reset, packet, stratum, step, blueprint; drag = horizontal drag on the canvas) | topology, once per action per view |
| `lang_switch` / `theme_switch` | `to` | EN/RU (only on an actual change), THEME |
| `section_view` | `section` (experience, writing, contact) | section top past 60% of the viewport, once per view |

`section_view` also fires for sections passed on the way: a nav jump to `#contact` smooth-scrolls past Experience and Writing, so they count too.

Every cal.com link carries `?utm_source=rossev.dev&utm_medium=site&utm_content=<placement>`, built by `calUrl()`.

## License

Code is MIT. The texts, the CV and everything about me personally are not: see [LICENSE](LICENSE).
