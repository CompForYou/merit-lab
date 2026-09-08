import type { MeritMatrix, ScenarioSettings } from '../types/domain'
import type { ColumnMapping } from './column-mapping'
import { readMatrix, readSettings } from './scenario-file'

/**
 * What survives closing the tab, and what deliberately does not.
 *
 * The tool's promise is that pay data never leaves the device and is gone when
 * the tab closes. That promise is the reason a comp team can adopt it without
 * asking anyone's permission, so it is not traded for convenience.
 *
 * But it was costing something real. A matrix design is forty minutes of work
 * and an accidental refresh destroyed it, which punishes exactly the repeated
 * use the tool wants. The population did not have that problem: it is one paste
 * away, and the source file is still in the user's downloads folder.
 *
 * So the two halves are treated differently, on that asymmetry:
 *
 * - **The design is remembered.** Matrix percentages, band boundaries, rating
 *   labels, target budget, over-maximum mode, rounding, currency, plan names.
 *   None of it is employee data. All of it is expensive to recreate.
 * - **The population is never written.** No salaries, no identifiers, no
 *   ratings, no attributes, not one row. Close the tab and the people are gone,
 *   exactly as before.
 *
 * Column mappings are remembered too, keyed by the header row they were made
 * for. Those are column positions and header names — the shape of an export,
 * not its contents — so the same HRIS extract maps itself correctly next cycle.
 *
 * `assertNoPopulation` below is what keeps that boundary honest as this file
 * changes, and it is tested against a real synthetic population.
 */

export const SESSION_MEMORY_KEY = 'merit-lab.design.v1'
export const SESSION_MEMORY_VERSION = 1

export interface RememberedPlan {
  name: string
  matrix: MeritMatrix
  settings: ScenarioSettings
}

export interface RememberedDesign {
  plans: [RememberedPlan, RememberedPlan]
  activePlan: 0 | 1
  /** Column mappings by header signature. Positions and header names only. */
  mappings: Record<string, ColumnMapping>
}

/**
 * Anything with a `getItem`/`setItem`/`removeItem` trio.
 *
 * Taken as a parameter rather than reached for directly so the boundary can be
 * tested without a browser, and so a storage that throws is handled in one
 * place. It does throw: a private window, a browser set to block site data, and
 * a thumbnail renderer all raise on access rather than returning null.
 */
export interface MemoryStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** The browser's own storage, or null wherever it cannot be reached. */
export function browserStore(): MemoryStore | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    // Touching it is the only reliable test: some browsers expose the object
    // and throw on use.
    const probe = `${SESSION_MEMORY_KEY}.probe`
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

/**
 * Container names that would mean a population had reached this payload.
 *
 * Checked on the serialized string rather than the object, so one nested
 * anywhere in the structure is caught rather than only a top-level one.
 *
 * Deliberately container names only. An earlier version of this list also
 * refused `baseSalary`, which is a legitimate *field name* in a column mapping —
 * there it holds a column index, not anyone's pay — so the guard fired on every
 * save that carried a mapping. A check crude enough to produce false positives
 * gets removed the first time it is inconvenient, which leaves nothing. These
 * five cannot appear in a matrix, in settings or in a mapping.
 *
 * The primary defence is not this list. It is that `saveDesign` builds its
 * payload from named fields, so an unexpected property cannot ride along. This
 * catches the case where one of those named fields is later widened.
 */
const FORBIDDEN_KEYS = ['employees', 'population', 'salaries', 'people', 'results']

/**
 * Refuse to store anything carrying employee data.
 *
 * A guard rather than a comment, because the failure it prevents is silent: a
 * future change that widens the stored shape would write salaries to disk and
 * nothing would look wrong. Throwing here turns that into a test failure.
 */
export function assertNoPopulation(json: string): void {
  for (const key of FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(
        `Refusing to store "${key}". Session memory holds plan design only; population data never goes to disk.`,
      )
    }
  }
}

/** Write the design. Silent on failure: a full or blocked store is not an error the user can act on. */
export function saveDesign(design: RememberedDesign, store: MemoryStore | null): void {
  if (!store) return
  try {
    const json = JSON.stringify({
      version: SESSION_MEMORY_VERSION,
      plans: design.plans.map((p) => ({
        name: p.name,
        matrix: p.matrix,
        settings: p.settings,
      })),
      activePlan: design.activePlan,
      mappings: design.mappings,
    })
    assertNoPopulation(json)
    store.setItem(SESSION_MEMORY_KEY, json)
  } catch {
    // Storage full, blocked, or the guard fired. Nothing is stored, the session
    // continues exactly as it did before this feature existed.
  }
}

/**
 * Read the design back, or null if there is nothing usable.
 *
 * Every field is validated with the same readers the scenario file uses, so a
 * stored blob from an older build cannot put a malformed matrix into the app.
 * Anything that fails validation is discarded whole rather than partially
 * applied: half a remembered design is harder to understand than none.
 */
export function loadDesign(store: MemoryStore | null): RememberedDesign | null {
  if (!store) return null

  let raw: unknown
  try {
    const text = store.getItem(SESSION_MEMORY_KEY)
    if (!text) return null
    raw = JSON.parse(text)
  } catch {
    return null
  }

  if (!isRecord(raw)) return null
  if (raw.version !== SESSION_MEMORY_VERSION) return null
  if (!Array.isArray(raw.plans) || raw.plans.length !== 2) return null

  const plans: RememberedPlan[] = []
  for (const entry of raw.plans) {
    if (!isRecord(entry)) return null
    const errors: string[] = []
    const warnings: string[] = []
    const matrix = readMatrix(entry.matrix, errors)
    const settings = readSettings(entry.settings, errors, warnings)
    if (errors.length > 0 || !matrix || !settings) return null
    plans.push({
      name: typeof entry.name === 'string' ? entry.name : 'Plan',
      matrix,
      settings,
    })
  }

  return {
    plans: [plans[0], plans[1]],
    activePlan: raw.activePlan === 1 ? 1 : 0,
    mappings: readMappings(raw.mappings),
  }
}

/** Forget everything. The user-facing undo for having remembered at all. */
export function clearDesign(store: MemoryStore | null): void {
  if (!store) return
  try {
    store.removeItem(SESSION_MEMORY_KEY)
  } catch {
    // Nothing to do and nothing to say.
  }
}

/**
 * Stored mappings, keeping only entries that still look like a mapping.
 *
 * A bad entry is dropped rather than failing the whole load: a mapping is a
 * convenience, and losing the remembered design because one stale key went
 * wrong would trade a large thing for a small one.
 */
function readMappings(value: unknown): Record<string, ColumnMapping> {
  if (!isRecord(value)) return {}
  const out: Record<string, ColumnMapping> = {}

  for (const [signature, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue
    const { columns, quality } = entry
    if (!isRecord(columns) || !isRecord(quality)) continue

    const validColumns = Object.values(columns).every(
      (v) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0),
    )
    if (!validColumns) continue

    out[signature] = entry as unknown as ColumnMapping
  }

  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
