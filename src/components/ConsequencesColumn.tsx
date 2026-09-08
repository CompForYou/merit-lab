import { Panel, CollapsiblePanel } from './Panel'
import { Explain } from './Explain'
import {
  SensitivityTable,
  InversionList,
  RatingGovernanceTable,
} from './DefencePanels'
import type { SensitivityRow } from '../lib/sensitivity'
import type { InversionSummary } from '../lib/inversions'
import type { RatingGovernance } from '../lib/rating-governance'
import { CostPanel } from './CostPanel'
import { DotPlot, type DotPlotMode } from './DotPlot'
import { GroupTable } from './GroupTable'
import { AdvisorPanel } from './AdvisorPanel'
import {
  IncreaseDistribution,
  CostDrivers,
  MovementSummary,
  StructureTable,
  PanelIntro,
} from './InsightPanels'
import { GradeTable } from './GradeTable'
import { OutOfRangeList, DistributionShift } from './OutOfRangeList'
import { CompressionTable, CappedNote } from './CompressionTable'
import { IssueList } from './IssueList'
import { formatCount, pluralize } from '../lib/format'
import type { ScenarioResults } from '../lib/run-scenario'
import type { GroupRow } from '../lib/grouping'
import type { Finding } from '../lib/advisor'
import type { PopulationProfile } from '../lib/population-profile'
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
  hoveredCell,
  dotMode,
  onDotModeChange,
  highlightedIds,
  focusId,
  groupRows,
  groupings,
  groupBy,
  onGroupByChange,
  highlightedGroupKey,
  onHighlightGroup,
  isDemographicGrouping,
  findings,
  sensitivity,
  inversions,
  ratingReport,
  payPosition,
  errors,
  warnings,
}: {
  scenario: ScenarioResults
  profile: PopulationProfile
  grades: Grade[]
  matrix: MeritMatrix
  settings: ScenarioSettings
  hoveredCell: { rating: string; bandId: string } | null
  dotMode: DotPlotMode
  onDotModeChange: (next: DotPlotMode) => void
  highlightedIds: ReadonlySet<string> | null
  focusId: string | null
  groupRows: GroupRow[]
  groupings: string[]
  groupBy: string
  onGroupByChange: (next: string) => void
  highlightedGroupKey: string | null
  onHighlightGroup: (key: string | null) => void
  isDemographicGrouping: boolean
  findings: Finding[]
  sensitivity: SensitivityRow[]
  inversions: InversionSummary
  ratingReport: RatingGovernance
  payPosition: { topBoxMedian: number | null; othersMedian: number | null; gap: number | null }
  errors: ImportIssue[]
  warnings: ImportIssue[]
}) {
  const cappedCount = scenario.results.filter((r) => r.reducedByCap > 0).length
  const overMaximum = scenario.results.filter((r) => r.isOverMaximumAfter)
  const belowMinimum = scenario.results.filter((r) => r.isBelowMinimumAfter)

  return (
    <>
      {/* The advisor leads, because it says which of the panels below deserve
          attention first and in what order. */}
      <Panel
        title="What to do about this plan"
        aside={
          findings.length > 0
            ? `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`
            : 'nothing to raise'
        }
      >
        <PanelIntro>
          Ranked worst first. Each one shows the arithmetic behind it, the cost of
          the action it suggests, and what this tool cannot see.
        </PanelIntro>
        <AdvisorPanel findings={findings} />
      </Panel>

      <Panel title="Cost" aside="what this plan spends">
        <PanelIntro>
          Spend is measured on cash, because that is what a budget approves. Base
          build is the part that carries into next year.
        </PanelIntro>
        <CostPanel
          budget={scenario.budget}
          overMaxMode={settings.overMaxMode}
          cappedCount={cappedCount}
        />
      </Panel>

      {/* Collapsed by default, with the answer in the summary line. These are
          the questions asked in a meeting rather than during design, and a
          panel that has nothing to report should cost nothing to skip. */}
      <CollapsiblePanel
        title="What another budget would look like"
        collapsed
        summary={sensitivitySummary(sensitivity)}
      >
        <PanelIntro>
          Every row rescales this matrix onto that budget and costs the whole
          population against it. The question a budget conversation actually
          asks, answered before it is asked.
        </PanelIntro>
        <SensitivityTable rows={sensitivity} currentTarget={settings.targetBudgetPercent} />
      </CollapsiblePanel>

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
        <DotPlot
          results={scenario.results}
          grades={grades}
          matrix={matrix}
          highlightedIds={highlightedIds}
          focusId={focusId}
          mode={dotMode}
          onModeChange={onDotModeChange}
        />
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

      <Panel title="What the spend achieved" aside="movement, not cost">
        <PanelIntro>
          The efficiency question. Two plans costing the same can move a
          population very differently, depending on where the money went.
        </PanelIntro>
        <MovementSummary scenario={scenario} bands={matrix.bands} />
      </Panel>

      <Panel title="What people actually receive" aside="individual increases">
        <PanelIntro>
          A spend percentage is an average and hides its own shape. This is the
          distribution behind it.
        </PanelIntro>
        <IncreaseDistribution scenario={scenario} />
      </Panel>

      <CollapsiblePanel
        title="Where the order reverses"
        collapsed
        summary={
          inversions.affectedCount === 0
            ? 'nobody out-earned by a worse rating'
            : `${formatCount(inversions.affectedCount)} out-earned by a worse rating`
        }
      >
        <PanelIntro>
          A percentage of a larger salary is more money, so a matrix can hand a
          top performer less cash than an average colleague in the same grade.
        </PanelIntro>
        <InversionList summary={inversions} />
      </CollapsiblePanel>

      <Panel title="Where the money goes" aside="largest cells first">
        <PanelIntro>
          Rarely the cells you would guess. A modest percentage paid to a large
          population usually outspends a generous one paid to a few.
        </PanelIntro>
        <CostDrivers
          scenario={scenario}
          bandLabel={(id) =>
            matrix.bands.find((b) => b.id === id)?.label ?? id
          }
        />
      </Panel>

      <Panel title="By grade">
        <GradeTable profile={profile} grades={grades} byGrade={scenario.byGrade} />
      </Panel>

      <Panel
        title="By group"
        aside={
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            aria-label="Group results by"
            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 focus:border-zinc-500 focus:outline-none"
          >
            {groupings.map((g) => (
              <option key={g} value={g}>
                {g === '__grade__' ? 'Grade' : g}
              </option>
            ))}
          </select>
        }
      >
        <GroupTable
          rows={groupRows}
          highlightedKey={highlightedGroupKey}
          onHighlight={onHighlightGroup}
          isDemographic={isDemographicGrouping}
        />
      </Panel>

      <CollapsiblePanel
        title="Who rated generously"
        collapsed
        summary={governanceSummary(ratingReport)}
      >
        <PanelIntro>
          Rating distribution by the same grouping, against the company figure.
          The matrix pays on the rating, so an outlier here moves real money.
        </PanelIntro>
        <RatingGovernanceTable
          report={ratingReport}
          payPosition={payPosition}
          groupLabel={groupBy === '__grade__' ? 'Grade' : groupBy}
        />
      </CollapsiblePanel>

      <Panel
        title="Above the maximum"
        aside={
          <>
            {scenario.distribution.countCrossedMaximum > 0
              ? `${formatCount(scenario.distribution.countCrossedMaximum)} crossed this cycle`
              : 'none crossed this cycle'}
            <Explain term="red-circled" />
          </>
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

      <Panel
        title="Below the minimum"
        aside={<>green-circled<Explain term="green-circled" /></>}
      >
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

      <Panel title="The structure itself" aside="independent of this plan">
        <PanelIntro>
          What the ranges look like before any merit is applied, and where each
          grade sits across the full width of its own range afterwards.
        </PanelIntro>
        <StructureTable grades={grades} scenario={scenario} />
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


/**
 * The sensitivity panel's one-line summary.
 *
 * Names the range covered, and says up front if any of it is out of reach —
 * that is the finding, and it should not require opening the panel to see.
 */
function sensitivitySummary(rows: SensitivityRow[]): string {
  if (rows.length === 0) return 'nothing to cost'
  const low = rows[0].targetPercent
  const high = rows[rows.length - 1].targetPercent
  const unreachable = rows.filter((r) => !r.reachable).length
  const range = `${(low * 100).toFixed(2)}% to ${(high * 100).toFixed(2)}% costed`
  return unreachable > 0 ? `${range} · ${unreachable} out of reach` : range
}

/** The governance panel's summary: the widest gap, which is the reason to open it. */
function governanceSummary(report: RatingGovernance): string {
  const reported = report.rows.filter((r) => r.topBoxGap !== null)
  if (reported.length === 0) return 'not enough in any group to compare'

  const widest = reported.reduce((worst, row) =>
    Math.abs(row.topBoxGap!) > Math.abs(worst.topBoxGap!) ? row : worst,
  )
  const points = Math.round(Math.abs(widest.topBoxGap!) * 100)
  if (points < 5) return 'every group within 5 points of the company'

  return `${widest.label} ${widest.topBoxGap! > 0 ? 'is' : 'is'} ${points} points ${
    widest.topBoxGap! > 0 ? 'above' : 'below'
  } the company`
}
