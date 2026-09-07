import type { MeritMatrix, ScenarioSettings } from '../types/domain'
import { DEFAULT_COMPA_RATIO_BANDS } from '../lib/compa-ratio-bands'
import { SAMPLE_RATINGS } from './sample-population'

/**
 * A starting merit matrix.
 *
 * SYNTHETIC. A plausible plan design, not anyone's actual one, and it is a
 * starting point to argue with rather than a recommendation.
 *
 * It follows the two rules almost every merit matrix follows:
 *
 *   Higher performance pays more, across every band.
 *   Lower compa-ratio pays more, across every rating.
 *
 * The second is the one non-practitioners find surprising. It exists because a
 * merit matrix is a range-movement instrument as much as a reward one: paying a
 * larger percentage to people low in their range is how a population is walked
 * toward its midpoints over several cycles. Paying a flat percentage to
 * everybody preserves the existing distribution exactly, including whatever is
 * wrong with it.
 *
 * The bottom row is zero. That is a design statement, not an oversight: a plan
 * that pays an increase for the lowest rating has no lowest rating.
 *
 * Percentages are decimals. 0.045 is 4.5%.
 */
export const DEFAULT_MERIT_MATRIX: MeritMatrix = {
  ratings: [...SAMPLE_RATINGS],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    Exceeds: {
      'band-below-080': 0.06,
      'band-080-090': 0.055,
      'band-090-100': 0.05,
      'band-100-110': 0.04,
      'band-above-110': 0.03,
    },
    Strong: {
      'band-below-080': 0.05,
      'band-080-090': 0.045,
      'band-090-100': 0.04,
      'band-100-110': 0.0325,
      'band-above-110': 0.025,
    },
    Meets: {
      'band-below-080': 0.04,
      'band-080-090': 0.035,
      'band-090-100': 0.03,
      'band-100-110': 0.025,
      'band-above-110': 0.02,
    },
    Developing: {
      'band-below-080': 0.02,
      'band-080-090': 0.015,
      'band-090-100': 0.01,
      'band-100-110': 0.01,
      'band-above-110': 0.005,
    },
    Below: {
      'band-below-080': 0,
      'band-080-090': 0,
      'band-090-100': 0,
      'band-100-110': 0,
      'band-above-110': 0,
    },
  },
}

/**
 * Starting settings. Over-maximum handling defaults to capAtMax and proration
 * is off, both as the spec requires.
 */
export const DEFAULT_SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.0325,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  meritEffectiveDate: '2025-01-01',
  compressionThreshold: 0.02,
  // Rounding changes the cost, so it stays off until a user asks for it.
  roundingIncrement: 0,
  currency: 'USD',
  locale: 'en-US',
}
