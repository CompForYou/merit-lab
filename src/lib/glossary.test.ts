import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GLOSSARY, TERM_IDS, lookupTerm, type TermId } from './glossary'

/** Every .tsx under src, so the scan cannot miss a newly added component. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, found)
    else if (full.endsWith('.tsx')) found.push(full)
  }
  return found
}

const FILES = sourceFiles('src')
const SOURCE = FILES.map((f) => readFileSync(f, 'utf8')).join('\n')

/** Every `term="..."` passed to <Explain>, across the whole interface. */
const referenced = [...SOURCE.matchAll(/term="([a-z0-9-]+)"/g)].map((m) => m[1])

describe('glossary - the interface and the definitions agree', () => {
  it('finds explainers in the source at all', () => {
    // Guards the guard: if the scan silently matched nothing, every assertion
    // below would pass vacuously.
    expect(FILES.length).toBeGreaterThan(5)
    expect(referenced.length).toBeGreaterThan(10)
  })

  it('defines every term the interface points at', () => {
    // A question mark that opens an empty popover is worse than no question
    // mark: it promises an explanation and gives none.
    const missing = [...new Set(referenced)].filter((id) => !(id in GLOSSARY))
    expect(missing).toEqual([])
  })

  it('uses every term it defines', () => {
    // An unused entry is a definition nobody can reach, which drifts out of
    // date silently because nothing on screen contradicts it.
    const used = new Set(referenced)
    const orphaned = TERM_IDS.filter((id) => !used.has(id))
    expect(orphaned).toEqual([])
  })
})

describe('glossary - every entry is usable', () => {
  it('gives every term a display name and a definition', () => {
    for (const id of TERM_IDS) {
      const entry = lookupTerm(id)
      expect(entry.term.length, `${id} has no display name`).toBeGreaterThan(0)
      expect(entry.definition.length, `${id} has no definition`).toBeGreaterThan(20)
    }
  })

  it('writes definitions in plain sentences', () => {
    for (const id of TERM_IDS) {
      const { definition } = lookupTerm(id)
      expect(definition.trim().endsWith('.'), `${id} definition is not a sentence`).toBe(
        true,
      )
    }
  })

  it('gives a formula to the terms that are arithmetic', () => {
    // These are the ones a reviewer will want to check against their own
    // definition, so a prose description alone is not enough.
    const mustHaveFormula: TermId[] = [
      'compa-ratio',
      'range-penetration',
      'range-spread',
      'midpoint-progression',
      'total-spend',
      'variance',
      'withheld-at-maximum',
      'proration',
      'compression-differential',
      'fit-to-budget',
    ]
    for (const id of mustHaveFormula) {
      expect(lookupTerm(id).formula, `${id} should show its formula`).toBeTruthy()
    }
  })

  it('states the assumption wherever practice varies between plans', () => {
    // The whole point of the explainers: a user whose plan works differently
    // needs to see where Merit Lab diverges from what they expected.
    const mustStateAssumption: TermId[] = [
      'compa-ratio',
      'compa-ratio-band',
      'eligible-payroll',
      'over-max-modes',
      'proration',
      'green-circled',
      'red-circled',
      'fte-handling',
      'not-costed',
    ]
    for (const id of mustStateAssumption) {
      expect(
        lookupTerm(id).assumption,
        `${id} should state what Merit Lab assumes`,
      ).toBeTruthy()
    }
  })

  it('describes compa-ratio as a decimal, not a percentage', () => {
    // A recurring source of confusion, and the one term most likely to be read
    // wrong by someone whose own reporting expresses it as a percent.
    expect(lookupTerm('compa-ratio').definition.toLowerCase()).toContain('decimal')
  })

  it('says that lower-bound-inclusive is how bands are assigned', () => {
    expect(lookupTerm('compa-ratio-band').assumption).toContain('inclusive at the lower')
  })
})
