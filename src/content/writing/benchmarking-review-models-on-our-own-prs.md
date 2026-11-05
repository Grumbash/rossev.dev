---
title: "I benchmarked 8 models on our own code reviews. The first bug was ours."
category: ai
distribute: []
---

Claude Opus 5.5 failed the same review three runs out of three. Same pull request, same reviewer role, same result: the stage output "failed to parse", the review was marked errored, and Opus dropped to the bottom of my table.

When I finally pulled the raw response, Opus had done exactly what it was asked. It wrote two short paragraphs explaining its findings and then gave a well-formed JSON object in a fenced code block. The problem was one phrase in the explanation: "the only production caller passes just `{ db }`."

Our parser looked for the first `{` and the last `}` in the response and tried to parse whatever was between them. The first `{` belonged to `{ db }` in the prose. So the slice started in the middle of a sentence, `JSON.parse` threw, and a correct review was thrown away.

That was the first of three things the benchmark found that had nothing to do with which model is smarter.

## Why I was benchmarking at all

Moonshot released Kimi K3.1 Pro, and the community numbers looked strong. Vals AI had it as the top open-weights model on their index (62.5%) and #3 on Terminal-Bench 4.0. Plotly's data-analysis exam gave it 42 of 43. It moved from #17 to #8 on the Arena web-dev leaderboard. The list price was $2 / $10 per million tokens against $3 / $15 for Kimi K3, which we were running on our highest tier.

Community benchmarks also disagreed with each other. Artificial Analysis showed 55 and fourth place in launch-week write-ups, and 46 and 22nd on its own model page a few days later. A hands-on coding benchmark put it sixth of eleven and called it "chatty". None of that tells me how it reviews *our* pull requests.

At YAGNI, Proctor is the agent that reviews pull requests. We already had an eval for it: five merged PRs from our own repository, each with gold findings a good reviewer should raise and things it must not say. Every review runs the real pipeline (a deep pass, a set of specialist roles, a refinement pass). A judge model matches the surviving findings against the gold, and the score is

```
composite = 100 · (0.7 · recall + 0.3 · precision) − 10 · forbidden_hits
```

The first comparison was one run each, K3 against K3.1 Pro. K3.1 Pro scored 65.2 against 60.2, took 35 seconds per review instead of 92, and cost about $0.13 per review instead of $0.23. That cost is my calculation from token counts and list prices, without cache discounts. The "chatty" warning didn't show up here: K3.1 Pro wrote 7.4k completion tokens across the five reviews, and K3 wrote 16.6k.

One run on five PRs is an anecdote, so I widened it. That's where I found the bugs.

## Bug two: Claude never ran

I added Opus 5.5 and Sonnet 5.5 to the comparison. Before the full run I built a small spend ledger: every model call in the eval appends one line with the model, the tokens and the priced cost. Eval scripts run outside the server, so none of this reaches our production cost metrics. I wanted to see the spend while a run was still going, with alerts at fixed thresholds.

The first smoke run of the Sonnet matrix logged 11 calls. None of them were Sonnet:

```
$0.01   9 calls  accounts/fireworks/models/deepseek-v4p1-flash-1017
$0.01   1 calls  accounts/fireworks/models/glm-5p3
$0.00   1 calls  accounts/fireworks/models/kimi-k3
```

Our router only sends traffic to Anthropic when a workspace explicitly pins it. That rule is deliberate. The eval asked for Claude through a per-call override, the router correctly ignored it, logged a warning nobody reads during an eval, and fell back to the default models. The eval then happily scored GLM, DeepSeek and Kimi under the name "Sonnet 5.5".

If I hadn't been watching spend per model, I would have published a Claude score that was not Claude.

The fix kept the router as it is: the eval now acts as a synthetic workspace whose pin is the model under test. A code review on the fix also asked for a safety check that I now think is the important half of it. If the call comes back from any model other than the one pinned, the stage fails loudly with `eval pin not honored` instead of being scored.

## Bug three: Sonnet called tools that didn't exist

With routing fixed, Sonnet still lost 2 of 15 reviews to parse failures, each time on a different role. I started saving unparseable output, and the two failures I caught on a rerun looked like this:

```
<invoke name="finish_review">
<parameter name="note">The material I was given had no analyzer entries at or
above ccn 10, so there was nothing to review. ...</parameter>
</invoke>
```

The two complexity-check roles were written for an agentic loop. Their instructions say "read_file the FULL method" and "your finish_review note should list each…". In the eval, and in production when the loop falls back to a single pass, those roles run without any tools. The open-weight models ignored the tool talk and returned JSON. Sonnet took the instructions literally and wrote the tool call as text.

The fix is one paragraph added to the single-pass prompt, and only for roles whose instructions mention loop tools: there are no tools in this pass, answer with the JSON object. Every other role's prompt is byte-for-byte unchanged, so the earlier numbers for other models stay comparable. One of Sonnet's first-round failures was on a different role, and I didn't have its raw output yet. It didn't come back after the fix, but I haven't proven it was the same cause.

The Opus fix needed one review round too, and the reviewer was Proctor itself, running on my pull request. My first version tried fenced code blocks before the brace slice. Proctor pointed out that a model which shows a fenced *example* and then answers below it would now get the example parsed as its answer. That's a silent wrong verdict where the old code at least failed loudly. The final order is: the whole response, the brace slice, the brace slice of the text with fences removed, and only then the last fenced block.

After both fixes, Opus and Sonnet went from 3 and 2 errored reviews out of 15 to 0 out of 15. Sonnet moved from second place to first in that round. Its reviews didn't change much. It just stopped losing them to our parser.

## Then the judges

All of those runs used one judge, Kimi K3. That's two conflicts in one: K3 was also a contestant, and it shares a family with K3.1 Pro, which was leading. The top four models were within three points of each other, so a small judge bias could reorder them.

I added a judge panel from three families: Kimi K3, GLM 5.3 and Sonnet 5.5. Each review is graded by every panel judge except the model that wrote it, and the score is their mean. The per-judge scores go into the CSV so bias would be visible.

It wasn't there. For every model, the three judges agreed within two points. K3.1 Pro got 50.4 from all three.

- **Qwen 3.8 Max** — composite 55.4 (run-to-run SD ±6.3), precision / recall 0.13 / 0.76, F1 0.20, ~$0.07–0.11 per review.
- **GLM 5.3** — composite 54.1 (run-to-run SD ±4.6), precision / recall 0.11 / 0.73, F1 0.18, $0.09 per review.
- **Claude Sonnet 5.5** — composite 54.1 (run-to-run SD ±4.2), precision / recall 0.27 / 0.68, F1 0.33, $0.20 per review.
- **Claude Opus 5.5** — composite 52.1 (run-to-run SD ±1.5), precision / recall 0.15 / 0.69, F1 0.22, $0.41 per review.
- **Kimi K3.1 Pro** — composite 50.4 (run-to-run SD ±2.2), precision / recall 0.23 / 0.62, F1 0.22, $0.12 per review.
- **DeepSeek V4.1 Flash** — composite 49.3 (run-to-run SD ±3.0), precision / recall 0.14 / 0.64, F1 0.21, $0.02 per review.
- **Kimi K3** — composite 43.4 (run-to-run SD ±4.8), precision / recall 0.28 / 0.51, F1 0.32, $0.17 per review.

Five PRs × three runs per model, judged by the three-judge panel. Cost is from the single-judge round: review stages only, priced from token counts at list prices without cache discounts. MiniMax M3 is missing: in its first run 36 stages hit our 16k output-token cap, every review errored, and I stopped it.

The panel didn't settle the ranking. It showed where the noise actually comes from. Between the single-judge run and the panel run, K3.1 Pro went from 54.6 to 50.4 and GLM 5.3 from 50.1 to 54.1. The judges agree, so the movement is in the reviews themselves: the same model, given the same PR again, writes a different review.

## What I can and can't claim

Across both rounds (six runs per model):

- **Kimi K3 is the weakest working model** both times (49.9, then 43.4). That's the model on our highest tier, so this is the result I'll act on first.
- **K3.1 Pro is at least as good as K3** and costs about a third less per review on these PRs.
- **DeepSeek V4.1 Flash is close to the pack at about a fifth of K3.1 Pro's price** and is the fastest. It's a candidate for the high-volume specialist roles.
- **Sonnet 5.5 was top three both times**, with the best F1 among the high-recall models and the fastest reviews of the strong group.
- **Opus 5.5 is the most expensive and wrote the noisiest reviews** (precision 0.15). I haven't tuned its effort setting for this eval, so I'd treat its row as untested rather than as a verdict on Opus.
- **Everything between 49 and 55 is a tie** on five PRs.

The whole exercise cost about $51 in model spend, debugging runs included.

The open question is the middle of the table. Five PRs, all from our own repo, can tell me that K3 should go. They can't tell me whether Qwen, GLM or Sonnet should replace it. The next step is AACR-Bench: about 200 expert-reviewed pull requests from public repositories that none of these models have reviewed for us, with its own judge. I haven't run it yet.

The lesson I'd keep from this round has nothing to do with Kimi. Before comparing models on your own pipeline, check that the pipeline can actually hear each of them. Two of my eight models were losing reviews to our parser and prompt, and a third was never called at all.
