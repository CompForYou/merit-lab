import type { PopulationProfile } from '../lib/population-profile'
import { formatCount, formatPercent } from '../lib/format'

/**
 * How the population is rated.
 *
 * This lives with the population controls rather than with the consequences,
 * because it describes the data that was pasted in and never moves when the
 * matrix changes. Anything in the consequences column should respond to a
 * keystroke; this does not.
 */
export function RatingBars({ profile }: { profile: PopulationProfile }) {
  const total = profile.headcount
  const widest = Math.max(...profile.ratingCounts.map((r) => r.count), 1)

  if (profile.ratingCounts.length === 0) return null

  return (
    <div className="space-y-1.5">
      {profile.ratingCounts.map(({ rating, count }) => (
        <div key={rating} className="flex items-center gap-3 text-xs">
          <div className="w-24 shrink-0 truncate text-zinc-600">{rating}</div>
          <div className="h-3 flex-1 bg-zinc-100">
            <div
              className="h-full bg-zinc-400"
              style={{ width: `${(count / widest) * 100}%` }}
            />
          </div>
          <div className="w-9 shrink-0 text-right tabular-nums text-zinc-900">
            {formatCount(count)}
          </div>
          <div className="w-10 shrink-0 text-right tabular-nums text-zinc-400">
            {formatPercent(total > 0 ? count / total : null, 0)}
          </div>
        </div>
      ))}
    </div>
  )
}
