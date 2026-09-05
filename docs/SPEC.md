# Merit Lab — Specification

## 1. What this is

A single-page web app that lets a compensation practitioner design a merit increase matrix
and immediately see what it costs and what it does to the pay distribution.

Today this work happens in a spreadsheet that gets rebuilt from scratch every year, is
never tested, and is impossible to hand to a colleague. The spreadsheet answers "what does
this cost." It does not answer "what does this do to my compa-ratio distribution, how many
people does it push over the maximum, and how much compression does it create."

## 2. Who it is for

Compensation analysts, managers, and HR business partners running an annual merit cycle,
at any organization, without needing permission from anyone.

The adoption constraint that governs every design decision: **nobody in compensation is
permitted to upload pay data to a stranger's website.** So the app never receives it. It
runs entirely in the browser, transmits nothing, and stores nothing. That constraint is the
feature, and it should be stated plainly on the landing screen.

## 3. What it is not

- Not a replacement for the HRIS. It does not write anything back to any system.
- Not a salary structure designer. It consumes a structure; it does not build one.
- Not a performance management tool. Ratings come in as data.
- Not multi-user. No accounts, no sharing, no collaboration in version 1.

## 4. Software terms, in plain language

For my reference while working on this.

- **Repository (repo)** — the folder holding the project, with its change history.
- **Commit** — a saved snapshot of changes, with a message describing them.
- **Branch** — a parallel line of work, so unfinished changes stay out of the main version.
- **Dependency** — code written by someone else that the project uses.
- **Package manager (npm)** — the tool that installs dependencies.
- **Build** — converting source files into the optimized files a browser loads.
- **Deploy** — publishing the built files to a public web address.
- **Component** — a reusable piece of interface, e.g. the matrix grid.
- **State** — data the interface currently holds in memory, e.g. the entered population.
- **Props** — values passed into a component from its parent.
- **Unit test** — a small automated check that a function returns the expected output for
  a known input. The safety net for the compensation math.
- **Type** — a declaration of what shape data has, so wrong data is caught before it runs.
- **Pure function** — a function with no side effects: same input always gives same output.
  All compensation math should be written this way.

## 5. Data model

An employee record, all fields required unless noted:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Any identifier. Must not be a name. |
| `gradeId` | string | Links to a grade in the structure. |
| `baseSalary` | number | Annualized, in dollars. |
| `performanceRating` | string | Matches a rating in the rating scale. |
| `fte` | number | 0 to 1. Defaults to 1. |
| `eligible` | boolean | Excluded from budget and increase if false. |
| `hireDate` | string, optional | Used only for proration. |

A grade:

| Field | Type |
|---|---|
| `id` | string |
| `name` | string |
| `min` | number |
| `mid` | number |
| `max` | number |

A matrix cell: performance rating × compa-ratio band → increase percentage.

## 6. Compensation math

Implement exactly as written. Each gets a unit test with a hand-calculated expected value.

**Compa-ratio**
```
compaRatio = baseSalary / gradeMidpoint
```
Returned as a decimal. If midpoint is zero or missing, return null, do not return zero.

**Range penetration**
```
rangePenetration = (baseSalary - gradeMin) / (gradeMax - gradeMin)
```
Can fall outside 0–1 for green- and red-circled employees. Do not clamp it; the outliers
are the interesting cases.

**Range spread**
```
rangeSpread = (gradeMax - gradeMin) / gradeMin
```

**Midpoint progression**
```
midpointProgression = (midpointOfGrade - midpointOfGradeBelow) / midpointOfGradeBelow
```

**Compa-ratio band assignment**
Bands are user-defined boundaries, default quartiles of the range: below 0.80, 0.80–0.90,
0.90–1.00, 1.00–1.10, above 1.10. Boundaries are inclusive at the lower bound.

**Merit increase for one employee**
```
increasePercent = matrix[performanceRating][compaRatioBand]
increaseAmount  = baseSalary × increasePercent
newSalary       = baseSalary + increaseAmount
```
If `eligible` is false, the increase is zero.

**Proration**
If proration is switched on and a hire date is present, multiply the increase amount by
the fraction of the plan year worked. Off by default; make it a visible toggle.

**Range maximum handling**
Three modes, user-selectable, default `capAtMax`:
- `capAtMax` — increase is reduced so the new salary equals the maximum.
- `allowOverMax` — increase applies in full; employee becomes red-circled.
- `lumpSum` — salary rises to the maximum; the remainder is reported separately as a
  lump sum, not added to base.

This choice materially changes the cost. Show which mode is active on the results screen.

**Budget aggregates**
```
eligiblePayroll = sum of baseSalary where eligible is true
totalIncreaseCost = sum of increaseAmount
budgetSpendPercent = totalIncreaseCost / eligiblePayroll
varianceToTarget = budgetSpendPercent - targetBudgetPercent
```
Also compute these by grade and by any grouping field present.

**Post-cycle distribution**
Recompute compa-ratio for every employee using the new salary. Report the shift in the
mean and median compa-ratio, the count crossing above the maximum, and the count still
below the minimum.

**Compression indicator**
For each grade pair, compare the median new salary of the higher grade to the median new
salary of the lower grade. Report the differential and the change in that differential
versus pre-cycle. Flag any pair where the differential narrows by more than a
user-set threshold, default 2 percentage points.

Label this an indicator, not a compression analysis. Real compression work needs
manager and tenure data this tool does not take. Do not overstate it in the interface.

## 7. Build order

Do these in order. Do not start the next one until the previous one runs.

**Milestone 0 — Scaffold and deploy.**
Create the project, get a page saying "Merit Lab" onto a public URL, and confirm the test
runner executes. Deploying first means deployment is never a problem later.

**Milestone 1 — The math library.**
Every formula in section 6, in `src/lib/`, with tests. No interface at all. This is the
milestone that determines whether the project is credible.

**Milestone 2 — Data in.**
Paste CSV or type into a table. Validate on entry: missing grades, salaries that are not
numbers, ratings not in the scale, duplicate ids. Show clear errors. Ship a synthetic
sample population of about 200 employees so the tool is usable before anyone enters data.

**Milestone 3 — The matrix.**
The editable grid. Rows are ratings, columns are compa-ratio bands, cells hold percentages.
Editable structure: user can add or remove rating rows and adjust band boundaries.

**Milestone 4 — Cost.**
Total cost, spend as a percentage of eligible payroll, variance to target budget, and
the breakdown by grade. This is the moment the tool becomes worth opening.

**Milestone 5 — Consequences.**
Post-cycle compa-ratio distribution chart, over-maximum list, green-circled list,
compression indicator.

**Milestone 6 — Export and compare.**
Download the scenario as a JSON file and reload it. Export results as CSV. Hold two
scenarios side by side.

**Milestone 7 — Ship it properly.**
Landing copy that explains the privacy design in one sentence. A short README with a
screenshot. A worked example anyone can follow.

## 8. Definition of done for each milestone

- The test suite passes.
- The deployed public URL shows the new capability.
- I have used it once on the synthetic population and the numbers are right.

## 9. Interaction design

### The governing rule

There is no Calculate button. There is no Run, no Submit, no wizard, no loading spinner.
Every number on screen recomputes on every keystroke.

This is possible because there is no server, and it is the entire reason the tool feels
different from the compensation software people already have. Anything that inserts a step
between changing an input and seeing the consequence destroys the product.

### Layout

One screen. No navigation. Controls on the left, consequences on the right, both visible
at all times. The user must never have to switch views to see what their change did.

```
┌─────────────────────────┬──────────────────────────────────┐
│  MERIT MATRIX           │  SPEND      3.42%   target 3.25% │
│  editable grid          │  COST       $1.71M               │
│                         │  VARIANCE   +$85K                │
│  budget target  ──○──   │                                  │
│  over-max mode  [Cap ▾] │  ┌────────────────────────────┐  │
│  proration      [ off ] │  │  compa-ratio distribution  │  │
│                         │  │  before (grey) / after     │  │
│  POPULATION             │  └────────────────────────────┘  │
│  204 employees          │                                  │
│  198 eligible           │  6 cross the maximum             │
│  [ load sample ]        │  3 remain below minimum          │
└─────────────────────────┴──────────────────────────────────┘
```

### The dot plot

Render the population as individual dots, one per employee, positioned by compa-ratio.
Not bars. A bar chart shows a distribution; dots show people.

When the matrix changes, each dot animates from its old position to its new one over about
400 milliseconds. Dots that cross the range maximum turn red as they land. The user watches
their population move.

This single element is the difference between a calculator and something worth showing
someone. It is also the thing a spreadsheet fundamentally cannot do.

### Matrix cell behaviour

Each cell shows two numbers: the increase percentage, large; the dollar cost of that cell,
small underneath. Practitioners rarely see the second number, and it reverses intuitions —
the modest increase applied to the large middle population usually costs more than the
generous increase applied to the few top performers.

Hovering a cell dims every dot except the employees in it, and shows headcount and eligible
payroll for that cell. Editing is inline. No modal dialogs.

### Ambient consequences, not alerts

When a change pushes someone above the range maximum, the over-maximum counter increments
with a brief highlight. No modal, no red banner, no error state. The user is exploring, not
making a mistake. Guardrails inform; they do not interrupt.

### Fit-to-budget

A button that scales the whole matrix proportionally to land on the target spend. It is
arithmetically trivial and it feels like magic. Animate the cells changing rather than
snapping, so the user sees which cells moved.

### Scenario flicker

Hold two scenarios. A keyboard shortcut swaps between them instantly, in place. Flipping
between two states in the same position is easier to read than two panels side by side,
because the eye detects change better than it compares.

### Visual direction

Instrument, not brochure. Closer to a mixing desk or a trading terminal than to enterprise
HR software. Dense, quiet, neutral background, one accent colour for over-budget and one
for over-maximum. Nothing decorative.

Use tabular numerals for every figure — a font setting that gives all digits equal width.
Without it, numbers updating live jitter horizontally and the interface feels unstable.
This is a small detail that accounts for a large share of whether the tool feels precise.

### Anti-patterns

Do not build any of these, whatever convention suggests otherwise:

- A multi-step wizard or onboarding flow.
- Tabs that separate the matrix from its results.
- A modal dialog for editing a cell.
- A loading state. There is no server; nothing can be loading.
- Marketing-style hero sections inside the tool itself.

## 10. Open questions to resolve later

- Whether to support multiple currencies. Assume single currency for now.
- Whether to support off-cycle and promotional increases. Out of scope for version 1.
- Whether an incentive target layer belongs here or in a separate tool. Out of scope.
