---
title: I Took Over an Epic With One Prompt. It Reads Like a Map of the Next Few Months.
category: ai
distribute: [linkedin]
---
Yesterday I took over a teammate's epic overnight: they were out. This morning I wrote the prompt I'd hand to a coding agent to keep it going. Then I reread it and noticed it has almost no direct instructions. Most of it describes the environment the agent needs so it can work without me.

I think that's a fairly honest map of what's going to matter in engineering over the next few months. Seven things stood out.

## 1. Context moves as a document, not a call

The epic changed hands in a day. Not through a meeting: through the spec, my notes on it, a prototype, the design rules in AGENTS.md and a list of the 15 PRs merged the day before.

Whoever can pack context so that both a person and an agent can pick it up loses less on every handoff. And handoffs are going to happen much more often.

## 2. Checking costs more than writing

My workflow: a red test first, then a writer agent in its own worktree, an independent judge that tries to break it, a review bot, and branch protection that won't merge without the bot's approval of the last commit.

Getting code is cheap now. Knowing it's right is the expensive part. More and more of an engineer's job is designing the guardrails around generation, not the generation itself.

## 3. Boundaries of authority are written down

Half of my prompt is about who owns what. Whether to turn a flag on is my decision. In Slack the agent only writes drafts, and I send them. One ticket in the epic stays with its owner, and the agent leaves it alone. A merge happens only when CI is green and the bot approved the last commit; anything else comes back to me.

An agent doesn't just need permission to act. It needs a map of what belongs to whom and where it stops and waits for a person.

## 4. The bottleneck moved to taste and staging

Today's task wasn't writing code. It was making the design look great, and the agent had to show me options before building anything.

When 15 PRs fit into one day, code stops being the scarce thing. Judgment and checking the real thing in a live environment are.

## 5. The agent becomes a teammate, not a feature

The epic itself is about agents that join a team as members: their own machine, a status, a heartbeat while they work.

The most delicate part turned out to be the language of state. We had a bug where the agent said it was waiting on itself when it was actually waiting on a person. Trust in an agent rests on whether it says correctly who's waiting for whom. The next step on the roadmap is the same idea: a staged preview and undo, because people trust what they can take back.

## 6. Privacy is part of the agent's toolbox

One line in the prompt: build demo videos from browser screenshots, not from a screen recording, because a screen recording catches personal stuff.

Agents now collect evidence of their own work. What ends up in the frame is a process decision, not an afterthought.

## 7. Tacit knowledge moves into files

A CLI that only works with a specific prefix. No co-author trailers in commits. The exact format for mentioning a ticket. Small things that used to live in someone's head now have to be written down, or the agent trips over them every single time.

## What this adds up to

None of the seven is about which model to pick or how long the prompt is. They're about the environment around the model: context, checks, boundaries, words for state, hygiene, written-down habits.

That's the part I'd invest in now. Models will keep changing every few months. A team that has its environment in order just swaps the model and keeps going.
