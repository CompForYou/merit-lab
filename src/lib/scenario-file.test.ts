import { describe, it, expect } from 'vitest'
import {
  serializeScenario,
  parseScenarioFile,
  scenarioFileName,
  SCENARIO_FILE_VERSION,
} from './scenario-file'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import { runScenario } from './run-scenario'
import type { Scenario } from '../types/domain'

const SCENARIO: Scenario = {
  name: 'Annual cycle',
  employees: SAMPLE_POPULATION,
  grades: SAMPLE_GRADES,
  matrix: DEFAULT_MERIT_MATRIX,
  settings: DEFAULT_SETTINGS,
}

describe('serializeScenario and parseScenarioFile - the round trip', () => {
  const parsed = parseScenarioFile(serializeScenario(SCENARIO))

  it('reads back without error', () => {
    expect(parsed.errors).toEqual([])
    expect(parsed.scenario).not.toBeNull()
  })

  it('returns the same scenario it was given', () => {
    expect(parsed.scenario).toEqual(SCENARIO)
  })

  it('produces identical numbers when re-run', () => {
    // The only test of a file format that matters: does the reloaded scenario
    // cost the same as the one that was saved.
    const original = runScenario(
      SCENARIO.employees, SCENARIO.grades, SCENARIO.matrix, SCENARIO.settings,
    ).budget
    const reloaded = runScenario(
      parsed.scenario!.employees,
      parsed.scenario!.grades,
      parsed.scenario!.matrix,
      parsed.scenario!.settings,
    ).budget

    expect(reloaded.totalSpend).toBe(original.totalSpend)
    expect(reloaded.budgetSpendPercent).toBe(original.budgetSpendPercent)
    expect(reloaded.eligiblePayroll).toBe(original.eligiblePayroll)
    expect(reloaded.reducedByCap).toBe(original.reducedByCap)
  })

  it('preserves grouping attributes', () => {
    expect(parsed.scenario!.employees[0].attributes).toEqual(
      SCENARIO.employees[0].attributes,
    )
  })

  it('stamps the format, version and save time', () => {
    const file = JSON.parse(serializeScenario(SCENARIO, new Date('2025-03-01T09:00:00Z')))
    expect(file.format).toBe('merit-lab-scenario')
    expect(file.version).toBe(SCENARIO_FILE_VERSION)
    expect(file.savedAt).toBe('2025-03-01T09:00:00.000Z')
  })
})

describe('parseScenarioFile - refusing what it cannot trust', () => {
  it('rejects text that is not JSON', () => {
    const r = parseScenarioFile('this is not a scenario')
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('not JSON')
  })

  it('rejects JSON that is not a Merit Lab file', () => {
    const r = parseScenarioFile('{"hello":"world"}')
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('not a Merit Lab scenario file')
  })

  it('rejects a file from a newer version rather than half-reading it', () => {
    // Ignoring fields it does not understand would load a scenario that is not
    // the one the user saved, and cost it anyway.
    const future = JSON.stringify({
      format: 'merit-lab-scenario',
      version: SCENARIO_FILE_VERSION + 1,
      savedAt: new Date().toISOString(),
      scenario: SCENARIO,
    })
    const r = parseScenarioFile(future)
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('newer version')
  })

  it('rejects a file with no grades', () => {
    const r = parseScenarioFile(
      serializeScenario({ ...SCENARIO, grades: [] }),
    )
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('no grades')
  })

  it('rejects a grade missing a range point', () => {
    const broken = JSON.parse(serializeScenario(SCENARIO))
    delete broken.scenario.grades[2].max
    const r = parseScenarioFile(JSON.stringify(broken))
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('missing a code or a range point')
  })

  it('rejects an employee missing a required field', () => {
    const broken = JSON.parse(serializeScenario(SCENARIO))
    delete broken.scenario.employees[5].baseSalary
    const r = parseScenarioFile(JSON.stringify(broken))
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('missing a required field')
  })

  it('rejects a matrix with no rating rows', () => {
    const broken = JSON.parse(serializeScenario(SCENARIO))
    broken.scenario.matrix.ratings = []
    const r = parseScenarioFile(JSON.stringify(broken))
    expect(r.scenario).toBeNull()
    expect(r.errors[0]).toContain('no rating rows')
  })
})

describe('parseScenarioFile - repairing what it safely can', () => {
  it('fills a missing matrix cell with zero', () => {
    const patched = JSON.parse(serializeScenario(SCENARIO))
    delete patched.scenario.matrix.cells.Meets['band-090-100']
    const r = parseScenarioFile(JSON.stringify(patched))
    expect(r.scenario!.matrix.cells.Meets['band-090-100']).toBe(0)
  })

  it('falls back to capping when the over-maximum mode is unrecognised', () => {
    const patched = JSON.parse(serializeScenario(SCENARIO))
    patched.scenario.settings.overMaxMode = 'somethingElse'
    const r = parseScenarioFile(JSON.stringify(patched))
    expect(r.scenario!.settings.overMaxMode).toBe('capAtMax')
    expect(r.warnings[0]).toContain('not recognised')
  })

  it('warns when employees reference grades the file does not contain', () => {
    const patched = JSON.parse(serializeScenario(SCENARIO))
    patched.scenario.employees[0].gradeId = 'GX'
    patched.scenario.employees[1].gradeId = 'GX'
    const r = parseScenarioFile(JSON.stringify(patched))
    expect(r.scenario).not.toBeNull()
    expect(r.warnings.some((w) => w.includes('2 employees reference grades'))).toBe(true)
  })

  it('defaults an absent FTE to full time and absent eligibility to eligible', () => {
    const patched = JSON.parse(serializeScenario(SCENARIO))
    delete patched.scenario.employees[0].fte
    delete patched.scenario.employees[0].eligible
    const r = parseScenarioFile(JSON.stringify(patched))
    expect(r.scenario!.employees[0].fte).toBe(1)
    expect(r.scenario!.employees[0].eligible).toBe(true)
  })
})

describe('scenarioFileName', () => {
  it('builds a dated, sortable filename', () => {
    expect(scenarioFileName('Annual cycle', new Date('2025-03-01T09:00:00Z'))).toBe(
      'merit-lab-annual-cycle-2025-03-01.json',
    )
  })

  it('strips characters a filesystem would object to', () => {
    expect(scenarioFileName('FY26 / Plan "A"', new Date('2025-03-01T00:00:00Z'))).toBe(
      'merit-lab-fy26-plan-a-2025-03-01.json',
    )
  })

  it('falls back when the name is empty', () => {
    expect(scenarioFileName('   ', new Date('2025-03-01T00:00:00Z'))).toBe(
      'merit-lab-scenario-2025-03-01.json',
    )
  })
})
