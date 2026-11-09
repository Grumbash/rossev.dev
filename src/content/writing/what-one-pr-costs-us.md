---
title: "Apple put its engineers on an AI budget. Here's what one pull request costs us."
category: ai
distribute: []
---
Apple just put its engineers on an AI budget. We've been on one since day one.

Bloomberg reported that in October Apple cut the daily amount some of its engineers can spend on outside AI tools, Claude and ChatGPT among them, from $300 to $200, and that for some it could go down to $100 ([Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/apple-set-slash-employee-ai-190500662.html)). In the same month Goldman Sachs kept Claude Code for its engineers and took it away from most traders and bankers, citing productivity and risk ([Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/goldman-sachs-restricts-ai-coding-150508601.html)).

Neither company said AI doesn't work. What both said, in their own way, is that the time when nobody looked at the bill is over.

![Apple's daily AI budget for some engineers: from $300 to $200](/articles/what-one-pr-costs-us/apple-cap.png)

At [YAGNI](https://yagni.app) we build teams of agents that take a ticket to a pull request, and we have priced every PR from the start. So when I read about a $200 daily cap, my first question was how many pull requests that buys. Here is what our own numbers say, including one number I got wrong last week.

## What one PR costs on our benchmark

We keep a benchmark of eight repositories on different stacks: .NET, Go, PHP, Django, Rails, a Yarn workspace, an OpenTofu project and our own app. Agents work tickets there all the time, and CI records what each ticket cost.

Between October 13 and November 3 that was 950 pull requests. The cost is what our billing recorded for the whole ticket, every attempt included, not list prices multiplied by tokens.

- Median: $0.61 per pull request.
- 90th percentile: $2.37.
- The most expensive: $10.49. The cheapest: $0.13.

![Median cost per pull request on our 8-repo benchmark, by repository](/articles/what-one-pr-costs-us/cost-per-pr.png)

The spread follows the stack more than the ticket. A typical .NET or Yarn fix costs under 30 cents. Infrastructure code and our own app, where the agent has more context to read before it changes anything, cost about four times as much.

## What $200 a day buys

At our median, Apple's new cap is 328 pull requests a day.

![At $0.61 a pull request, $200 a day is 328 of them](/articles/what-one-pr-costs-us/what-200-buys.png)

That comparison flatters us, and I want to be honest about why. Benchmark tickets are smaller than most product work: fix an endpoint, add a validation, update a config. A real feature costs more, and when it goes wrong, it goes wrong in a way the median doesn't show.

## The most expensive PR we've seen

On staging, on an internal test project, the most expensive ticket on Opus 5.5 cost $54.82. The agent planned, implemented and fixed over three sessions and 130 tool calls. The pull request is still open.

When we looked at where the money went, it wasn't the model being slow or wrong. It was the cache. In that run, only 8% of the prompt Opus read came from cache. GLM 5.3, working in the same run, read 99% of its prompt from cache. So each of the 111 Opus calls paid again for a prompt of about 100k tokens.

![Our most expensive pull request: Opus read 8% of its prompt from cache, GLM 99%](/articles/what-one-pr-costs-us/cache-miss.png)

The Opus part of that ticket cost $43. With a normal cache hit rate it would have been around $9. The other Opus runs on that project looked the same, with 6 to 17% of the prompt from cache, which makes it a bug on our side, not bad luck.

The lesson isn't that Opus is expensive. It's that a cache that doesn't hit can make any model several times more expensive, and you only notice it if you count per pull request.

## What I got wrong last week

Last week I wrote that one PR on a real feature costs about $82 on Opus and $13 on open-weight models ([the post](https://rossev.dev/writing/ai-agent-pr-token-cost-gap/)).

The part about small tickets holds up. I estimated $0.63 per PR on open-weight models at list prices, and the median we measured is $0.61.

The $82 was a calculation, not a measurement: average tokens per PR, times the 10 to 100 times more tokens we saw on real features, times Opus list prices. No PR we have records for cost $82. The most expensive one is the $54.82 above.

The bigger problem is the ratio. Comparing $82 with $13 assumes both models spend the same number of tokens, and they don't. On staging we have three pairs of similar tickets, each done once on Opus and once on open-weight models a week earlier:

- An `/api/version` endpoint: $2.11 on Opus in one attempt, $34.63 on open-weight models over 12 attempts.
- A check on the colour shades in our CSS: $5.85 on Opus, $5.37 on open-weight models.
- Required environment variables: $44.68 on Opus, $36.27 on open-weight models.

Open-weight runs can run away too. One ticket made 1,648 tool calls and cost $32.89 before it failed.

These pairs aren't identical tickets, the open-weight runs used an older version of our harness, and three pairs is an anecdote, not a study. But they're enough to correct what I said. The price per token is one multiplier among several, and not the biggest one. The number of attempts and the cache hit rate move the bill more.

## What we do about it

- We count every pull request in tokens, dollars and attempts. That is the only reason we found the cache bug.
- Each task goes to the cheapest model that passes our checks. Customers don't pick a model; they get the result and what it cost.
- Cheap is only good if it's checked. A failing test comes before the code, and a separate agent tries to break the result. I wrote about benchmarking the reviewer on our own pull requests [here](https://rossev.dev/writing/benchmarking-review-models-on-our-own-prs/).
- A run that loops gets stopped, and people decide what ships: merges, feature flags and messages to customers.

When the next budget meeting comes, "we use AI" won't be an answer. "A pull request costs us $0.61 at the median, here is our worst one, and here is why" is.

If you want to see how this works on your own repositories, that's what we do at [YAGNI](https://yagni.app).
