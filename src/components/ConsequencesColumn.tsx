import { Panel, Stat } from './Panel'
import { CostPanel } from './CostPanel'
import { DotPlot } from './DotPlot'
import { GradeTable } from './GradeTable'
import { OutOfRangeList, DistributionShift } from './OutOfRangeList'
import { CompressionTable, CappedNote } from './CompressionTable'
import { IssueList } from './IssueList'
import { formatCompaRatio, formatCount, formatPercent, pluralize } from '../lib/format'
import type { ScenarioResults } from '../lib/run-scenario'
import type { PopulationProfile } from '../lib/population-profile'
import type { DotLayout } from '../lib/dot-layout'
import type { ImportIssue } from '../lib/import-employees'
import type { Grade, MeritMatrix, ScenarioSettings } from '../types/domain'

/**
 * Everything the plan does, in the order a practitioner asks about it: what it
 * costs, where it moves people, who ends up outside their range, and what it
 * does to the steps between grades.
 */
export function ConsequencesColumn({
  scenario,
  profile,
  grades,
  matrix,
  settings,
  dotLayout,
  hoveredCell,
  errors,
  warnings,
}: {
  scenario: ScenarioResults
  profile: PopulationProfile
  grades: Grade[]
  matrix: MeritMatrix
  settings: ScenarioSettings
  dotLayout: DotLayout
  hoveredCell: { rating: string; bandId: string } | null
  errors: ImportIssue[]
  warnings: ImportIssue[]
}) {
  const cappedCount = scenario.results.filter((r) => r.reducedByCap > 0).length
  const overMaximum = scenario.results.filter((r) => r.isOverMaximumAfter)
  const belowMinimum = scenario.results.filter((r) => r.isBelowMinimumAfter)

  return (
    <>
      <Panel title="Cost">
        <CostPanel
          budget={scenario.budget}
          overMaxMode={settings.overMaxMode}
          cappedCount={cappedCount}
        />
      </Panel>

      <Panel
        title="Compa-ratio distribution"
        aside={
          hoveredCell
            ? `showing ${hoveredCell.rating} · ${
                matrix.bands.find((b) => b.id === hoveredCell.bandId)?.label ?? ''
              }`
            : 'one dot per employee'
        }
      >
        <DotPlot layout={dotLayout} bands={matrix.bands} hovered={hoveredCell} />
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <DistributionShift
            medianBefore={scenario.distribution.medianCompaRatioBefore}
            medianAfter={scenario.distribution.medianCompaRatioAfter}
            meanBefore={scenario.distribution.meanCompaRatioBefore}
            meanAfter={scenario.distribution.meanCompaRatioAfter}
          />
        </div>
      </Panel>

      <Panel title="By grade">
        <GradeTable profile={profile} grades={grades} byGrade={scenario.byGrade} />
      </Panel>

      <Panel
        title="Above the maximum"
        aside={
          scenario.distribution.countCrossedMaximum > 0
            ? `${formatCount(scenario.distribution.countCrossedMaximum)} crossed this cycle`
            : 'none crossed this cycle'
        }
      >
        <OutOfRangeList
          title="finish above their range maximum"
          results={overMaximum}
          grades={grades}
          emptyMessage="Nobody finishes above their range maximum."
          tone="over"
        />
        <CappedNote
          reducedByCap={scenario.budget.reducedByCap}
          cappedCount={cappedCount}
        />
      </Panel>

      <Panel title="Below the minimum" aside="green-circled">
        <OutOfRangeList
          title="remain below their range minimum"
          results={belowMinimum}
          grades={grades}
          emptyMessage="Nobody remains below their range minimum."
          tone="under"
        />
        {belowMinimum.length > 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            A merit matrix does not clear green-circling. Moving these employees
            into range needs a separate adjustment, costed outside the merit
            budget.
          </p>
        ) : null}
      </Panel>

      <Panel title="Compression indicator" aside="adjacent grades">
        <CompressionTable pairs={scenario.compression} />
      </Panel>

      <Panel title="Population profile" aside="before the cycle">
        <div className="grid grid-cols-3 gap-6">
          <Stat
            label="Median compa-ratio"
            value={formatCompaRatio(profile.medianCompaRatio)}
            detail={`mean ${formatCompaRatio(profile.meanCompaRatio)}`}
          />
          <Stat
            label="Below minimum"
            value={formatCount(profile.belowMinimum)}
            detail={
              profile.headcount > 0
                ? formatPercent(profile.belowMinimum / profile.headcount, 1)
                : undefined
            }
            tone={profile.belowMinimum > 0 ? 'warn' : 'quiet'}
          />
          <Stat
            label="Above maximum"
            value={formatCount(profile.aboveMaximum)}
            detail={
              profile.headcount > 0
                ? formatPercent(profile.aboveMaximum / profile.headcount, 1)
                : undefined
            }
            tone={profile.aboveMaximum > 0 ? 'warn' : 'quiet'}
          />
        </div>

        {profile.unplaceable > 0 ? (
          <p className="mt-4 text-xs text-amber-800">
            {pluralize(profile.unplaceable, 'employee')} could not be placed in a
            range and {profile.unplaceable === 1 ? 'is' : 'are'} left out of every
            average. They are still counted in headcount and payroll.
          </p>
        ) : null}
      </Panel>

      <Panel title="Rating distribution">
        <RatingBars profile={profile} />
      </Panel>

      {errors.length > 0 || warnings.length > 0 ? (
        <Panel title="Import notes">
          <IssueList errors={errors} warnings={warnings} />
        </Panel>
      ) : null}
    </>
  )
}

function RatingBars({ profile }: { profile: PopulationProfile }) {
  const total = profile.headcount
  const widest = Math.max(...profile.ratingCounts.map((r) => r.count), 1)

  return (
    <div className="space-y-1.5">
      {profile.ratingCounts.map(({ rating, count }) => (
        <div key={rating} className="flex items-center gap-3 text-xs">
          <div className="w-28 shrink-0 truncate text-zinc-600">{rating}</div>
          <div className="h-3 flex-1 bg-zinc-100">
            <div
              className="h-full bg-zinc-400"
              style={{ width: `${(count / widest) * 100}%` }}
            />
          </div>
          <div className="w-10 shrink-0 text-right tabular-nums text-zinc-900">
            {formatCount(count)}
          </div>
          <div className="w-12 shrink-0 text-right tabular-nums text-zinc-400">
            {formatPercent(total > 0 ? count / total : null, 0)}
          </div>
        </div>
      ))}
    </div>
  )
}
