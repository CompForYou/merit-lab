import { Panel } from './Panel'
import { CostPanel } from './CostPanel'
import { DotPlot } from './DotPlot'
import { GradeTable } from './GradeTable'
import { OutOfRangeList, DistributionShift } from './OutOfRangeList'
import { CompressionTable, CappedNote } from './CompressionTable'
import { IssueList } from './IssueList'
import { formatCount, pluralize } from '../lib/format'
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
        {profile.unplaceable > 0 ? (
          <p className="mt-2 text-xs text-amber-800">
            {pluralize(profile.unplaceable, 'employee')} could not be placed in a
            range, so {profile.unplaceable === 1 ? 'has' : 'have'} no dot and
            {profile.unplaceable === 1 ? ' is' : ' are'} left out of every average.
            They are still counted in headcount and payroll.
          </p>
        ) : null}
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

      {errors.length > 0 || warnings.length > 0 ? (
        <Panel title="Import notes">
          <IssueList errors={errors} warnings={warnings} />
        </Panel>
      ) : null}
    </>
  )
}

