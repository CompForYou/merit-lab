import { describe, it, expect } from 'vitest'
import { adviseOnScenario, type AdvisorContext, type Finding } from './advisor'
import { runScenario } from './run-scenario'
import { compareOverMaxModes } from './remediation'
import { scaleMatrix } from './matrix-edit'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'

const build = (
  employees: Employee[] = SAMPLE_POPULATION,
  grades: Grade[] = SAMPLE_GRADES,
  matrix: MeritMatrix = DEFAULT_MERIT_MATRIX,
  settings: ScenarioSettings = DEFAULT_SETTINGS,
): AdvisorContext => ({
  scenario: runScenario(employees, grades, matrix, settings),
  employees,
  grades,
  matrix,
  settings,
  modeOutcomes: compareOverMaxModes(employees, grades, matrix, settings, runScenario),
})

const advise = (...args: Parameters<typeof build>) => adviseOnScenario(build(...args))
const ids = (findings: Finding[]) => findings.map((f) => f.id)
const find = (findings: Finding[], id: string) => findings.find((f) => f.id === id)

describe('adviseOnScenario - the contract every finding must meet', () => {
  const findings = advise()

  it('produces findings for the default sample', () => {
    expect(findings.length).toBeGreaterThan(0)
  })

  it('gives every finding a headline, an action and its arithmetic', () => {
    for (const f of findings) {
      expect(f.headline.length, `${f.id} headline`).toBeGreaterThan(20)
      expect(f.detail.length, `${f.id} detail`).toBeGreaterThan(40)
      expect(f.recommendedAction.length, `${f.id} action`).toBeGreaterThan(30)
      expect(f.supportingNumbers.length, `${f.id} has no supporting numbers`)
        .toBeGreaterThan(0)
    }
  })

  it('states what it cannot know on every single finding', () => {
    // The rule that keeps prescriptive advice honest. A recommendation without
    // this is the tool claiming certainty it does not have.
    for (const f of findings) {
      expect(f.cannotKnow.length, `${f.id} does not say what it cannot know`)
        .toBeGreaterThan(30)
      expect(f.cannotKnow.trim().endsWith('.')).toBe(true)
    }
  })

  it('never emits a finding with an empty supporting value', () => {
    for (const f of findings) {
      for (const n of f.supportingNumbers) {
        expect(n.label.length, `${f.id} has an unlabelled number`).toBeGreaterThan(0)
        expect(String(n.value).length, `${f.id}: ${n.label} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('ranks worst first', () => {
    const rank = { high: 0, medium: 1, low: 2 }
    const order = findings.map((f) => rank[f.severity])
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('emits each rule at most once', () => {
    expect(new Set(ids(findings)).size).toBe(findings.length)
  })
})

describe('over and under budget', () => {
  it('fires over budget when the plan exceeds the target', () => {
    // The default matrix spends 3.35% against a 3.25% target.
    const f = find(advise(), 'over-budget')!
    expect(f).toBeDefined()
    expect(f.severity).toBe('high')
    expect(f.recommendedAction).toContain('Fit to budget')
    expect(f.actionCost).toContain('removes')
  })

  it('stays silent once the plan is fitted to the target', () => {
    const fitted = scaleMatrix(DEFAULT_MERIT_MATRIX, 0.970123)
    const findings = advise(SAMPLE_POPULATION, SAMPLE_GRADES, fitted)
    expect(ids(findings)).not.toContain('over-budget')
    expect(ids(findings)).not.toContain('under-budget')
  })

  it('fires under budget when the plan spends too little', () => {
    const small = scaleMatrix(DEFAULT_MERIT_MATRIX, 0.5)
    const f = find(advise(SAMPLE_POPULATION, SAMPLE_GRADES, small), 'under-budget')!
    expect(f).toBeDefined()
    expect(f.actionCost).toContain('already inside the approved budget')
  })

  it('stands down for under budget when the cap really is the reason', () => {
    // The matrix has already been scaled up to chase a 10% target, so most of
    // the remaining shortfall is money the range maximum will not absorb. A
    // more specific finding covers that, and two findings for one cause would
    // read as two problems.
    const findings = advise(
      SAMPLE_POPULATION,
      SAMPLE_GRADES,
      scaleMatrix(DEFAULT_MERIT_MATRIX, 2.985),
      { ...DEFAULT_SETTINGS, targetBudgetPercent: 0.1 },
    )
    expect(ids(findings)).toContain('cap-is-limiting')
    expect(ids(findings)).not.toContain('under-budget')
  })

  it('blames the matrix, not the cap, when the matrix is simply too small', () => {
    // At an unscaled matrix against a 10% target the shortfall is over a
    // million dollars and the cap withholds a few thousand of it. Pointing the
    // user at the range maximum here would send them to the wrong problem.
    const findings = advise(SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, {
      ...DEFAULT_SETTINGS,
      targetBudgetPercent: 0.1,
    })
    expect(ids(findings)).toContain('under-budget')
    expect(ids(findings)).not.toContain('cap-is-limiting')
  })
})

describe('the cap limiting the plan', () => {
  it('fires when the withheld money is a real share of the shortfall', () => {
    const f = find(
      advise(
        SAMPLE_POPULATION,
        SAMPLE_GRADES,
        scaleMatrix(DEFAULT_MERIT_MATRIX, 2.985),
        { ...DEFAULT_SETTINGS, targetBudgetPercent: 0.1 },
      ),
      'cap-is-limiting',
    )!
    expect(f.severity).toBe('high')
    expect(f.headline).toContain('withholding')
    expect(f.recommendedAction).toContain('lump sum')
    expect(f.actionCost).toContain('Lump sum mode costs')
  })

  it('stays silent when nothing is withheld', () => {
    const findings = advise(SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, {
      ...DEFAULT_SETTINGS,
      overMaxMode: 'allowOverMax',
    })
    expect(ids(findings)).not.toContain('cap-is-limiting')
  })
})

describe('green circles', () => {
  it('fires and prices the remedy', () => {
    const f = find(advise(), 'green-circles-remain')!
    expect(f).toBeDefined()
    expect(f.actionCost).toMatch(/Clearing all \d+ costs \$[\d,]+/)
    expect(f.recommendedAction).toContain('outside the merit budget')
  })

  it('stays silent when nobody is below minimum', () => {
    // Everyone at midpoint, so nobody can finish below the minimum.
    const atMidpoint: Employee[] = SAMPLE_GRADES.map((g, i) => ({
      id: `M${i}`,
      gradeId: g.id,
      baseSalary: g.mid,
      performanceRating: 'Meets',
      fte: 1,
      eligible: true,
    }))
    expect(ids(advise(atMidpoint))).not.toContain('green-circles-remain')
  })
})

describe('crossings into red circle', () => {
  it('fires only in allowOverMax, where the excess enters base', () => {
    const overMax = advise(SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, {
      ...DEFAULT_SETTINGS,
      overMaxMode: 'allowOverMax',
    })
    const f = find(overMax, 'crossings-into-red-circle')!
    expect(f).toBeDefined()
    expect(f.actionCost).toContain('less into base')

    // Capping produces no crossings at all, so the finding cannot apply.
    expect(ids(advise())).not.toContain('crossings-into-red-circle')
  })
})

describe('zero increases', () => {
  it('fires and breaks the count down by rating', () => {
    const f = find(advise(), 'zero-increases')!
    expect(f).toBeDefined()
    // The sample has a Below row paying nothing, by design.
    expect(f.supportingNumbers.some((n) => n.label === 'Below')).toBe(true)
  })

  it('stays silent when every eligible employee receives something', () => {
    const generous: MeritMatrix = {
      ...DEFAULT_MERIT_MATRIX,
      cells: Object.fromEntries(
        DEFAULT_MERIT_MATRIX.ratings.map((rating) => [
          rating,
          Object.fromEntries(DEFAULT_MERIT_MATRIX.bands.map((b) => [b.id, 0.02])),
        ]),
      ),
    }
    const findings = advise(SAMPLE_POPULATION, SAMPLE_GRADES, generous, {
      ...DEFAULT_SETTINGS,
      overMaxMode: 'allowOverMax',
    })
    expect(ids(findings)).not.toContain('zero-increases')
  })
})

describe('compression', () => {
  it('fires when a step narrows past the threshold', () => {
    // Pay the low compa-ratio bands hard: junior grades live there, so the
    // differential to the grade above them collapses.
    const skewed: MeritMatrix = {
      ...DEFAULT_MERIT_MATRIX,
      cells: Object.fromEntries(
        DEFAULT_MERIT_MATRIX.ratings.map((rating) => [
          rating,
          {
            'band-below-080': 0.25,
            'band-080-090': 0.2,
            'band-090-100': 0.15,
            'band-100-110': 0,
            'band-above-110': 0,
          },
        ]),
      ),
    }
    const f = find(
      advise(SAMPLE_POPULATION, SAMPLE_GRADES, skewed, {
        ...DEFAULT_SETTINGS,
        overMaxMode: 'allowOverMax',
      }),
      'compression-flagged',
    )!
    expect(f).toBeDefined()
    expect(f.headline).toContain('narrow')
    expect(f.cannotKnow).toContain('tenure')
  })

  it('stays silent on the default plan, which flags nothing', () => {
    expect(ids(advise())).not.toContain('compression-flagged')
  })
})

describe('structure problems', () => {
  it('fires on a negative progression and calls it high severity', () => {
    const inverted: Grade[] = [
      { id: 'A', name: 'Lower', order: 1, min: 80_000, mid: 100_000, max: 120_000 },
      { id: 'B', name: 'Higher', order: 2, min: 76_000, mid: 95_000, max: 114_000 },
    ]
    const people: Employee[] = inverted.flatMap((g) =>
      Array.from({ length: 5 }, (_, i) => ({
        id: `${g.id}${i}`,
        gradeId: g.id,
        baseSalary: g.mid,
        performanceRating: 'Meets',
        fte: 1,
        eligible: true,
      })),
    )
    const f = find(advise(people, inverted), 'structure-problems')!
    expect(f.severity).toBe('high')
    expect(f.detail).toContain('lower midpoint')
    expect(f.recommendedAction).toContain('before running the cycle')
  })

  it('fires on a gap that leaves salaries in no grade', () => {
    const gapped: Grade[] = [
      { id: 'A', name: 'Lower', order: 1, min: 50_000, mid: 55_000, max: 60_000 },
      { id: 'B', name: 'Higher', order: 2, min: 90_000, mid: 100_000, max: 110_000 },
    ]
    const people: Employee[] = gapped.map((g, i) => ({
      id: `E${i}`,
      gradeId: g.id,
      baseSalary: g.mid,
      performanceRating: 'Meets',
      fte: 1,
      eligible: true,
    }))
    const f = find(advise(people, gapped), 'structure-problems')!
    expect(f.detail).toContain('fall in no grade at all')
  })

  it('stays silent on the sample structure, which is sound', () => {
    expect(ids(advise())).not.toContain('structure-problems')
  })
})

describe('employees that could not be costed', () => {
  it('fires first, because everything else is computed without them', () => {
    const broken = [
      ...SAMPLE_POPULATION.slice(0, 20),
      { ...SAMPLE_POPULATION[0], id: 'ORPHAN', gradeId: 'NOPE' },
    ]
    const findings = advise(broken)
    const f = find(findings, 'employees-not-costed')!
    expect(f.severity).toBe('high')
    expect(f.detail).toContain('smaller population')
    expect(findings[0].severity).toBe('high')
  })

  it('stays silent when every employee is costed', () => {
    expect(ids(advise())).not.toContain('employees-not-costed')
  })
})

describe('lagging grade', () => {
  it('fires on a grade sitting below midpoint and projects the recovery', () => {
    const grade: Grade = {
      id: 'G1', name: 'Analyst', order: 1, min: 70_000, mid: 100_000, max: 130_000,
    }
    const behind: Employee[] = Array.from({ length: 10 }, (_, i) => ({
      id: `L${i}`,
      gradeId: 'G1',
      baseSalary: 85_000,
      performanceRating: 'Meets',
      fte: 1,
      eligible: true,
    }))
    const f = find(advise(behind, [grade]), 'lagging-grade')!
    expect(f).toBeDefined()
    expect(f.headline).toContain('median compa-ratio')
    expect(f.supportingNumbers.some((n) => n.label === 'Cycles to midpoint')).toBe(true)
  })

  it('ignores grades too small to have a stable median', () => {
    const grade: Grade = {
      id: 'G1', name: 'Analyst', order: 1, min: 70_000, mid: 100_000, max: 130_000,
    }
    const tiny: Employee[] = Array.from({ length: 3 }, (_, i) => ({
      id: `T${i}`,
      gradeId: 'G1',
      baseSalary: 80_000,
      performanceRating: 'Meets',
      fte: 1,
      eligible: true,
    }))
    expect(ids(advise(tiny, [grade]))).not.toContain('lagging-grade')
  })
})
