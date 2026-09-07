import { describe, it, expect } from 'vitest'
import {
  setMatrixCell,
  addRatingRow,
  removeRatingRow,
  renameRatingRow,
  setBandBoundary,
  splitBand,
  removeBand,
  scaleMatrix,
  readMatrixCell,
} from './matrix-edit'
import { assignCompaRatioBand, DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type { MeritMatrix } from '../types/domain'

const MATRIX: MeritMatrix = {
  ratings: ['Exceeds', 'Meets'],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    Exceeds: {
      'band-below-080': 0.06,
      'band-080-090': 0.05,
      'band-090-100': 0.045,
      'band-100-110': 0.04,
      'band-above-110': 0.02,
    },
    Meets: {
      'band-below-080': 0.04,
      'band-080-090': 0.035,
      'band-090-100': 0.03,
      'band-100-110': 0.025,
      'band-above-110': 0.01,
    },
  },
}

/** Every compa-ratio must fall in exactly one band, or employees drop out of costing. */
const coversEveryCompaRatio = (matrix: MeritMatrix) => {
  for (let cr = 0.4; cr <= 1.8; cr += 0.01) {
    if (assignCompaRatioBand(cr, matrix.bands) === null) return false
  }
  return true
}

describe('setMatrixCell', () => {
  it('sets one cell', () => {
    const next = setMatrixCell(MATRIX, 'Meets', 'band-090-100', 0.035)
    expect(readMatrixCell(next, 'Meets', 'band-090-100')).toBe(0.035)
  })

  it('leaves every other cell alone', () => {
    const next = setMatrixCell(MATRIX, 'Meets', 'band-090-100', 0.035)
    expect(readMatrixCell(next, 'Meets', 'band-080-090')).toBe(0.035)
    expect(readMatrixCell(next, 'Exceeds', 'band-090-100')).toBe(0.045)
  })

  it('does not modify the matrix it was given', () => {
    setMatrixCell(MATRIX, 'Meets', 'band-090-100', 0.99)
    expect(readMatrixCell(MATRIX, 'Meets', 'band-090-100')).toBe(0.03)
  })
})

describe('readMatrixCell', () => {
  it('treats an absent cell as zero', () => {
    expect(readMatrixCell(MATRIX, 'Nonexistent', 'band-090-100')).toBe(0)
  })
})

describe('addRatingRow', () => {
  it('appends a rating', () => {
    const next = addRatingRow(MATRIX, 'Developing')
    expect(next.ratings).toEqual(['Exceeds', 'Meets', 'Developing'])
  })

  it('inserts at a position when asked', () => {
    const next = addRatingRow(MATRIX, 'Strong', 1)
    expect(next.ratings).toEqual(['Exceeds', 'Strong', 'Meets'])
  })

  it('starts every new cell at zero rather than absent', () => {
    // An absent cell excludes its employees from costing entirely, which is
    // right for a rating never configured and wrong for one just created.
    const next = addRatingRow(MATRIX, 'Developing')
    for (const band of next.bands) {
      expect(next.cells.Developing[band.id]).toBe(0)
    }
  })

  it('ignores a rating that already exists', () => {
    expect(addRatingRow(MATRIX, 'Meets')).toBe(MATRIX)
  })
})

describe('removeRatingRow', () => {
  it('removes the rating and its cells', () => {
    const next = removeRatingRow(MATRIX, 'Meets')
    expect(next.ratings).toEqual(['Exceeds'])
    expect(next.cells.Meets).toBeUndefined()
  })

  it('does not modify the original', () => {
    removeRatingRow(MATRIX, 'Meets')
    expect(MATRIX.ratings).toContain('Meets')
  })
})

describe('renameRatingRow', () => {
  it('keeps the cells and the position', () => {
    const next = renameRatingRow(MATRIX, 'Meets', 'Achieves')
    expect(next.ratings).toEqual(['Exceeds', 'Achieves'])
    expect(readMatrixCell(next, 'Achieves', 'band-090-100')).toBe(0.03)
    expect(next.cells.Meets).toBeUndefined()
  })

  it('refuses to collide with an existing rating', () => {
    expect(renameRatingRow(MATRIX, 'Meets', 'Exceeds')).toBe(MATRIX)
  })
})

describe('setBandBoundary', () => {
  it('moves the boundary on both sides at once', () => {
    // Moving the lower bound of band 2 must also move the upper bound of band 1,
    // or a gap opens and every compa-ratio between them stops being costed.
    const next = setBandBoundary(MATRIX, 1, 0.85)
    expect(next.bands[0].upperBound).toBe(0.85)
    expect(next.bands[1].lowerBound).toBe(0.85)
  })

  it('leaves no compa-ratio uncovered', () => {
    const next = setBandBoundary(MATRIX, 2, 0.95)
    expect(coversEveryCompaRatio(next)).toBe(true)
  })

  it('reassigns employees across the moved boundary', () => {
    // 0.86 is in the 0.80-0.90 band by default.
    expect(assignCompaRatioBand(0.86, MATRIX.bands)?.id).toBe('band-080-090')
    // Move that boundary up past it and it belongs to the band below.
    const next = setBandBoundary(MATRIX, 1, 0.87)
    expect(assignCompaRatioBand(0.86, next.bands)?.id).toBe('band-below-080')
  })

  it('relabels the bands it moved', () => {
    const next = setBandBoundary(MATRIX, 1, 0.85)
    expect(next.bands[0].label).toBe('Below 0.85')
    expect(next.bands[1].label).toBe('0.85 - 0.90')
  })

  it('refuses a value that would collapse a band', () => {
    // 0.95 is above the next boundary at 0.90, so band 2 would have no width.
    expect(setBandBoundary(MATRIX, 1, 0.95)).toBe(MATRIX)
    // 0.75 is below the previous boundary at 0.80.
    expect(setBandBoundary(MATRIX, 2, 0.75)).toBe(MATRIX)
  })

  it('ignores the first band, which has no lower boundary to move', () => {
    expect(setBandBoundary(MATRIX, 0, 0.5)).toBe(MATRIX)
  })
})

describe('splitBand', () => {
  it('turns one band into two', () => {
    const next = splitBand(MATRIX, 2, 0.95)
    expect(next.bands).toHaveLength(6)
    expect(next.bands[2].label).toBe('0.90 - 0.95')
    expect(next.bands[3].label).toBe('0.95 - 1.00')
  })

  it('leaves no compa-ratio uncovered', () => {
    expect(coversEveryCompaRatio(splitBand(MATRIX, 2, 0.95))).toBe(true)
  })

  it('gives both halves the percentages of the band they came from', () => {
    // Adding a column should not move the cost until the user edits it.
    const next = splitBand(MATRIX, 2, 0.95)
    expect(readMatrixCell(next, 'Meets', next.bands[2].id)).toBe(0.03)
    expect(readMatrixCell(next, 'Meets', next.bands[3].id)).toBe(0.03)
    expect(readMatrixCell(next, 'Exceeds', next.bands[2].id)).toBe(0.045)
  })

  it('refuses a split point outside the band', () => {
    expect(splitBand(MATRIX, 2, 1.5)).toBe(MATRIX)
    expect(splitBand(MATRIX, 2, 0.9)).toBe(MATRIX)
  })
})

describe('removeBand', () => {
  it('merges the removed span into the band below', () => {
    const next = removeBand(MATRIX, 2)
    expect(next.bands).toHaveLength(4)
    expect(next.bands[1].label).toBe('0.80 - 1.00')
  })

  it('merges the first band into the one above it', () => {
    const next = removeBand(MATRIX, 0)
    expect(next.bands[0].lowerBound).toBeNull()
    expect(next.bands[0].label).toBe('Below 0.90')
  })

  it('leaves no compa-ratio uncovered', () => {
    expect(coversEveryCompaRatio(removeBand(MATRIX, 2))).toBe(true)
    expect(coversEveryCompaRatio(removeBand(MATRIX, 0))).toBe(true)
    expect(coversEveryCompaRatio(removeBand(MATRIX, 4))).toBe(true)
  })

  it('refuses to remove the last remaining band', () => {
    const single: MeritMatrix = {
      ...MATRIX,
      bands: [{ id: 'all', label: 'All', lowerBound: null, upperBound: null }],
    }
    expect(removeBand(single, 0)).toBe(single)
  })
})

describe('scaleMatrix', () => {
  it('multiplies every cell', () => {
    const next = scaleMatrix(MATRIX, 2)
    expect(readMatrixCell(next, 'Meets', 'band-090-100')).toBeCloseTo(0.06, 10)
    expect(readMatrixCell(next, 'Exceeds', 'band-below-080')).toBeCloseTo(0.12, 10)
  })

  it('preserves the shape of the plan design', () => {
    // Scaling changes magnitude, not design. Every ratio between cells holds,
    // which is what a practitioner means by "land it on 3.25%".
    const next = scaleMatrix(MATRIX, 0.75)
    const ratioBefore =
      readMatrixCell(MATRIX, 'Exceeds', 'band-090-100') /
      readMatrixCell(MATRIX, 'Meets', 'band-090-100')
    const ratioAfter =
      readMatrixCell(next, 'Exceeds', 'band-090-100') /
      readMatrixCell(next, 'Meets', 'band-090-100')
    expect(ratioAfter).toBeCloseTo(ratioBefore, 10)
  })

  it('keeps a zero cell at zero', () => {
    const withZero = setMatrixCell(MATRIX, 'Meets', 'band-above-110', 0)
    expect(readMatrixCell(scaleMatrix(withZero, 3), 'Meets', 'band-above-110')).toBe(0)
  })

  it('refuses a negative or non-finite factor', () => {
    expect(scaleMatrix(MATRIX, -1)).toBe(MATRIX)
    expect(scaleMatrix(MATRIX, NaN)).toBe(MATRIX)
  })
})
