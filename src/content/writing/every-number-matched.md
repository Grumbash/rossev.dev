---
title: "Every number in my agent's report was right. The report was still wrong."
category: ai
distribute: []
---
We have an analyst agent in our team Slack. Once a week it reads our production database and posts a short readout on our pilot customers: how many tickets their agents started, how many reached a pull request, how many merged, where the rest are stuck, and how long a ticket takes to get to its first pull request.

This week I checked that readout before letting it run on a schedule. Every number was right. The query behind it was wrong in three ways, and one of them was about to start costing us the same day.

## How it broke in the first place

The readout had quietly failed since November 2. The agent queries production through a read-only connection, and that connection runs every query past a validator that allows only a fixed list of SQL constructs. Time-zone conversion and percentile functions are not on the list. The validator's whole answer was "Error validating query", so the agent didn't know which part was rejected, and nobody noticed for two weeks.

Once we found the cause, the agent rewrote its query without those functions: time windows computed outside SQL, a median done by sorting rows. It posted a dry run for November 9 to 16.

## Checking the numbers

I had a second agent check it with the same read-only access, and it did not reuse the analyst's logic. It wrote its own queries for tickets started per customer per week, listed the sorted durations for each group and computed the medians by hand, and compared every cell.

Three customers, two weeks, every column. Every cell matched.

That is where I would normally have stopped. A report whose numbers survive an independent recount feels done.

## What the recount didn't catch

The second agent was also asked a different question: not "are these numbers right?" but "would this query still be right if something different happened?" That is where it found three problems.

**Merges it couldn't see.** The query counted a ticket as merged only when the agent's run had logged a "merged" event. But a run can stop first, say on a timeout or a budget limit, and the pull request gets merged by a person later. No event is logged then. Across the whole database, 6 of 15 merged pull requests were invisible to the report this way. None of them belonged to a pilot customer, which is why this week's numbers were right. A few hours after we found it, the first such case showed up on a pilot customer. The fixed query caught it.

**A status that wasn't a status.** To find where each ticket is stuck, the query took the latest event that carried a `status` field. Calls to GitHub carry one too: an HTTP status like 200 or 403. Two live tickets had just ended on exactly such an event, so the next readout would have filed them under "unknown". The first fix excluded GitHub calls. The recheck found a second event type with a `status` field (a rate-limit response, 429), so the final version lists the eight event types that carry a real ticket status instead of excluding the ones we happen to know about.

**A median of two.** One customer's "median time to first pull request" was 2,491 minutes. It had two tickets: one took 37 minutes, the other 4,945, about three and a half days. 2,491 is their average, and it describes neither ticket. With so few tickets, the readout now prints the raw durations.

The fixed query runs in 19 milliseconds.

## What I'm taking from it

Checking the numbers checks this week's data. It doesn't check the definitions, and the definitions are what next week runs on. All three bugs were invisible in a correct recount, because the cases that trigger them hadn't happened in the slice we looked at, or had happened only somewhere the report didn't look.

So the question I now ask about anything an agent reports is not just "is this right?" but "what would this count if X happened?" Stopped run, then a human merge. An event that looks like a status but isn't. A group of two. Each one took a single query to test.

One case is still untested: a ticket with two pull requests where only one is merged. There isn't one in production yet, so the logic is right on paper only. The first scheduled readout runs on Monday, November 23, and I'll check that one against production too.
