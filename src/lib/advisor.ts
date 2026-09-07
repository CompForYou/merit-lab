import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import type { ScenarioResults } from './run-scenario'
import { fitToBudgetFactor } from './run-scenario'
import {
  costToClearGreenCircles,
  projectCyclesToMidpoint,
  zeroIncreaseEmployees,
  structureHealth,
  type ModeOutcome,
} from './remediation'
import {
  formatCompaRatio,
  formatCurrency,
  formatPercent,
  formatPercentSigned,
  pluralize,
} from './format'

/**
 * The advisor.
 *
 * It is prescriptive: it ranks what is wrong with a plan and says what to do
 * about it. That is a deliberate choice, and it carries an obvious risk — a tool
 * confidently wrong about strategy stops being trusted about arithmetic, which
 * is the thing that must never be in question.
 *
 * The risk is managed structurally rather than by softening the wording. Every
 * finding carries:
 *
 *   supportingNumbers  the arithmetic that produced it, so it can be checked
 *   actionCost         what the recommended action would cost, where that is
 *                      calculable, so the advice is a trade rather than a slogan
 *   cannotKnow         what Merit Lab lacks to be certain, stated plainly
 *
 * A reader who disagrees with the recommendation can still verify the numbers,
 * and can see exactly which piece of missing context they are supplying that the
 * tool could not.
 *
 * Every rule is a pure function with a test that triggers it and a test that
 * does not.
 */

export type Severity = 'high' | 'medium' | 'low'

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

export interface SupportingNumber {
  label: string
  value: string
}

export interface Finding {
  id: string
  severity: Severity
  /** What is true, in one line. */
  headline: string
  /** How the tool arrived at it. */
  detail: string
  supportingNumbers: SupportingNumber[]
  /** What to do about it. */
  recommendedAction: string
  /** What that action would cost, where it can be calculated. */
  actionCost: string | null
  /** What Merit Lab cannot see, and so cannot account for. */
  cannotKnow: string
}

export interface AdvisorContext {
  scenario: ScenarioResults
  employees: Employee[]
  grades: Grade[]
  matrix: MeritMatrix
  settings: ScenarioSettings
  /** All three over-maximum outcomes, so recommendations can price a switch. */
  modeOutcomes: ModeOutcome[]
}

type Rule = (context: AdvisorContext) => Finding | null

/** Materially off target: below this, the variance is noise. */
const BUDGET_TOLERANCE = 0.0005
/** A compa-ratio this far below midpoint is a lagging grade. */
const LAGGING_COMPA_RATIO = 0.95
/**
 * The cap only explains an underspend when it is withholding a real share of
 * the shortfall. A half-sized matrix also comes in under target, and blaming
 * the range maximum for that would point the user at the wrong problem.
 */
const MATERIAL_CAP_SHARE = 0.25

const rules: Rule[] = [
  function employeesNotCosted({ scenario }): Finding | null {
    const excluded = scenario.results.filter((r) => r.excluded)
    if (excluded.length === 0) return null

    const reasons = new Map<string, number>()
    for (const r of excluded) {
      const key = r.exclusionReason ?? 'unknown'
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }

    return {
      id: 'employees-not-costed',
      severity: 'high',
      headline: `${pluralize(excluded.length, 'employee')} could not be costed and ${excluded.length === 1 ? 'is' : 'are'} missing from every figure on this screen.`,
      detail:
        'These employees are excluded from eligible payroll as well as from cost, so the spend percentage is calculated over a smaller population than the one you loaded. Every other finding here is computed without them.',
      supportingNumbers: [
        { label: 'Not costed', value: String(excluded.length) },
        ...[...reasons.entries()].map(([reason, count]) => ({
          label: reason.replace(/-/g, ' '),
          value: String(count),
        })),
      ],
      recommendedAction:
        'Fix the data before reading anything else here. Add the missing grades to the structure, or add the missing ratings as rows in the matrix, then re-check the cost.',
      actionCost: null,
      cannotKnow:
        'Whether these employees should be in the cycle at all. They may be legitimately out of scope, in which case marking them ineligible is more honest than leaving them uncosted.',
    }
  },

  function overBudget({ scenario, settings }): Finding | null {
    const { budget } = scenario
    if (budget.varianceToTargetPercent === null) return null
    if (budget.varianceToTargetPercent <= BUDGET_TOLERANCE) return null

    const factor = fitToBudgetFactor(
      budget.budgetSpendPercent,
      settings.targetBudgetPercent,
    )

    return {
      id: 'over-budget',
      severity: 'high',
      headline: `This plan is ${formatCurrency(budget.varianceToTargetDollars)} over target, at ${formatPercent(budget.budgetSpendPercent)} against ${formatPercent(settings.targetBudgetPercent)}.`,
      detail: `Total spend of ${formatCurrency(budget.totalSpend)} against an eligible payroll of ${formatCurrency(budget.eligiblePayroll)}. The target permits ${formatCurrency(settings.targetBudgetPercent * budget.eligiblePayroll)}.`,
      supportingNumbers: [
        { label: 'Spend', value: formatPercent(budget.budgetSpendPercent) },
        { label: 'Target', value: formatPercent(settings.targetBudgetPercent) },
        { label: 'Over by', value: formatCurrency(budget.varianceToTargetDollars) },
        {
          label: 'Variance',
          value: formatPercentSigned(budget.varianceToTargetPercent),
        },
      ],
      recommendedAction:
        factor === null
          ? 'Reduce the matrix until spend meets the target.'
          : `Use Fit to budget, which scales every cell by ${factor.toFixed(3)} and preserves the shape of your plan design. If you would rather protect particular cells, reduce the ones with the largest headcount instead: they carry most of the cost.`,
      actionCost:
        factor === null
          ? null
          : `Scaling by ${factor.toFixed(3)} removes ${formatCurrency(budget.varianceToTargetDollars ?? 0)} of increase across the population.`,
      cannotKnow:
        'Whether the target is the real constraint. Budgets are sometimes indicative, and an over-run defended by a retention case is a different conversation from one that has to be closed.',
    }
  },

  function underBudget({ scenario, settings }): Finding | null {
    const { budget } = scenario
    if (budget.varianceToTargetPercent === null) return null
    if (budget.varianceToTargetPercent >= -BUDGET_TOLERANCE) return null
    // The cap-limited case has its own finding. Stand down only when the cap is
    // actually the explanation, not merely present.
    if (capExplainsShortfall(budget, settings)) return null

    const factor = fitToBudgetFactor(
      budget.budgetSpendPercent,
      settings.targetBudgetPercent,
    )

    return {
      id: 'under-budget',
      severity: 'medium',
      headline: `This plan leaves ${formatCurrency(Math.abs(budget.varianceToTargetDollars ?? 0))} of the budget unspent.`,
      detail: `Spending ${formatPercent(budget.budgetSpendPercent)} against a target of ${formatPercent(settings.targetBudgetPercent)}. Unspent merit budget rarely carries forward, and it is the cheapest money available for fixing range position.`,
      supportingNumbers: [
        { label: 'Spend', value: formatPercent(budget.budgetSpendPercent) },
        { label: 'Target', value: formatPercent(settings.targetBudgetPercent) },
        {
          label: 'Unspent',
          value: formatCurrency(Math.abs(budget.varianceToTargetDollars ?? 0)),
        },
      ],
      recommendedAction:
        factor === null
          ? 'Raise the matrix to use the budget, concentrating it low in the ranges where it moves compa-ratio fastest.'
          : `Either use Fit to budget, which scales every cell by ${factor.toFixed(3)}, or direct the unspent amount at the low compa-ratio cells, where the same money moves range position furthest.`,
      actionCost: `Spending it in full costs ${formatCurrency(Math.abs(budget.varianceToTargetDollars ?? 0))}, which is already inside the approved budget.`,
      cannotKnow:
        'Whether the underspend is deliberate. Holding budget back for off-cycle adjustments or an equity reserve is a legitimate plan, and this tool cannot see that reserve.',
    }
  },

  function capIsLimiting({ scenario, settings, modeOutcomes }): Finding | null {
    const { budget } = scenario
    if (!capExplainsShortfall(budget, settings)) return null

    const lumpSum = modeOutcomes.find((m) => m.mode === 'lumpSum')
    const affected = scenario.results.filter((r) => r.reducedByCap > 0).length

    return {
      id: 'cap-is-limiting',
      severity: 'high',
      headline: `The range maximum is withholding ${formatCurrency(budget.reducedByCap)} while the plan is under target.`,
      detail: `${pluralize(affected, 'employee')} cannot absorb their full increase, so scaling the matrix higher will not reach the target: the extra money has nowhere to go. This is a structure problem presenting as a budget problem.`,
      supportingNumbers: [
        { label: 'Withheld', value: formatCurrency(budget.reducedByCap) },
        { label: 'Affected', value: String(affected) },
        { label: 'Spend', value: formatPercent(budget.budgetSpendPercent) },
        { label: 'Target', value: formatPercent(settings.targetBudgetPercent) },
      ],
      recommendedAction:
        'Switch the over-maximum mode to lump sum. It pays these employees the money the matrix intended without pushing base salary past the maximum, so the run rate is unaffected. If the population is persistently at the top of its ranges, the ranges themselves are the thing to move.',
      actionCost: lumpSum
        ? `Lump sum mode costs ${formatCurrency(lumpSum.totalSpend)}, ${formatCurrency(lumpSum.totalSpend - budget.totalSpend)} more than capping, and builds no additional base.`
        : null,
      cannotKnow:
        'Whether these ranges are correct. A population pinned at the maximum can mean the ranges are stale or that these are genuinely long-tenured people in the right place; market data would settle it and Merit Lab holds none.',
    }
  },

  function greenCirclesRemain({ scenario, grades }): Finding | null {
    const remediation = costToClearGreenCircles(
      scenario.results,
      grades,
      scenario.budget.eligiblePayroll,
    )
    if (remediation.count === 0) return null

    return {
      id: 'green-circles-remain',
      severity: 'medium',
      headline: `${pluralize(remediation.count, 'employee')} finish below their range minimum even after this increase.`,
      detail:
        'A merit matrix applies a percentage to an existing salary, so it cannot close a gap to the minimum: a percentage of a salary that is already too low is still too low. These employees are being paid outside the structure the rest of the plan is built on.',
      supportingNumbers: [
        { label: 'Still below', value: String(remediation.count) },
        { label: 'Cost to clear', value: formatCurrency(remediation.cost) },
        {
          label: 'Of eligible payroll',
          value: formatPercent(remediation.percentOfEligiblePayroll),
        },
        { label: 'Largest gap', value: formatCurrency(remediation.largestShortfall) },
      ],
      recommendedAction:
        'Fund a separate green-circle adjustment outside the merit budget and bring these employees to their minimum in one move. Spreading it over several cycles leaves them below the minimum throughout, which is the exposure you are carrying now.',
      actionCost: `Clearing all ${remediation.count} costs ${formatCurrency(remediation.cost)}, a further ${formatPercent(remediation.percentOfEligiblePayroll)} of eligible payroll on top of the merit spend.`,
      cannotKnow:
        'Whether these employees are correctly graded. Someone well below a minimum is sometimes in the wrong grade rather than underpaid for the right one, and that is a levelling question rather than a pay one.',
    }
  },

  function crossingsIntoRedCircle({ scenario, settings, modeOutcomes }): Finding | null {
    const crossings = scenario.distribution.countCrossedMaximum
    if (crossings === 0) return null
    if (settings.overMaxMode !== 'allowOverMax') return null

    const capped = modeOutcomes.find((m) => m.mode === 'capAtMax')
    const lumpSum = modeOutcomes.find((m) => m.mode === 'lumpSum')

    return {
      id: 'crossings-into-red-circle',
      severity: 'medium',
      headline: `${pluralize(crossings, 'employee')} ${crossings === 1 ? 'is' : 'are'} carried above their range maximum by this plan.`,
      detail:
        'Allowing increases over the maximum builds the excess into base salary permanently. It compounds into next year’s payroll, next year’s merit pool, and every subsequent cycle, long after the decision that created it has been forgotten.',
      supportingNumbers: [
        { label: 'Newly over max', value: String(crossings) },
        {
          label: 'Base build now',
          value: formatCurrency(scenario.budget.baseBuildCost),
        },
        ...(lumpSum
          ? [{ label: 'Base build on lump sum', value: formatCurrency(lumpSum.baseBuildCost) }]
          : []),
      ],
      recommendedAction:
        'Switch to lump sum. It pays the same cash this year but stops the excess entering base salary, which keeps the range meaningful and the run rate flat. Reserve allowing over the maximum for cases you can name individually.',
      actionCost:
        lumpSum && capped
          ? `Lump sum costs the same cash as allowing over — ${formatCurrency(lumpSum.totalSpend)} — but builds ${formatCurrency(scenario.budget.baseBuildCost - lumpSum.baseBuildCost)} less into base. Capping instead would cost ${formatCurrency(capped.totalSpend)} and withhold ${formatCurrency(capped.reducedByCap)}.`
          : null,
      cannotKnow:
        'Whether these people should be above the maximum. A genuine market outlier or a deliberately protected specialist belongs there; the tool sees only that the range says otherwise.',
    }
  },

  function zeroIncreases({ scenario }): Finding | null {
    const zero = zeroIncreaseEmployees(scenario.results)
    if (zero.length === 0) return null

    const byRating = new Map<string, number>()
    for (const r of zero) {
      byRating.set(r.performanceRating, (byRating.get(r.performanceRating) ?? 0) + 1)
    }

    return {
      id: 'zero-increases',
      severity: zero.length > scenario.budget.eligibleHeadcount * 0.1 ? 'medium' : 'low',
      headline: `${pluralize(zero.length, 'eligible employee')} ${zero.length === 1 ? 'receives' : 'receive'} nothing under this plan.`,
      detail:
        'A zero increase is a retention conversation whether or not it is intended. Some are deliberate — the bottom rating usually pays nothing by design — and some are a side effect of a cell left at zero or an increase entirely withheld at the maximum.',
      supportingNumbers: [
        { label: 'Zero increase', value: String(zero.length) },
        ...[...byRating.entries()].map(([rating, count]) => ({
          label: rating,
          value: String(count),
        })),
      ],
      recommendedAction:
        'Check the list against your intent. Where the zero comes from a rating that is meant to pay nothing, leave it and brief the managers. Where it comes from a cell you have not set, or from the maximum withholding the whole increase, decide that case deliberately rather than by omission.',
      actionCost: null,
      cannotKnow:
        'Which of these people you can afford to lose. Flight risk depends on market, tenure and manager relationship, none of which this tool takes.',
    }
  },

  function compressionFlagged({ scenario, settings }): Finding | null {
    const flagged = scenario.compression.filter((p) => p.flagged)
    if (flagged.length === 0) return null

    const worst = [...flagged].sort(
      (a, b) => (a.differentialChange ?? 0) - (b.differentialChange ?? 0),
    )[0]

    return {
      id: 'compression-flagged',
      severity: 'medium',
      headline: `${flagged.length === 1 ? 'One grade step narrows' : `${flagged.length} grade steps narrow`} by more than ${formatPercent(settings.compressionThreshold, 0)} under this plan.`,
      detail: `The largest is ${worst.lowerGradeName} to ${worst.higherGradeName}, where the median differential falls from ${formatPercent(worst.differentialBefore, 1)} to ${formatPercent(worst.differentialAfter, 1)}. A uniform percentage increase leaves differentials untouched, so this narrowing comes from paying the lower grade more than the higher one, proportionally.`,
      supportingNumbers: [
        { label: 'Steps flagged', value: String(flagged.length) },
        { label: 'Worst step', value: `${worst.lowerGradeName} → ${worst.higherGradeName}` },
        { label: 'Before', value: formatPercent(worst.differentialBefore, 1) },
        { label: 'After', value: formatPercent(worst.differentialAfter, 1) },
      ],
      recommendedAction:
        'Look at which cells drive it. Narrowing usually comes from paying generously at low compa-ratios, which concentrates in the junior grades because that is where low compa-ratios live. If the differential matters more than the range movement, flatten the low-compa-ratio column; if it does not, record that you decided so.',
      actionCost: null,
      cannotKnow:
        'Whether the narrowing is a problem. Deliberately moving a lagging junior grade compresses differentials on purpose. Real compression analysis needs tenure and manager data this tool does not take, and this indicator says only that the gap moved.',
    }
  },

  function laggingGrade({ scenario, grades }): Finding | null {
    const gradeById = new Map(grades.map((g) => [g.id, g]))
    const candidates = [...scenario.byGrade.entries()]
      .map(([gradeId, budget]) => {
        const medians = scenario.results.filter(
          (r) => r.gradeId === gradeId && r.newCompaRatio !== null,
        )
        if (medians.length < 5) return null
        const before = median(medians.map((r) => r.compaRatio as number))
        const after = median(medians.map((r) => r.newCompaRatio as number))
        return { gradeId, budget, before, after, headcount: medians.length }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.after < LAGGING_COMPA_RATIO)

    if (candidates.length === 0) return null

    const worst = candidates.sort((a, b) => a.after - b.after)[0]
    const grade = gradeById.get(worst.gradeId)
    const cycles = projectCyclesToMidpoint(worst.before, worst.after)

    return {
      id: 'lagging-grade',
      severity: 'medium',
      headline: `${grade?.name ?? worst.gradeId} sits at a median compa-ratio of ${formatCompaRatio(worst.after)} after this cycle.`,
      detail: `Its ${pluralize(worst.headcount, 'employee')} are paid below the midpoint of their own range as a group. This plan moves the median from ${formatCompaRatio(worst.before)} to ${formatCompaRatio(worst.after)}.${
        cycles === null
          ? ' At this rate the grade does not reach its midpoint at all.'
          : ` Continuing at that rate, it reaches midpoint in about ${cycles.toFixed(1)} cycles.`
      }`,
      supportingNumbers: [
        { label: 'Median before', value: formatCompaRatio(worst.before) },
        { label: 'Median after', value: formatCompaRatio(worst.after) },
        { label: 'Headcount', value: String(worst.headcount) },
        {
          label: 'Cycles to midpoint',
          value: cycles === null ? 'never at this rate' : cycles.toFixed(1),
        },
      ],
      recommendedAction:
        cycles === null || cycles > 5
          ? `Merit alone will not fix this grade in a reasonable time. Treat it as a structural correction: either a targeted adjustment for ${grade?.name ?? 'the grade'} outside the merit budget, or accept that the range is above where you actually pay and move the range.`
          : `Keep the low compa-ratio cells generous for this grade's population and it corrects within about ${cycles.toFixed(0)} cycles without further intervention.`,
      actionCost: null,
      cannotKnow:
        'Whether the grade is underpaid or the range is wrong. A whole grade sitting below midpoint often means the range was set from market data that no longer matches how the roles are actually scoped.',
    }
  },

  function structureProblems({ grades }): Finding | null {
    const issues = structureHealth(grades)
    if (issues.length === 0) return null

    const severe = issues.some(
      (i) => i.kind === 'negative-progression' || i.kind === 'gap-between-grades',
    )

    return {
      id: 'structure-problems',
      severity: severe ? 'high' : 'low',
      headline: `The salary structure has ${pluralize(issues.length, 'issue')} independent of this merit plan.`,
      detail: issues.map((i) => i.detail).join(' '),
      supportingNumbers: issues.map((i) => ({
        label: i.kind.replace(/-/g, ' '),
        value: i.gradeName,
      })),
      recommendedAction: severe
        ? 'Fix the structure before running the cycle against it. A negative progression or a gap between grades makes every compa-ratio computed from it misleading, including the ones this tool is showing you.'
        : 'Review these ranges at the next structure refresh. They do not invalidate this cycle, but they will keep producing odd placements until they are corrected.',
      actionCost: null,
      cannotKnow:
        'Why the structure is shaped this way. Overlapping or unusual ranges are sometimes a deliberate response to a market that does not fit a tidy grid.',
    }
  },
]

/**
 * Run every rule and return what fired, worst first.
 *
 * Rules never depend on each other's output. A rule that would duplicate a more
 * specific one stands down instead, which is why the under-budget rule stays
 * silent when the cap is the reason for the underspend.
 */
export function adviseOnScenario(context: AdvisorContext): Finding[] {
  return rules
    .map((rule) => rule(context))
    .filter((finding): finding is Finding => finding !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * Whether the range maximum is a material part of why a plan is under target.
 *
 * Being under target while something is withheld is not enough: a plan can be
 * under target for entirely unrelated reasons and still have a few red-circled
 * employees absorbing nothing. The cap earns the explanation only when
 * releasing it would close a real share of the gap.
 */
function capExplainsShortfall(
  budget: ScenarioResults['budget'],
  settings: ScenarioSettings,
): boolean {
  if (budget.reducedByCap <= 0) return false
  if (budget.budgetSpendPercent === null) return false
  if (budget.budgetSpendPercent >= settings.targetBudgetPercent - BUDGET_TOLERANCE) {
    return false
  }

  const shortfall =
    settings.targetBudgetPercent * budget.eligiblePayroll - budget.totalSpend
  if (shortfall <= 0) return false

  return budget.reducedByCap / shortfall >= MATERIAL_CAP_SHARE
}

/** Local copy to avoid a circular import through statistics into run-scenario. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}
