import { Panel } from './Panel'
import { Explain } from './Explain'
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

