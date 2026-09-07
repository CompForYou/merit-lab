import type { Grade } from '../types/domain'

/**
 * A synthetic eight-grade salary structure.
 *
 * SYNTHETIC. Generated for demonstration. No real organisation's structure
 * appears in this repository.
 *
 * Shaped the way structures usually are rather than the way they are drawn in
 * textbooks: both the range spread and the midpoint progression widen with
 * grade. Wider ranges at senior levels reflect the greater pay dispersion among
 * experienced individual contributors and managers; larger midpoint steps
 * reflect the bigger jumps in scope between senior levels.
 *
 *   spread      35% at grade 1 rising to 65% at grade 8
 *   progression 12% at the bottom rising to 21% at the top
 *
 * Minimums and maximums are rounded to the nearest 500, as a published structure
 * would be, so the realised spreads sit near but not exactly on the targets.
 * Midpoints are exact and each is the arithmetic middle of its range.
 */
export const SAMPLE_GRADES: Grade[] = [
  { id: 'G1', name: 'Grade 1', order: 1, min: 51_000, mid: 60_000, max: 69_000 },
  { id: 'G2', name: 'Grade 2', order: 2, min: 56_500, mid: 67_000, max: 77_500 },
  { id: 'G3', name: 'Grade 3', order: 3, min: 63_000, mid: 76_000, max: 89_000 },
  { id: 'G4', name: 'Grade 4', order: 4, min: 70_500, mid: 86_500, max: 102_500 },
  { id: 'G5', name: 'Grade 5', order: 5, min: 79_500, mid: 99_500, max: 119_500 },
  { id: 'G6', name: 'Grade 6', order: 6, min: 91_500, mid: 116_500, max: 141_500 },
  { id: 'G7', name: 'Grade 7', order: 7, min: 106_500, mid: 138_500, max: 170_500 },
  { id: 'G8', name: 'Grade 8', order: 8, min: 126_500, mid: 167_500, max: 208_500 },
]
