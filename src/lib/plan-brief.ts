import type { Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import type { ScenarioResults } from './run-scenario'
import type { Finding } from './advisor'
import type { InversionSummary } from './inversions'
import type { SensitivityRow } from './sensitivity'

/**
 * The plan as one page somebody else can read.
 *
 * Until now the only way to show a colleague what this tool concluded was a
 * screenshot. That is the point at which the tool's value was supposed to be
 * realised — the moment the analyst hands their thinking to a CHRO — and it was
 * the one thing the tool could not do.
 *
 * A standalone HTML file rather than a PDF or a slide: it opens in any browser,
 * prints straight to PDF with the browser's own dialogue, pastes into a document,
 * and needs nothing installed. It is written to the user's own disk by the same
 * download path as the CSV, so no data leaves the device.
 *
 * It carries conclusions, not rows. Anyone who wants the rows exports the CSV.
 */

export interface BriefInput {
  planName: string
  scenario: ScenarioResults
  grades: Grade[]
  matrix: MeritMatrix
  settings: ScenarioSettings
  findings: Finding[]
  inversions: InversionSummary
  sensitivity: SensitivityRow[]
  generatedAt: Date
}

export function planBriefHtml(input: BriefInput): string {
  const { planName, scenario, matrix, settings, findings, generatedAt } = input
  const budget = scenario.budget
  const { money, signedMoney } = moneyFormatter(settings)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(planName)} — merit plan brief</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #18181b; background: #fff;
    max-width: 52rem;
  }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 2px; }
  h2 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.12em; color: #a1a1aa;
    margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e4e4e7;
  }
  .meta { color: #71717a; font-size: 11px; margin: 0 0 4px; }
  .headline { display: flex; gap: 32px; flex-wrap: wrap; margin-top: 14px; }
  .figure .label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;
  }
  .figure .value {
    font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums; margin-top: 2px;
  }
  .figure .detail { font-size: 11px; color: #71717a; font-variant-numeric: tabular-nums; }
  .warn { color: #b45309; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th {
    text-align: right; font-weight: 600; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.06em; color: #a1a1aa; padding: 0 6px 5px; border-bottom: 1px solid #e4e4e7;
  }
  th:first-child, td:first-child { text-align: left; padding-left: 0; }
  td {
    text-align: right; padding: 4px 6px; border-bottom: 1px solid #f4f4f5;
    font-variant-numeric: tabular-nums;
  }
  .finding { margin-bottom: 12px; padding-left: 10px; border-left: 2px solid #e4e4e7; }
  .finding.high { border-left-color: #d97706; }
  .finding .head { font-weight: 500; }
  .finding .detail, .finding .cannot { color: #52525b; font-size: 12px; margin-top: 2px; }
  .finding .cannot { color: #a1a1aa; font-size: 11px; }
  footer {
    margin-top: 30px; padding-top: 10px; border-top: 1px solid #e4e4e7;
    color: #a1a1aa; font-size: 10px; line-height: 1.6;
  }
  @media print {
    body { padding: 0; max-width: none; font-size: 11px; }
    h2 { margin-top: 18px; }
    .finding { break-inside: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>

<h1>${escapeHtml(planName)}</h1>
<p class="meta">Merit plan brief · ${formatDate(generatedAt)} · ${pct(budget.budgetSpendPercent, 2)} of eligible payroll</p>

<div class="headline">
  ${figure('Spend', pct(budget.budgetSpendPercent, 2), `against a ${pct(settings.targetBudgetPercent, 2)} target`)}
  ${figure('Cost', money(budget.totalSpend), `${money(budget.baseBuildCost)} into base`)}
  ${figure(
    'Variance',
    signedMoney(budget.varianceToTargetDollars),
    budget.varianceToTargetPercent === null
      ? ''
      : `${signedPct(budget.varianceToTargetPercent, 2)} of payroll`,
    budget.varianceToTargetDollars !== null && budget.varianceToTargetDollars > 0,
  )}
  ${figure('Eligible', count(budget.eligibleHeadcount), `of ${count(budget.totalHeadcount)} employees · ${money(budget.eligiblePayroll)} payroll`)}
</div>

<h2>The matrix</h2>
${matrixTable(matrix)}
<p class="meta">
  ${describeSettings(settings)}
</p>

<h2>What it does</h2>
${consequenceTable(input, money)}

${findings.length > 0 ? `<h2>What to do about it</h2>\n${findingsHtml(findings)}` : ''}

${input.sensitivity.length > 1 ? `<h2>At another budget</h2>\n${sensitivityTable(input.sensitivity, settings.targetBudgetPercent, money)}` : ''}

<footer>
  Produced by Merit Lab, which runs entirely in a browser: no population data was
  uploaded anywhere to make this. Every figure is computed from the population
  loaded at the time and can be reproduced by loading the same file against the
  matrix above.
  <br>
  This document may contain pay information. Handle it the way you would handle
  the spreadsheet it came from.
</footer>

</body>
</html>`
}

function figure(label: string, value: string, detail: string, warn = false): string {
  return `<div class="figure">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value${warn ? ' warn' : ''}">${escapeHtml(value)}</div>
    ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ''}
  </div>`
}

function matrixTable(matrix: MeritMatrix): string {
  const head = matrix.bands.map((b) => `<th>${escapeHtml(b.label)}</th>`).join('')
  const rows = matrix.ratings
    .map((rating) => {
      const cells = matrix.bands
        .map((band) => `<td>${pct(matrix.cells[rating]?.[band.id] ?? 0, 2)}</td>`)
        .join('')
      return `<tr><td>${escapeHtml(rating)}</td>${cells}</tr>`
    })
    .join('\n')

  return `<table>
<thead><tr><th>Rating</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>`
}

function consequenceTable(input: BriefInput, money: (v: number | null | undefined) => string): string {
  const { scenario, inversions } = input
  const d = scenario.distribution
  const belowMinimum = scenario.results.filter((r) => r.isBelowMinimumAfter).length
  const aboveMaximum = scenario.results.filter((r) => r.isOverMaximumAfter).length
  const zeroIncrease = scenario.results.filter(
    (r) => r.eligible && r.exclusionReason === null && r.increaseAmount === 0,
  ).length

  const rows: [string, string][] = [
    [
      'Median compa-ratio',
      d.medianShift === null
        ? '—'
        : `${ratio(d.medianCompaRatioBefore)} → ${ratio(d.medianCompaRatioAfter)} (${signedPoints(d.medianShift)})`,
    ],
    ['Crossed the maximum this cycle', count(d.countCrossedMaximum)],
    ['Finish above their range maximum', count(aboveMaximum)],
    ['Remain below their range minimum', count(belowMinimum)],
    ['Receive nothing', count(zeroIncrease)],
    [
      'Withheld at the maximum',
      scenario.budget.reducedByCap > 0 ? money(scenario.budget.reducedByCap) : '—',
    ],
    [
      'Out-earned by a worse rating in the same grade',
      inversions.affectedCount > 0 ? count(inversions.affectedCount) : 'none',
    ],
  ]

  return `<table>
<tbody>
${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('\n')}
</tbody>
</table>`
}

function findingsHtml(findings: Finding[]): string {
  return findings
    .map(
      (finding) => `<div class="finding${finding.severity === 'high' ? ' high' : ''}">
  <div class="head">${escapeHtml(finding.headline)}</div>
  <div class="detail">${escapeHtml(finding.detail)}</div>
  <div class="detail"><strong>Suggested:</strong> ${escapeHtml(finding.recommendedAction)}${
    finding.actionCost ? ` <em>(${escapeHtml(finding.actionCost)})</em>` : ''
  }</div>
  ${
    finding.supportingNumbers.length > 0
      ? `<div class="cannot">${finding.supportingNumbers
          .map((n) => `${escapeHtml(n.label)}: ${escapeHtml(String(n.value))}`)
          .join(' · ')}</div>`
      : ''
  }
  <div class="cannot">What this cannot know: ${escapeHtml(finding.cannotKnow)}</div>
</div>`,
    )
    .join('\n')
}

function sensitivityTable(
  rows: SensitivityRow[],
  current: number,
  money: (v: number | null | undefined) => string,
): string {
  const body = rows
    .map((row) => {
      const isCurrent = Math.abs(row.targetPercent - current) < 1e-9
      const label = `${pct(row.targetPercent, 2)}${isCurrent ? ' (this plan)' : ''}${
        row.reachable ? '' : ` — reaches only ${pct(row.achievedPercent, 2)}`
      }`
      return `<tr>
  <td>${escapeHtml(label)}</td>
  <td>${money(row.totalSpend)}</td>
  <td>${row.medianShift === null ? '—' : signedPoints(row.medianShift)}</td>
  <td>${count(row.belowMinimumAfter)}</td>
</tr>`
    })
    .join('\n')

  return `<table>
<thead><tr><th>Budget</th><th>Cost</th><th>Median moves</th><th>Below minimum</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
<p class="meta">Each row rescales the matrix above; the shape of the plan is unchanged.</p>`
}

function describeSettings(settings: ScenarioSettings): string {
  const parts = [
    `Over the maximum: ${OVER_MAX_LABELS[settings.overMaxMode]}.`,
    settings.prorationEnabled
      ? `Prorated for anyone hired within the 12 months ending ${settings.meritEffectiveDate ?? 'the effective date'}.`
      : 'No proration: everyone is treated as employed for the full period.',
    settings.roundingIncrement && settings.roundingIncrement > 0
      ? `New salaries rounded to the nearest ${settings.roundingIncrement.toLocaleString('en-US')}.`
      : 'No rounding: increases applied at full precision.',
  ]
  return escapeHtml(parts.join(' '))
}

const OVER_MAX_LABELS: Record<ScenarioSettings['overMaxMode'], string> = {
  capAtMax: 'increases are capped at the range maximum',
  allowOverMax: 'increases are paid in full and may exceed the maximum',
  lumpSum: 'the portion above the maximum is paid as a lump sum, not built into base',
}

/**
 * Escape every character that could close a tag or an attribute.
 *
 * A plan name and an employee id both come from the user, and this file gets
 * opened in a browser. Nothing here is trusted markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Money, in the scenario's own currency.
 *
 * Built per brief rather than borrowed from `format.ts`. That module keeps the
 * currency in module-level state which the live interface mutates as the user
 * changes it, and this document is written to disk and read later — possibly on
 * another machine — so it has to carry its own.
 *
 * It also has to agree with the advisor strings embedded in it, which arrive
 * already formatted. A page mixing a formatted $546,075 from one source with a
 * bare 5,850 from another reads as broken, and a brief that looks broken is not
 * one anybody forwards.
 */
export function moneyFormatter(settings: ScenarioSettings): {
  money: (value: number | null | undefined) => string
  signedMoney: (value: number | null | undefined) => string
} {
  const locale = settings.locale ?? 'en-US'
  const currency = settings.currency ?? 'USD'

  let format: (value: number) => string
  try {
    const intl = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    })
    format = (value) => intl.format(value)
  } catch {
    // An unrecognised currency code should cost the symbol, not the document.
    format = (value) => value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  return {
    money: (value) =>
      value === null || value === undefined || !Number.isFinite(value)
        ? '—'
        : format(Math.round(value)),

    signedMoney: (value) => {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      const rounded = Math.round(value)
      return `${rounded > 0 ? '+' : ''}${format(rounded)}`
    },
  }
}

function pct(value: number | null | undefined, places: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(places)}%`
}

function signedPct(value: number | null | undefined, places: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(places)}%`
}

function signedPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} pts`
}

function ratio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function count(value: number): string {
  return value.toLocaleString('en-US')
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** A filename that sorts chronologically and says what it holds. */
export function briefFileName(planName: string, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().slice(0, 10)
  const safe = planName.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${stamp}-${safe || 'merit-plan'}-brief.html`
}
