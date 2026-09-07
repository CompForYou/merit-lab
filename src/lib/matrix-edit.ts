import type { CompaRatioBand, MeritMatrix } from '../types/domain'

/**
 * Pure edits to a merit matrix. Every function returns a new matrix and never
 * modifies the one it was given, so the interface can hold two scenarios at once
 * without one editing the other by accident.
 */

/** Set one cell's increase percentage. Stored as a decimal: 0.035 is 3.5%. */
export function setMatrixCell(
  matrix: MeritMatrix,
  performanceRating: string,
  bandId: string,
  increasePercent: number,
): MeritMatrix {
  return {
    ...matrix,
    cells: {
      ...matrix.cells,
      [performanceRating]: {
        ...(matrix.cells[performanceRating] ?? {}),
        [bandId]: increasePercent,
      },
    },
  }
}

/**
 * Add a rating row. New cells start at zero rather than being left absent:
 * an absent cell excludes every employee in it from costing, which is correct
 * for a rating the user never configured but wrong for one they just created.
 */
export function addRatingRow(
  matrix: MeritMatrix,
  performanceRating: string,
  atIndex?: number,
): MeritMatrix {
  if (matrix.ratings.includes(performanceRating)) return matrix

  const ratings = [...matrix.ratings]
  ratings.splice(atIndex ?? ratings.length, 0, performanceRating)

  const row: Record<string, number> = {}
  for (const band of matrix.bands) row[band.id] = 0

  return {
    ...matrix,
    ratings,
    cells: { ...matrix.cells, [performanceRating]: row },
  }
}

/** Remove a rating row and its cells. */
export function removeRatingRow(
  matrix: MeritMatrix,
  performanceRating: string,
): MeritMatrix {
  const cells = { ...matrix.cells }
  delete cells[performanceRating]
  return {
    ...matrix,
    ratings: matrix.ratings.filter((r) => r !== performanceRating),
    cells,
  }
}

/** Rename a rating row, keeping its cells and its position. */
export function renameRatingRow(
  matrix: MeritMatrix,
  from: string,
  to: string,
): MeritMatrix {
  if (from === to || !matrix.cells[from] || matrix.ratings.includes(to)) return matrix

  const cells = { ...matrix.cells }
  cells[to] = cells[from]
  delete cells[from]

  return {
    ...matrix,
    ratings: matrix.ratings.map((r) => (r === from ? to : r)),
    cells,
  }
}

/**
 * Move one band boundary.
 *
 * Bands must stay contiguous: every compa-ratio has to fall in exactly one band,
 * or employees silently drop out of costing. Moving the lower bound of band N
 * therefore also moves the upper bound of band N-1 to the same value.
 *
 * `boundaryIndex` is the index of the band whose LOWER bound is moving, so 1
 * moves the boundary between the first and second bands. Index 0 has no lower
 * bound to move and is ignored, as is the value below the previous boundary or
 * above the next one.
 */
export function setBandBoundary(
  matrix: MeritMatrix,
  boundaryIndex: number,
  value: number,
): MeritMatrix {
  const bands = matrix.bands
  if (boundaryIndex < 1 || boundaryIndex >= bands.length) return matrix
  if (!Number.isFinite(value)) return matrix

  // Stay strictly between the neighbouring boundaries, so no band collapses.
  const floor = bands[boundaryIndex - 1].lowerBound
  const ceiling = bands[boundaryIndex].upperBound
  if (floor !== null && value <= floor) return matrix
  if (ceiling !== null && value >= ceiling) return matrix

  const updated = bands.map((band, i) => {
    if (i === boundaryIndex - 1) return { ...band, upperBound: value }
    if (i === boundaryIndex) return { ...band, lowerBound: value }
    return band
  })

  return { ...matrix, bands: updated.map(relabelBand) }
}

/**
 * Add a band by splitting an existing one at `value`.
 * The new band inherits the percentages of the band it was split from, so the
 * cost does not jump the moment a column is added.
 */
export function splitBand(
  matrix: MeritMatrix,
  bandIndex: number,
  value: number,
): MeritMatrix {
  const band = matrix.bands[bandIndex]
  if (!band || !Number.isFinite(value)) return matrix
  if (band.lowerBound !== null && value <= band.lowerBound) return matrix
  if (band.upperBound !== null && value >= band.upperBound) return matrix

  const lower: CompaRatioBand = relabelBand({
    ...band,
    id: `${band.id}-a-${Math.round(value * 1000)}`,
    upperBound: value,
  })
  const upper: CompaRatioBand = relabelBand({
    ...band,
    id: `${band.id}-b-${Math.round(value * 1000)}`,
    lowerBound: value,
  })

  const bands = [...matrix.bands]
  bands.splice(bandIndex, 1, lower, upper)

  const cells: MeritMatrix['cells'] = {}
  for (const rating of matrix.ratings) {
    const row = { ...(matrix.cells[rating] ?? {}) }
    const inherited = row[band.id] ?? 0
    delete row[band.id]
    row[lower.id] = inherited
    row[upper.id] = inherited
    cells[rating] = row
  }

  return { ...matrix, bands, cells }
}

/**
 * Remove a band, merging its span into the neighbour below it (or above it, for
 * the first band). The surviving band keeps its own percentages.
 */
export function removeBand(matrix: MeritMatrix, bandIndex: number): MeritMatrix {
  if (matrix.bands.length <= 1) return matrix
  const band = matrix.bands[bandIndex]
  if (!band) return matrix

  const bands = matrix.bands.filter((_, i) => i !== bandIndex)
  const absorberIndex = bandIndex === 0 ? 0 : bandIndex - 1

  bands[absorberIndex] = relabelBand({
    ...bands[absorberIndex],
    lowerBound: bandIndex === 0 ? band.lowerBound : bands[absorberIndex].lowerBound,
    upperBound: bandIndex === 0 ? bands[absorberIndex].upperBound : band.upperBound,
  })

  const cells: MeritMatrix['cells'] = {}
  for (const rating of matrix.ratings) {
    const row = { ...(matrix.cells[rating] ?? {}) }
    delete row[band.id]
    cells[rating] = row
  }

  return { ...matrix, bands, cells }
}

/**
 * Multiply every cell by a factor. This is what fit-to-budget will use: scaling
 * the whole matrix preserves the SHAPE of the plan design, changing only its
 * magnitude, which is what a practitioner means by "make it land on 3.25%".
 */
export function scaleMatrix(matrix: MeritMatrix, factor: number): MeritMatrix {
  if (!Number.isFinite(factor) || factor < 0) return matrix

  const cells: MeritMatrix['cells'] = {}
  for (const rating of matrix.ratings) {
    const row = { ...(matrix.cells[rating] ?? {}) }
    for (const band of matrix.bands) row[band.id] = (row[band.id] ?? 0) * factor
    cells[rating] = row
  }
  return { ...matrix, cells }
}

/** Read a cell, treating an absent one as zero for display. */
export function readMatrixCell(
  matrix: MeritMatrix,
  performanceRating: string,
  bandId: string,
): number {
  return matrix.cells[performanceRating]?.[bandId] ?? 0
}

/** Regenerate a band label from its bounds, so labels never drift from reality. */
function relabelBand(band: CompaRatioBand): CompaRatioBand {
  const format = (value: number) => value.toFixed(2)
  let label: string

  if (band.lowerBound === null && band.upperBound === null) label = 'All'
  else if (band.lowerBound === null) label = `Below ${format(band.upperBound!)}`
  else if (band.upperBound === null) label = `${format(band.lowerBound)} and above`
  else label = `${format(band.lowerBound)} - ${format(band.upperBound)}`

  return { ...band, label }
}
