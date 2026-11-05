---
title: My Prompt for Picking Up a Colleague's Epic Was Mostly About Everything Except the Task
category: ai
distribute: [linkedin]
---
Yesterday I picked up a colleague's epic. They're out for a few days, and the work can't wait.

This morning I wrote a prompt so a coding agent could carry on with it. When I reread it, I noticed there's almost nothing in it about the task. The task itself is one sentence about getting the design of a few screens into good shape, with options for me to pick from first. The rest is about how we work, who owns what, and where the agent has to stop.

I think that's where most of my time will go over the next few months, so here's what was in it.

**Context.** Links to the spec, my notes on the spec, a prototype, the design rules in AGENTS.md, and the 15 PRs we merged the day before, one line each. That's how the epic got to me, and that's how it gets to the agent. Nobody had to get on a call.

**How code gets checked.** A red test first. Then a writer agent in its own worktree, a separate judge agent that tries to break the result, and a review bot. Branch protection doesn't let anything into main without the bot's approval of the last commit. Writing the code is the fast part now. Most of the setup is about checking it.

**What the agent doesn't decide.** Turning a feature flag on for a customer is my call. Slack messages stay drafts, and I send them myself. One ticket in the epic belongs to my colleague, and the agent leaves it alone. If CI isn't green or the bot hasn't approved, it asks me instead of merging.

**Small habits.** Our GitHub CLI only works with a repo prefix. No co-author lines in commits. A ticket is mentioned as a link, a title, an owner and a status. Nobody writes these down for people, but an agent gets them wrong every time if they're not written down.

**Privacy.** Demo videos are put together from browser screenshots, not from a screen recording, because a recording picks up notifications and other windows.

The epic itself is about agents working as members of a team, with their own machine, a status and a heartbeat. My favourite bug from yesterday: the agent told people it was waiting on itself when it was actually waiting on them. A small wording bug, but after you see it once you stop trusting the status. Next we're adding a preview before changes apply, and undo.

15 PRs in a day is normal for us now, and the code wasn't what slowed us down. What took time was deciding what good looks like and checking it on staging. I expect my prompts to keep getting shorter on the task and longer on everything around it.
