import { describe, it, expect } from 'vitest'
import {
  saveDesign,
  loadDesign,
  clearDesign,
  assertNoPopulation,
  SESSION_MEMORY_KEY,
  type MemoryStore,
  type RememberedDesign,
} from './session-memory'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { proposeMapping } from './column-mapping'

function fakeStore(): MemoryStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const design = (): RememberedDesign => ({
  plans: [
    { name: 'Plan A', matrix: DEFAULT_MERIT_MATRIX, settings: DEFAULT_SETTINGS },
    { name: 'Plan B', matrix: DEFAULT_MERIT_MATRIX, settings: DEFAULT_SETTINGS },
  ],
  activePlan: 0,
  mappings: {},
})

describe('session memory - what it keeps', () => {
  it('returns the design it was given', () => {
    const store = fakeStore()
    saveDesign(design(), store)
    const back = loadDesign(store)

    expect(back?.plans[0].name).toBe('Plan A')
    expect(back?.plans[0].matrix.ratings).toEqual(DEFAULT_MERIT_MATRIX.ratings)
    expect(back?.plans[0].settings.targetBudgetPercent).toBe(
      DEFAULT_SETTINGS.targetBudgetPercent,
    )
  })

  it('keeps an edited percentage exactly', () => {
    const store = fakeStore()
    const edited = design()
    edited.plans[0].settings = { ...DEFAULT_SETTINGS, targetBudgetPercent: 0.0375 }
    saveDesign(edited, store)

    // 3.75% stored as the decimal 0.0375, unrounded, as everything here is.
    expect(loadDesign(store)?.plans[0].settings.targetBudgetPercent).toBe(0.0375)
  })

  it('remembers which plan was active', () => {
    const store = fakeStore()
    saveDesign({ ...design(), activePlan: 1 }, store)
    expect(loadDesign(store)?.activePlan).toBe(1)
  })

  it('remembers a column mapping against its header row', () => {
    const store = fakeStore()
    const headers = ['Worker ID', 'Position_Grade_Cd', 'Curr_Ann_Base_Amt', 'Perf_Result']
    const signature = headers.join('|')
    saveDesign(
      { ...design(), mappings: { [signature]: proposeMapping(headers) } },
      store,
    )
    expect(loadDesign(store)?.mappings[signature].columns.id).toBe(0)
  })
})

describe('session memory - what it refuses to keep', () => {
  /**
   * The boundary this whole module exists to hold. If a future change widens
   * the stored shape to carry the population, this fails rather than quietly
   * writing salaries to the user's disk.
   */
  it('writes no part of the population to the store', () => {
    const store = fakeStore()
    saveDesign(design(), store)
    const written = store.data.get(SESSION_MEMORY_KEY) ?? ''

    expect(written).not.toBe('')

    const person = SAMPLE_POPULATION[0]
    expect(written).not.toContain(person.id)
    expect(written).not.toContain(String(person.baseSalary))

    // And nobody else either, not just the first row.
    for (const employee of SAMPLE_POPULATION) {
      expect(written.includes(employee.id)).toBe(false)
    }
  })

  it('throws rather than storing a payload carrying a population', () => {
    expect(() => assertNoPopulation('{"employees":[{"id":"E1"}]}')).toThrow(
      /never goes to disk/,
    )
    expect(() => assertNoPopulation('{"plans":[],"population":[]}')).toThrow()
    expect(() => assertNoPopulation('{"results":[{"employeeId":"E1"}]}')).toThrow()
  })

  it('allows a column mapping, whose fields are named after the data they point at', () => {
    // A mapping carries a key called baseSalary holding a column index. Guarding
    // on that name refuses every legitimate save, which is how a safety check
    // ends up deleted. The names it refuses are container names only.
    const mapping = JSON.stringify({ mappings: { h: proposeMapping(['id', 'salary']) } })
    expect(mapping).toContain('"baseSalary"')
    expect(() => assertNoPopulation(mapping)).not.toThrow()
  })

  it('drops an unexpected property rather than storing it', () => {
    // The primary defence: the payload is built from named fields, so a design
    // that has grown a population by mistake stores without it.
    const store = fakeStore()
    const smuggled = {
      ...design(),
      employees: [{ id: 'E1', baseSalary: 95_000 }],
    } as unknown as RememberedDesign

    saveDesign(smuggled, store)
    const written = store.data.get(SESSION_MEMORY_KEY) ?? ''
    expect(written).not.toContain('E1')
    expect(written).not.toContain('95000')
    expect(loadDesign(store)?.plans[0].name).toBe('Plan A')
  })

  it('stores nothing when a named field has been widened to carry a population', () => {
    // The case the guard is actually for: settings is stored as given, so if it
    // ever grew a population the explicit construction would not catch it.
    const store = fakeStore()
    const widened = design()
    widened.plans[0].settings = {
      ...DEFAULT_SETTINGS,
      population: [{ id: 'E1' }],
    } as never

    saveDesign(widened, store)
    expect(store.data.has(SESSION_MEMORY_KEY)).toBe(false)
  })
})

describe('session memory - reading something unusable', () => {
  it('returns null when there is nothing stored', () => {
    expect(loadDesign(fakeStore())).toBeNull()
  })

  it('returns null for text that is not JSON', () => {
    const store = fakeStore()
    store.setItem(SESSION_MEMORY_KEY, 'not json at all')
    expect(loadDesign(store)).toBeNull()
  })

  it('returns null for a version it does not read', () => {
    const store = fakeStore()
    store.setItem(SESSION_MEMORY_KEY, JSON.stringify({ version: 99, plans: [] }))
    expect(loadDesign(store)).toBeNull()
  })

  it('returns null when a stored matrix is malformed', () => {
    // Discarded whole rather than partly applied: half a remembered design is
    // harder to understand than none.
    const store = fakeStore()
    store.setItem(
      SESSION_MEMORY_KEY,
      JSON.stringify({
        version: 1,
        plans: [
          { name: 'A', matrix: { ratings: 'not an array' }, settings: DEFAULT_SETTINGS },
          { name: 'B', matrix: DEFAULT_MERIT_MATRIX, settings: DEFAULT_SETTINGS },
        ],
        activePlan: 0,
        mappings: {},
      }),
    )
    expect(loadDesign(store)).toBeNull()
  })

  it('drops a bad mapping without losing the design', () => {
    const store = fakeStore()
    saveDesign(
      {
        ...design(),
        mappings: {
          good: proposeMapping(['id', 'grade', 'salary', 'rating']),
          bad: { columns: { id: 'zero' }, quality: {} } as never,
        },
      },
      store,
    )

    const back = loadDesign(store)
    expect(back).not.toBeNull()
    expect(back?.mappings.good.columns.id).toBe(0)
    expect(back?.mappings.bad).toBeUndefined()
  })
})

describe('session memory - a store that will not cooperate', () => {
  const hostile: MemoryStore = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('quota exceeded')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }

  it('saves without throwing', () => {
    expect(() => saveDesign(design(), hostile)).not.toThrow()
  })

  it('loads as null without throwing', () => {
    expect(() => loadDesign(hostile)).not.toThrow()
    expect(loadDesign(hostile)).toBeNull()
  })

  it('clears without throwing', () => {
    expect(() => clearDesign(hostile)).not.toThrow()
  })

  it('does nothing at all when there is no store', () => {
    expect(loadDesign(null)).toBeNull()
    expect(() => saveDesign(design(), null)).not.toThrow()
    expect(() => clearDesign(null)).not.toThrow()
  })
})

describe('clearDesign', () => {
  it('removes what was stored', () => {
    const store = fakeStore()
    saveDesign(design(), store)
    expect(store.data.has(SESSION_MEMORY_KEY)).toBe(true)

    clearDesign(store)
    expect(store.data.has(SESSION_MEMORY_KEY)).toBe(false)
    expect(loadDesign(store)).toBeNull()
  })
})
