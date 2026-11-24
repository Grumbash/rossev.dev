---
title: "What's between a customer and Monday"
category: leadership
distribute: []
---
"What's stopping the pilot team from using this on Monday?" I'm one of three people at YAGNI, and last Friday I couldn't answer that.

Two days earlier I'd written that our sprints last two days: each call decides what I own until the next one. That rhythm is fast, and it has a cost I hadn't noticed yet. By Friday I'd lost track of what the other two people in the company were doing.

## Everyone knew their own part

I was making sure an engineer got credit for the pull request their agent opened, and that a person could stop their agent's ticket. Bruno was building the screens that engineer would use to work with their own agent. Jack had been on calls with the teams who were supposed to use it, and one of them had a renewal at the end of the month.

At standup each of us could explain our tickets just fine. Nobody, me included, could have said in one sentence what was still in the way of a pilot team using their own agent on Monday. The standup answers "what is everyone doing". That's a different question, and the answer to it doesn't add up to the answer to mine.

## A map around one question

So I gave Claude everything we had: the Slack threads, the call transcripts, the Linear tickets and the code. I asked it to draw a map with one node in the center, "pilots are using their own agent by December 1", and to put around it everything that node depends on. For each piece the map showed an owner, a state, what it was waiting on, and where the claim came from, so anyone could check it against the source.

Most of the map was reassuring. My tickets and Bruno's were moving. Four tickets stood out. They described the workflow one of the pilot customers needed before they would sign, and none of them had an owner.

I could have spotted those empty assignee fields in Linear in thirty seconds. That's not what I'd missed. What I'd missed was that these four were the changes a customer was waiting on. In the ticket list they looked like four more tickets. Next to the center node they were the shortest path to a signature.

The map also surfaced questions nobody had settled:

- Should several agents share one environment, or should each agent get its own? Our own design doc still said one per agent.
- Where does a person start a task for their agent: a Slack message, their editor, a desktop app?
- Who owns pricing and the choice of models? Both had no lead.

## One Slack reply

I posted the map in our engineering channel and asked the others to tell me what I got wrong.

Less than an hour later Jack replied. He took the four tickets. He took pricing and model choice. He settled the environment question: one environment that many agents share. And he said honestly that we still don't know where people will want to start a task, only which two places he'd bet on first.

A week of moving pieces, and the whole answer fit in one reply.

## What I'm taking from it

I'd been worried that growing the team would mean more time spent figuring out who is doing what. I thought losing track of each other was a problem you earn by hiring. Turns out three people shipping fast earn it in a week.

The fix wasn't a better status update. Everyone's status was accurate. The fix was asking a question with a customer in it, and letting the map show what that question depends on. Ownerless work is easy to find. Ownerless work that a customer is waiting on is only visible from the customer's side.

Next time I lose track of the team, I won't ask what everyone's doing. I'll ask what's still between a customer and Monday.
