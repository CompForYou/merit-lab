import type {
  CompaRatioBand,
  Employee,
  Grade,
  MeritMatrix,
  OverMaxMode,
  Scenario,
  ScenarioSettings,
} from '../types/domain'

/**
 * Bumped only when the shape changes in a way older files cannot satisfy. A file
 * from a newer version is refused rather than half-read: silently ignoring
 * fields it does not understand would load a scenario that is not the one the
 * user saved.
 *
 * Version 2 added rounding, currency and locale. A version 1 file still loads:
 * those fields arrive absent and fall back to defaults that reproduce version 1
 * behaviour exactly.
 */
export const SCENARIO_FILE_VERSION = 2

const FORMAT_TAG = 'merit-lab-scenario'

export interface ScenarioFile {
  format: typeof FORMAT_TAG
  version: number
  savedAt: string
  scenario: Scenario
}

export interface ScenarioParseResult {
  scenario: Scenario | null
  errors: string[]
  warnings: string[]
}

/**
 * Write a scenario out as JSON.
 *
 * Contains the population: real salaries, real ids. It is written to the user's
 * own disk and travels nowhere else, which is the whole privacy design, but the
 * interface has to say so plainly before anyone emails one around.
 */
export function serializeScenario(scenario: Scenario, savedAt = new Date()): string {
  const file: ScenarioFile = {
    format: FORMAT_TAG,
    version: SCENARIO_FILE_VERSION,
    savedAt: savedAt.toISOString(),
    scenario,
  }
  return JSON.stringify(file, null, 2)
}

/**
 * Read a scenario file back.
 *
 * Every field is checked rather than trusted. A scenario file is ordinary text
 * on a user's disk: it can be hand-edited, truncated, or be an entirely
 * different file that happens to end in .json, and loading a malformed one
 * silently would produce a budget built on nonsense.
 */
export function parseScenarioFile(text: string): ScenarioParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      scenario: null,
      errors: ['This is not a valid scenario file: the text is not JSON.'],
      warnings,
    }
  }

  if (!isRecord(raw)) {
    return { scenario: null, errors: ['This file does not contain a scenario.'], warnings }
  }
  if (raw.format !== FORMAT_TAG) {
    return {
      scenario: null,
      errors: ['This is not a Merit Lab scenario file.'],
      warnings,
    }
  }

  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version > SCENARIO_FILE_VERSION) {
    return {
      scenario: null,
      errors: [
        `This scenario was saved by a newer version of Merit Lab (file version ${version}, this version reads ${SCENARIO_FILE_VERSION}).`,
      ],
      warnings,
    }
  }

  const body = raw.scenario
  if (!isRecord(body)) {
    return { scenario: null, errors: ['The scenario is missing from this file.'], warnings }
  }

  const grades = readGrades(body.grades, errors)
  const employees = readEmployees(body.employees, errors)
  const matrix = readMatrix(body.matrix, errors)
  const settings = readSettings(body.settings, errors, warnings)

  if (errors.length > 0) return { scenario: null, errors, warnings }

  const gradeIds = new Set(grades!.map((g) => g.id))
  const orphaned = employees!.filter((e) => !gradeIds.has(e.gradeId))
  if (orphaned.length > 0) {
    warnings.push(
      `${orphaned.length} ${orphaned.length === 1 ? 'employee references a grade' : 'employees reference grades'} that are not in this file's structure. They will not be costed.`,
    )
  }

  return {
    scenario: {
      name: typeof body.name === 'string' ? body.name : 'Untitled scenario',
      employees: employees!,
      grades: grades!,
      matrix: matrix!,
      settings: settings!,
    },
    errors,
    warnings,
  }
}

/** A filename that sorts chronologically and says what it holds. */
export function scenarioFileName(name: string, savedAt = new Date()): string {
  const stamp = savedAt.toISOString().slice(0, 10)
  const safe =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'scenario'
  return `merit-lab-${safe}-${stamp}.json`
}

function readGrades(value: unknown, errors: string[]): Grade[] | null {
  if (!Array.isArray(value)) {
    errors.push('The salary structure is missing or is not a list of grades.')
    return null
  }
  const grades: Grade[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`Grade ${index + 1} is not readable.`)
      return null
    }
    const id = str(item.id)
    const min = num(item.min)
    const mid = num(item.mid)
    const max = num(item.max)
    if (id === null || min === null || mid === null || max === null) {
      errors.push(`Grade ${index + 1} is missing a code or a range point.`)
      return null
    }
    grades.push({
      id,
      name: str(item.name) ?? id,
      order: num(item.order) ?? index + 1,
      min,
      mid,
      max,
    })
  }
  if (grades.length === 0) errors.push('The scenario contains no grades.')
  return grades
}

function readEmployees(value: unknown, errors: string[]): Employee[] | null {
  if (!Array.isArray(value)) {
    errors.push('The population is missing or is not a list of employees.')
    return null
  }
  const employees: Employee[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`Employee ${index + 1} is not readable.`)
      return null
    }
    const id = str(item.id)
    const gradeId = str(item.gradeId)
    const baseSalary = num(item.baseSalary)
    const performanceRating = str(item.performanceRating)
    if (id === null || gradeId === null || baseSalary === null || performanceRating === null) {
      errors.push(`Employee ${index + 1} is missing a required field.`)
      return null
    }
    employees.push({
      id,
      gradeId,
      baseSalary,
      performanceRating,
      fte: num(item.fte) ?? 1,
      eligible: typeof item.eligible === 'boolean' ? item.eligible : true,
      hireDate: str(item.hireDate) ?? undefined,
      attributes: isRecord(item.attributes)
        ? Object.fromEntries(
            Object.entries(item.attributes).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    })
  }
  return employees
}

/** Exported so session memory validates a stored matrix with this same reader. */
export function readMatrix(value: unknown, errors: string[]): MeritMatrix | null {
  if (!isRecord(value)) {
    errors.push('The merit matrix is missing.')
    return null
  }
  const ratings = Array.isArray(value.ratings)
    ? value.ratings.filter((r): r is string => typeof r === 'string')
    : null
  if (!ratings || ratings.length === 0) {
    errors.push('The merit matrix has no rating rows.')
    return null
  }

  if (!Array.isArray(value.bands) || value.bands.length === 0) {
    errors.push('The merit matrix has no compa-ratio bands.')
    return null
  }
  const bands: CompaRatioBand[] = []
  for (const [index, item] of value.bands.entries()) {
    if (!isRecord(item)) {
      errors.push(`Band ${index + 1} is not readable.`)
      return null
    }
    const id = str(item.id)
    if (id === null) {
      errors.push(`Band ${index + 1} has no identifier.`)
      return null
    }
    bands.push({
      id,
      label: str(item.label) ?? id,
      lowerBound: item.lowerBound === null ? null : num(item.lowerBound),
      upperBound: item.upperBound === null ? null : num(item.upperBound),
    })
  }

  const cells: MeritMatrix['cells'] = {}
  const rawCells = isRecord(value.cells) ? value.cells : {}
  for (const rating of ratings) {
    const row = isRecord(rawCells[rating]) ? rawCells[rating] : {}
    cells[rating] = {}
    for (const band of bands) {
      cells[rating][band.id] = num(row[band.id]) ?? 0
    }
  }

  return { ratings, bands, cells }
}

const OVER_MAX_MODES: OverMaxMode[] = ['capAtMax', 'allowOverMax', 'lumpSum']

/** Exported so session memory validates stored settings with this same reader. */
export function readSettings(
  value: unknown,
  errors: string[],
  warnings: string[],
): ScenarioSettings | null {
  if (!isRecord(value)) {
    errors.push('The plan settings are missing.')
    return null
  }

  const mode = str(value.overMaxMode)
  const overMaxMode =
    mode !== null && (OVER_MAX_MODES as string[]).includes(mode)
      ? (mode as OverMaxMode)
      : 'capAtMax'
  if (mode !== null && overMaxMode !== mode) {
    warnings.push(
      `Over-maximum mode "${mode}" is not recognised. Falling back to capping at the maximum.`,
    )
  }

  return {
    targetBudgetPercent: num(value.targetBudgetPercent) ?? 0.0325,
    overMaxMode,
    prorationEnabled: value.prorationEnabled === true,
    meritEffectiveDate: str(value.meritEffectiveDate) ?? undefined,
    compressionThreshold: num(value.compressionThreshold) ?? 0.02,
    // Absent in a version 1 file. Zero means no rounding, which is what a
    // version 1 scenario did, so an old file reloads to the same figures.
    roundingIncrement: num(value.roundingIncrement) ?? 0,
    currency: str(value.currency) ?? 'USD',
    locale: str(value.locale) ?? 'en-US',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
