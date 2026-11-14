---
title: "While the agent works, I start another task"
category: ai
distribute: []
---
Delegating execution to agents is easy now. Keeping the work coherent is still my job.

My plan, more or less, was simple arithmetic. If agents do the work, I can run ten things at once. Each one might come out a bit less polished than if I'd done it carefully myself, but ten slightly imperfect results beat one perfect one.

Then I read my own Claude history.

November 2, translated from Russian: "Let's do something else while we wait." About half an hour later: "What else can we pick up?"

That is an embarrassingly accurate description of how I work now. An agent is busy, so I take another task. The next task also has something an agent can do, so I start another session. Then the first one needs an answer, the second has a result, and I have a vague feeling I should check on the third.

For years I tried to protect a single thread of attention. Now I have tools that make opening another thread almost free, and I keep doing it to myself.

## Switching always had a cost

In 2009 Sophie Leroy described [attention residue](https://doi.org/10.1016/j.obhdp.2009.04.002): when you move to a new task, part of your attention stays on the old one, especially if it was unfinished. Closing a window doesn't close what's happening in your head.

I knew this before agents. Meetings, messages, someone with a quick question while I was holding a complicated change in my head. Most of my attempts to work better were about cutting those transitions.

What's new is that I now create them voluntarily. While one agent works, another could be working too. I can see the idle capacity, and starting something feels more useful than waiting.

## The experiment grew a second job

On November 13 I was comparing several agent runs and proposed one more fork in parallel. Over the rest of the conversation I asked for intermediate results, then for the previous run, then widened the comparison from cost to other metrics, like the size of the changes. I asked for an artifact that would update as stages finished. Then I asked for status again.

Every one of those requests was sensible. Comparing costs without looking at what got built would have made the experiment useless.

But looking back, there were two jobs. One was the implementation, and the agents did it. The other was keeping the experiment coherent: which run belongs to which setup, what has finished, whether the review process was the same, what the result actually lets us say, where the latest comparison lives. That job stayed with me.

## It's not just me

Berkeley researchers Xingqi Maggie Ye and Aruna Ranganathan [spent eight months at one tech company](https://www.universityofcalifornia.edu/news/ai-promised-free-workers-time-uc-berkeley-haas-researchers-found-opposite) and saw people widen their scope, fill former pauses with new tasks, and keep several AI-assisted threads going at once. Some ran multiple agents at the same time.

The part about pauses hit home. A long run used to be a natural stopping point. Now it's a reason to open another session. Each decision feels productive; the day as a whole gets harder to put down.

A [shadowing study of 11 developers](https://arxiv.org/abs/2610.33588) found that about a third of observed time went into writing prompts and checking AI output, and the busiest switched tasks about a hundred times an hour. It's a small sample, but it names something real: directing and checking agents is now part of the job.

Which is where my arithmetic breaks. Ten sessions running says nothing about how much of the work survives review. Quality doesn't degrade evenly, and one expensive mistake can wipe out the gain from the other nine.

## What would let me step away

The useful line, for me, is between a decision that needs me and an update I need because I lost track.

Two reasonable product behaviours and someone has to pick one? Interrupt me. That's my job. Rereading twenty messages to find out a process stopped half an hour ago? That's a failure of the setup, not a decision.

Better dashboards help only partly. [ParallelPilot](https://arxiv.org/abs/2609.33113), a tool for monitoring parallel coding sessions, made tracking easier and switching less disruptive in a small study, but people didn't feel more in control of the outcome. A green status tells me something finished. It doesn't tell me the work is right.

Looking back through my notes, I'd written this requirement down a week earlier, on November 8, while we were discussing proof of work for [YAGNI](https://yagni.app), the product I work on: as little noise as possible, every human action treated as expensive, and less effort to tell whether work is really done. I didn't connect it to my own habits until now.

## What I'm changing

I went back through two weeks of my own sessions and counted. About ten of my messages per merged pull request, and roughly one in five of those was pure coordination: "how's it going?", "what are we waiting for?", "where are we with this?".

So now I check on running agents at fixed times instead of whenever I feel uneasy, which is close to what the Berkeley researchers suggest: batch the non-urgent updates and protect focus time. And each time I check, I write down whether the agent actually needed a decision from me or I just lost track. That way the next count tells me if it helped.

I already know how to start another task while I wait. What I want to get better at is leaving one in capable hands.
