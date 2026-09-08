import { describe, it, expect } from 'vitest'
import { planBriefHtml, briefFileName, type BriefInput } from './plan-brief'
import { runScenario } from './run-scenario'
import { findInversions } from './inversions'
import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import type { Finding } from './advisor'

const GRADE: Grade = { id: 'G1', name: 'Analyst', order: 1, min: 50_000, mid: 100_000, max: 200_000 }

const MATRIX: MeritMatrix = {
  ratings: ['Exceeds', 'Meets'],
  bands: [{ id: 'all', label: 'All', lowerBound: null, upperBound: null }],
  cells: { Exceeds: { all: 0.05 }, Meets: { all: 0.03 } },
}

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.04,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

/** Two at 5% and two at 3% of 100,000 is 16,000 on 400,000: exactly 4%. */
const PEOPLE: Employee[] = [
  { id: 'E1', gradeId: 'G1', baseSalary: 100_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  { id: 'E2', gradeId: 'G1', baseSalary: 100_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  { id: 'E3', gradeId: 'G1', baseSalary: 100_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'E4', gradeId: 'G1', baseSalary: 100_000, performanceRating: 'Meets', fte: 1, eligible: true },
]

function brief(over: Partial<BriefInput> = {}): string {
  const scenario = runScenario(PEOPLE, [GRADE], MATRIX, SETTINGS)
  return planBriefHtml({
    planName: 'Plan A',
    scenario,
    grades: [GRADE],
    matrix: MATRIX,
    settings: SETTINGS,
    findings: [],
    inversions: findInversions(scenario.results, MATRIX.ratings),
    sensitivity: [],
    generatedAt: new Date('2026-03-15T10:00:00Z'),
    ...over,
  })
}

describe('planBriefHtml - the document', () => {
  const html = brief()

  it('is a complete standalone document', () => {
    // It is written to disk and opened later, possibly on another machine. A
    // fragment would render as text.
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).toContain('<meta charset="utf-8">')
  })

  it('carries its own styles rather than linking to any', () => {
    expect(html).toContain('<style>')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('<script')
  })

  it('names the plan in the title and the heading', () => {
    expect(html).toContain('<title>Plan A — merit plan brief</title>')
    expect(html).toContain('<h1>Plan A</h1>')
  })

  it('has a print stylesheet, because printing is the point', () => {
    expect(html).toContain('@media print')
  })
})

describe('planBriefHtml - the figures', () => {
  const html = brief()

  it('states the spend against the target', () => {
    // 16,000 on 400,000 is 4.00%, exactly on a 4.00% target.
    expect(html).toContain('4.00%')
    expect(html).toContain('against a 4.00% target')
  })

  it('states the cost', () => {
    expect(html).toContain('16,000')
  })

  it('reproduces the matrix that produced it', () => {
    // Without this the file cannot be reproduced, and a figure nobody can
    // reproduce cannot be audited.
    expect(html).toContain('Exceeds')
    expect(html).toContain('5.00%')
    expect(html).toContain('3.00%')
  })

  it('says what the settings were', () => {
    expect(html).toContain('increases are capped at the range maximum')
    expect(html).toContain('No proration')
    expect(html).toContain('No rounding')
  })

  it('describes rounding when it is on, because it changes the cost', () => {
    const rounded = brief({ settings: { ...SETTINGS, roundingIncrement: 500 } })
    expect(rounded).toContain('rounded to the nearest 500')
  })

  it('reports the median movement', () => {
    // 100,000 to 104,000 and 105,000 against a 100,000 midpoint: the median
    // moves from 1.00 to 1.04, which is four points.
    expect(html).toContain('+4.0 pts')
  })
})

describe('planBriefHtml - currency', () => {
  /**
   * The advisor's strings arrive already formatted with a symbol. A brief that
   * printed a bare 16000 beside the advisor's $546,075 would read as broken,
   * and a brief that looks broken is not one anybody forwards.
   */
  it('formats its own figures with a currency symbol', () => {
    expect(brief()).toContain('$16,000')
  })

  it('uses the scenario currency rather than assuming dollars', () => {
    const html = brief({
      settings: { ...SETTINGS, currency: 'GBP', locale: 'en-GB' },
    })
    expect(html).toContain('£16,000')
    expect(html).not.toContain('$16,000')
  })

  it('keeps the document when the currency code is unusable', () => {
    // A bad code should cost the symbol, not the page.
    const html = brief({ settings: { ...SETTINGS, currency: 'NOT-A-CODE' } })
    expect(html).toContain('16,000')
    expect(html).toContain('</html>')
  })
})

describe('planBriefHtml - findings', () => {
  const finding: Finding = {
    id: 'over-budget',
    severity: 'high',
    headline: 'This plan is over target',
    detail: 'It spends 4.00% against a 3.25% target.',
    supportingNumbers: [{ label: 'Variance', value: '+3,000' }],
    recommendedAction: 'Scale the matrix by 0.81.',
    actionCost: 'saves 3,000',
    cannotKnow: 'whether the budget is genuinely fixed.',
  }

  const html = brief({ findings: [finding] })

  it('carries the recommendation and its cost, not just the problem', () => {
    expect(html).toContain('This plan is over target')
    expect(html).toContain('Scale the matrix by 0.81.')
    expect(html).toContain('saves 3,000')
  })

  it('carries the arithmetic behind it', () => {
    expect(html).toContain('Variance: +3,000')
  })

  it('carries what the tool cannot know', () => {
    // The line that keeps prescriptive advice honest. If it survives everywhere
    // but the document people actually circulate, it may as well not exist.
    expect(html).toContain('whether the budget is genuinely fixed.')
  })

  it('leaves the section out entirely when there is nothing to raise', () => {
    expect(brief()).not.toContain('What to do about it')
  })
})

describe('planBriefHtml - escaping', () => {
  /**
   * A plan name is typed by the user and this file gets opened in a browser.
   * Nothing that reaches the document is trusted markup.
   */
  it('escapes a plan name that looks like markup', () => {
    const html = brief({ planName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes and ampersands', () => {
    const html = brief({ planName: `Sales & "Ops" plan` })
    expect(html).toContain('Sales &amp; &quot;Ops&quot; plan')
  })

  it('escapes markup inside a finding', () => {
    const html = brief({
      findings: [
        {
          id: 'x',
          severity: 'low',
          headline: '<img src=x onerror=alert(1)>',
          detail: 'detail',
          supportingNumbers: [],
          recommendedAction: 'action',
          actionCost: null,
          cannotKnow: 'nothing',
        },
      ],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

describe('briefFileName', () => {
  it('sorts chronologically and says what it holds', () => {
    expect(briefFileName('Plan A', new Date('2026-03-15T10:00:00Z'))).toBe(
      '2026-03-15-Plan-A-brief.html',
    )
  })

  it('strips anything that would be awkward in a filename', () => {
    expect(briefFileName('FY26 / Q1 — "final"', new Date('2026-03-15T10:00:00Z'))).toBe(
      '2026-03-15-FY26-Q1-final-brief.html',
    )
  })

  it('falls back to a name when there is nothing usable left', () => {
    expect(briefFileName('///', new Date('2026-03-15T10:00:00Z'))).toBe(
      '2026-03-15-merit-plan-brief.html',
    )
  })
})
