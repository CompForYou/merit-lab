/**
 * Every term the interface uses, defined once.
 *
 * Merit plans differ between organisations, so a figure labelled "spend" or
 * "compa-ratio" cannot be assumed to mean what any particular reader expects.
 * These entries say what Merit Lab means, show the formula as it is actually
 * implemented, and name the assumption behind it. A practitioner whose plan
 * works differently can then see exactly where it diverges.
 *
 * Definitions are kept here rather than beside the components so the same term
 * cannot drift into two wordings in two panels. `glossary.test.ts` asserts that
 * every term referenced by the interface is defined here, and that every entry
 * here is referenced somewhere.
 */

export interface GlossaryEntry {
  /** Display heading. */
  term: string
  /** Plain language, no jargon beyond the term being defined. */
  definition: string
  /** The formula as implemented, not as generally described. */
  formula?: string
  /** What Merit Lab assumes, especially where practice varies. */
  assumption?: string
}

export const GLOSSARY = {
  'compa-ratio': {
    term: 'Compa-ratio',
    definition:
      'Base salary as a proportion of the grade midpoint. 0.95 means paid 5% below midpoint. Shown as a decimal, never a percentage.',
    formula: 'fullTimeEquivalentSalary / gradeMidpoint',
    assumption:
      'Part-time salaries are grossed up to full time before the comparison, so a 0.5 FTE employee is placed against the same midpoint as everyone else. Returns no value at all when a grade has no midpoint, rather than zero.',
  },

  'range-penetration': {
    term: 'Range penetration',
    definition:
      'How far through the range a salary sits. 0 is the minimum, 1 the maximum, 0.5 halfway.',
    formula: '(fullTimeEquivalentSalary - gradeMin) / (gradeMax - gradeMin)',
    assumption:
      'Not clamped. Green-circled employees return a negative value and red-circled employees above 1, because those outliers are the cases worth finding.',
  },

  'range-spread': {
    term: 'Range spread',
    definition:
      'The width of a grade range as a proportion of its minimum. A 50% spread means the maximum is half again the minimum.',
    formula: '(gradeMax - gradeMin) / gradeMin',
  },

  'midpoint-progression': {
    term: 'Midpoint progression',
    definition:
      'The percentage step between the midpoints of two adjacent grades.',
    formula: '(midpointOfGrade - midpointOfGradeBelow) / midpointOfGradeBelow',
    assumption:
      'Measured against the LOWER grade. A step from 80,000 to 100,000 is a 25% progression, not 20%. Grades are ordered by their declared order field, never inferred from midpoint.',
  },

  'compa-ratio-band': {
    term: 'Compa-ratio band',
    definition:
      'One column of the merit matrix: a range of compa-ratios that receive the same treatment for a given rating.',
    assumption:
      'Boundaries are inclusive at the lower bound and exclusive at the upper. An employee at exactly 1.00 compa-ratio sits at the BOTTOM of the 1.00-1.10 band, not the top of 0.90-1.00. These are bands of compa-ratio, not quartiles of range penetration.',
  },

  'eligible-payroll': {
    term: 'Eligible payroll',
    definition:
      'The base salaries of employees eligible for an increase, summed. The denominator for every spend percentage.',
    assumption:
      'Counts actual pay, not full-time equivalent, because that is what payroll spends. Employees who are ineligible, or who could not be costed at all, are excluded from it — including them would flatter the spend percentage while contributing nothing to the cost.',
  },

  'merit-budget': {
    term: 'Target budget',
    definition:
      'The planned increase spend as a percentage of eligible payroll: the number the cycle is meant to land on.',
    assumption:
      'Compared against total cash spend, because merit budgets are approved as cash. Base build is reported separately.',
  },

  'total-spend': {
    term: 'Total spend',
    definition:
      'All cash this cycle pays out: increases added to base, plus any lump sums.',
    formula: 'baseBuildCost + lumpSumCost',
    assumption:
      'This is the headline cost figure, because it is what a budget approval covers. It differs from base build only in lump sum mode.',
  },

  'base-build': {
    term: 'Base build',
    definition:
      'The part of the spend that is added to base salary, and so carries into next year’s payroll and next year’s merit pool.',
    assumption:
      'A lump sum is cash out the door but builds no base. Two plans can cost identical cash and leave very different run rates behind them, which is why both figures are shown.',
  },

  'lump-sum': {
    term: 'Lump sum',
    definition:
      'Money paid once rather than added to base salary. Used when an increase would carry someone above their range maximum.',
    assumption:
      'Counted in total spend but not in base build. Zero outside lump sum mode.',
  },

  variance: {
    term: 'Variance to target',
    definition:
      'How far this plan sits from the target budget, in both dollars and percentage points. Positive is over budget.',
    formula: 'totalSpend - (targetBudgetPercent x eligiblePayroll)',
  },

  'withheld-at-maximum': {
    term: 'Withheld at the maximum',
    definition:
      'Money the matrix called for that the over-maximum policy did not pay, because the increase would have carried someone past their range maximum.',
    formula: 'uncappedCost - totalSpend',
    assumption:
      'The gap between what your matrix says and what your policy pays. Visible in cap mode; zero in the other two.',
  },

  'over-max-modes': {
    term: 'Over-maximum handling',
    definition:
      'What happens when an increase would carry someone above their range maximum. Cap reduces the increase so the new salary lands exactly on the maximum. Allow over pays it in full and the employee becomes red-circled. Lump sum raises base to the maximum and pays the remainder once.',
    assumption:
      'This choice materially changes total cost without changing a single percentage in the matrix. Under cap, an employee already above the maximum receives nothing: a merit cycle never cuts pay. The range maximum is scaled to an employee’s FTE before the comparison.',
  },

  proration: {
    term: 'Proration',
    definition:
      'Scaling an increase down for someone who was not employed for the whole performance period.',
    formula: 'completedWholeMonths / 12',
    assumption:
      'Whole months, not days, so the factor can be checked by hand. The performance period is the twelve months ending on the merit effective date. Anyone with no hire date is treated as employed throughout. Off by default.',
  },

  'green-circled': {
    term: 'Green-circled',
    definition: 'Paid below the range minimum.',
    assumption:
      'A merit matrix does not clear green-circling: an increase applied to a salary that is already under the minimum usually leaves it under the minimum. Moving these employees into range needs a separate adjustment, costed outside the merit budget.',
  },

  'red-circled': {
    term: 'Red-circled',
    definition: 'Paid above the range maximum.',
    assumption:
      'Someone who starts above the maximum has not "crossed" it this cycle. The crossing count answers what your matrix did, so it counts only employees who were inside the range and are now outside it.',
  },

  'compression-differential': {
    term: 'Compression differential',
    definition:
      'The pay gap between two adjacent grades, as a percentage of the lower one, measured on median salary.',
    formula: '(higherGradeMedian - lowerGradeMedian) / lowerGradeMedian',
    assumption:
      'Medians are taken on full-time equivalent salary. A uniform percentage increase leaves the differential exactly unchanged, so compression comes from uneven increases rather than from spending money. This is an indicator, not a compression analysis: real compression work needs tenure and manager context Merit Lab does not take.',
  },

  'fte-handling': {
    term: 'Part-time employees',
    definition:
      'How Merit Lab treats an employee working less than full time.',
    assumption:
      'Base salary is read as ACTUAL annualized pay at that FTE. Range placement grosses it up to full time, so a 0.5 FTE employee is compared against the same midpoint as a full-timer. Cost, eligible payroll and the increase itself use actual pay. The range maximum is scaled by FTE before capping.',
  },

  'fit-to-budget': {
    term: 'Fit to budget',
    definition:
      'Scales every cell of the matrix by the same factor so the plan lands on the target budget.',
    formula: 'factor = targetBudgetPercent / currentSpendPercent',
    assumption:
      'Scaling preserves the shape of the plan design and changes only its magnitude. It is exact in one pass, except where the range maximum binds: once employees are capped they stop absorbing increase, and no larger matrix will reach the target.',
  },

  'cell-cost': {
    term: 'Cell cost',
    definition:
      'What one cell of the matrix costs: its percentage applied to everyone who falls in it.',
    assumption:
      'Rarely shown, and it reverses intuitions. A generous percentage paid to a handful of top performers routinely costs less than a modest one paid to the large middle of the population.',
  },

  rounding: {
    term: 'Rounding new salaries',
    definition:
      'Rounds each new base salary to a whole multiple, the way most plans present increases to managers and payroll.',
    assumption:
      'Off by default, because it CHANGES THE COST: rounding two hundred salaries up or down moves the budget. It never cuts pay, and never rounds anyone above a maximum the over-maximum mode is holding, which would quietly undo the cap. Lump sums are left unrounded.',
  },

  'not-costed': {
    term: 'Could not be costed',
    definition:
      'An employee Merit Lab could not price, because their grade is missing, their grade has no midpoint, no band covers their compa-ratio, or their rating has no row in the matrix.',
    assumption:
      'Reported separately and excluded from eligible payroll. Treating them as a zero increase inside the denominator would understate the spend percentage while looking entirely normal.',
  },
} as const satisfies Record<string, GlossaryEntry>

export type TermId = keyof typeof GLOSSARY

export const TERM_IDS = Object.keys(GLOSSARY) as TermId[]

export function lookupTerm(id: TermId): GlossaryEntry {
  return GLOSSARY[id]
}
