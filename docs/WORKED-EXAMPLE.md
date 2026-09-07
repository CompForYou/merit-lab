# A worked example

Ten minutes, a browser, and nothing else. Every figure below is what you should actually
see at **[compforyou.github.io/merit-lab](https://compforyou.github.io/merit-lab/)**.

The population is synthetic and generated from a fixed seed, so your numbers will match
these exactly. If one does not, something is wrong and I would like to know.

---

## 1. Load the sample

Click **Load the sample population**.

|  |  |
|---|---|
| Employees | 204 |
| Eligible | 195 |
| Eligible payroll | $16.30M |

204 synthetic employees across an eight-grade structure. The population deliberately
includes green-circled, red-circled, part-time and ineligible employees, because a sample
where every path through the arithmetic goes untested makes a tool look like it works
when it has not been asked a hard question.

## 2. Read the cost

| | |
|---|---|
| **Spend** | 3.35% against a 3.25% target |
| **Cost** | $546K |
| **Variance** | +$16K |

The default matrix comes in slightly over budget, which is where a first draft usually
lands.

Underneath the headline figures, one line to notice:

> **$5,850 withheld at the maximum, affecting 4 employees**

That is the gap between what your matrix says and what your policy pays. It is invisible
in most spreadsheets, and it is the first thing you get asked about in a budget review.

## 3. See what the money actually buys

Scroll to **What the spend achieved**.

| | |
|---|---|
| Median moved | **+3.5 pts** — 0.98 → 1.02 |
| Cost per point | **$155K** to move the median 0.01 |
| Moved up a band | **72** of 204; 132 stayed where they were |

$546K buys 3.5 points of median compa-ratio movement. That is the efficiency question,
and it is the one that separates a plan that spends money from a plan that achieves
something.

## 4. Find the reversal

Scroll to **Where the money goes**.

| Cell | Percentage | People | Cost |
|---|---|---|---|
| Exceeds × 0.90–1.00 | 5.0% | 19 | $79K |
| **Meets × 0.90–1.00** | **3.0%** | **35** | **$76K** |
| Meets × 1.00–1.10 | 2.5% | 29 | $67K |

Your most generous cell, paid to nineteen top performers, costs barely more than the
modest one paid to thirty-five average performers — and only $12K more than the
*stingiest* well-populated cell.

This is the reversal the tool exists to make visible. Cutting the top cell to fund the
budget saves far less than it feels like it should.

## 5. Look at who gets what

Scroll to **What people actually receive**.

| Increase | People |
|---|---|
| Nothing | **5** |
| 1 – 2% | 8 |
| 2 – 3% | 35 |
| 3 – 4% | 70 |
| 4 – 5% | 47 |
| 5 – 6% | 27 |

A 3.35% spend is a weighted average and hides its own shape. Five people receive nothing
at all — some by design, because the bottom rating pays zero, and that is a conversation
somebody has to have with a manager.

## 6. Switch the over-maximum mode

In **Plan settings**, move between the three modes and watch the cost:

| Mode | Cost | Spend | Base build |
|---|---|---|---|
| **Cap** | $546K | 3.35% | $546K |
| **Allow over** | $552K | 3.39% | $552K |
| **Lump sum** | $552K | 3.39% | **$546K** |

Not one percentage in the matrix changed. Allow-over and lump-sum cost identical cash;
only one of them raises next year's payroll, because $5,850 of it is paid once rather
than built into base.

Set it back to **Cap** before continuing.

## 7. Fit it to budget

Click **Fit to budget**.

| | Before | After |
|---|---|---|
| Spend | 3.35% | **3.25%** |
| Cost | $546K | $530K |
| Variance | +$16K | **+$3** |

Every cell scaled by 0.970, so the shape of the plan design survives untouched and only
its magnitude moves. Watch the dot plot as it lands.

Click **Reset matrix** to put it back.

## 8. Find one person

Hover any red dot in the compa-ratio distribution, or type an employee id into the search
box on the left. Try **EMP-0031**:

> **Above maximum** — $69,200 exceeds the Grade 1 maximum of $69,000 by $200. They were
> already above it before this cycle.
>
> Salary $69,200 → $69,200 · Compa-ratio 1.15 → 1.15 · Matrix 2.50% · Increase **$0** ·
> Withheld **$1,730**

Click the dot to pin the card. The tool distinguishes someone who was *already* above the
maximum from someone this cycle pushed over it — different problems, different
conversations.

## 9. See who spent it

In **By group**, change the dropdown from Grade to **department**.

| Department | People | Cost | Spend |
|---|---|---|---|
| People | 43 | $125K | **3.62%** |
| Finance | 34 | $86K | 3.43% |
| Commercial | 44 | $113K | 3.36% |
| Operations | 40 | $107K | 3.30% |
| Technology | 43 | $114K | **3.09%** |

The same matrix spends 3.09% on Technology and 3.62% on People. Nothing was configured to
make that happen: the departments differ in where their people sit in their ranges, and a
matrix that pays more at low compa-ratios therefore spends unevenly across them.

Hover a row and only that department's dots stay lit.

## 10. Read the advice

Scroll to **What to do about this plan**. Three findings, ranked:

| | |
|---|---|
| **Fix first** | This plan is $16,315 over target, at 3.35% against 3.25% |
| **Worth deciding** | 4 employees finish below their range minimum even after this increase |
| **Worth knowing** | 5 eligible employees receive nothing under this plan |

Open **Show the arithmetic** on any of them. Each carries the numbers that produced it,
the cost of the action it recommends, and a line saying what Merit Lab cannot know —
market position, budget politics, prior commitments. You hold that context; the tool does
not.

---

## Then break it

The fastest way to understand what the tool is for:

**Set Meets × 0.90–1.00 to 9%.** Spend jumps to 4.28%, and the Grade 1 → Grade 2
compression differential falls from −0.14 points to **−2.29 points** and trips its flag.
Paying the low compa-ratio band generously compresses your junior grades, because that is
where low compa-ratios live.

**Set the target budget to 10% and click Fit to budget.** It lands at 9.87% and stops.
Under capping, a large part of the population hits its range maximum and physically cannot
absorb more, so no larger matrix will reach the target. The tool says so rather than
silently missing.

**Delete a rating row.** 84 employees are immediately reported as carrying a rating with
no row in the matrix and not costed — rather than quietly vanishing from the budget and
making the plan look cheaper.
