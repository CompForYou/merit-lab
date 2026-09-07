import { useMemo, useRef, useState } from 'react'
import { Panel, Stat } from './components/Panel'
import { IssueList } from './components/IssueList'
import { GradeTable } from './components/GradeTable'
import { PasteArea, ActionButton } from './components/PasteArea'
import { MeritMatrixGrid } from './components/MeritMatrixGrid'
import { SettingsPanel } from './components/SettingsPanel'
import { CostPanel } from './components/CostPanel'
import { DotPlot } from './components/DotPlot'
import { OutOfRangeList, DistributionShift } from './components/OutOfRangeList'
import { CompressionTable, CappedNote } from './components/CompressionTable'
import { importEmployeesFromCsv } from './lib/import-employees'
import { importGradesFromCsv } from './lib/import-grades'
import { profilePopulation } from './lib/population-profile'
import { runScenario, fitToBudgetFactor } from './lib/run-scenario'
import { layoutDots } from './lib/dot-layout'
import {
  setMatrixCell,
  setBandBoundary,
  addRatingRow,
  removeRatingRow,
  scaleMatrix,
} from './lib/matrix-edit'
import {
  formatCompaRatio,
  formatCount,
  formatPercent,
  pluralize,
} from './lib/format'
import { SAMPLE_POPULATION } from './data/sample-population'
import { SAMPLE_GRADES } from './data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from './data/default-matrix'
import type { ImportIssue } from './lib/import-employees'
import type { MeritMatrix, ScenarioSettings } from './types/domain'

const POPULATION_PLACEHOLDER = `employee_id,grade,base_salary,performance_rating,fte,eligible,hire_date
E001,G3,74500,Meets,1,Y,2019-04-01
E002,G5,103000,Exceeds,0.8,Y,2022-11-15`

const STRUCTURE_PLACEHOLDER = `grade,name,order,min,mid,max
G1,Analyst,1,51000,60000,69000
G2,Senior Analyst,2,56500,67000,77500`

/** Long enough to see which cells moved, short enough not to be a wait. */
const FIT_ANIMATION_MS = 400

export default function App() {
  const [populationText, setPopulationText] = useState('')
  const [structureText, setStructureText] = useState('')
  const [sampleLoaded, setSampleLoaded] = useState(false)
  const [matrix, setMatrix] = useState<MeritMatrix>(DEFAULT_MERIT_MATRIX)
  const [settings, setSettings] = useState<ScenarioSettings>(DEFAULT_SETTINGS)
  const [newRating, setNewRating] = useState('')
  const [hoveredCell, setHoveredCell] = useState<{
    rating: string
    bandId: string
  } | null>(null)
  const animationRef = useRef<number | null>(null)
  const settleRef = useRef<number | null>(null)

  // Everything below recomputes on every keystroke. There is no server, so
  // there is nothing that could be loading and no reason to make anyone wait.
  const structureImport = useMemo(
    () => (structureText.trim() ? importGradesFromCsv(structureText) : null),
    [structureText],
  )

  const grades =
    structureImport && structureImport.grades.length > 0
      ? structureImport.grades
      : sampleLoaded
        ? SAMPLE_GRADES
        : []

  const populationImport = useMemo(
    () =>
      populationText.trim()
        ? importEmployeesFromCsv(populationText, {
            knownGradeIds: grades.length > 0 ? grades.map((g) => g.id) : undefined,
          })
        : null,
    [populationText, grades],
  )

  const employees =
    populationImport?.employees ?? (sampleLoaded ? SAMPLE_POPULATION : [])

  const profile = useMemo(
    () => profilePopulation(employees, grades),
    [employees, grades],
  )

  const scenario = useMemo(
    () => runScenario(employees, grades, matrix, settings),
    [employees, grades, matrix, settings],
  )

  const errors: ImportIssue[] = [
    ...(structureImport?.errors ?? []),
    ...(populationImport?.errors ?? []),
  ]
  const warnings: ImportIssue[] = [
    ...(structureImport?.warnings ?? []),
    ...(populationImport?.warnings ?? []),
  ]

  const hasData = employees.length > 0 && grades.length > 0
  const noMatrixCell = scenario.results.filter(
    (r) => r.exclusionReason === 'no-matrix-cell',
  )
  const cappedCount = scenario.results.filter((r) => r.reducedByCap > 0).length

  const dotLayout = useMemo(() => layoutDots(scenario.results), [scenario.results])
  const overMaximum = scenario.results.filter((r) => r.isOverMaximumAfter)
  const belowMinimum = scenario.results.filter((r) => r.isBelowMinimumAfter)

  const fitFactor = fitToBudgetFactor(
    scenario.budget.budgetSpendPercent,
    settings.targetBudgetPercent,
  )

  const loadSample = () => {
    setSampleLoaded(true)
    setPopulationText('')
    setStructureText('')
  }

  const clearAll = () => {
    setSampleLoaded(false)
    setPopulationText('')
    setStructureText('')
  }

  const commitNewRating = () => {
    const name = newRating.trim()
    if (name === '') return
    setMatrix((current) => addRatingRow(current, name))
    setNewRating('')
  }

  const cancelPendingFit = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    if (settleRef.current !== null) clearTimeout(settleRef.current)
    animationRef.current = null
    settleRef.current = null
  }

  /**
   * Scale the whole matrix onto the target budget.
   *
   * Animated rather than snapped, so the user can see which cells moved and by
   * how much. Scaling preserves the shape of the plan design and changes only
   * its magnitude, which is what a practitioner means by landing on a number.
   *
   * The animation is decoration; the result is not. Animation frames stop
   * arriving whenever the page is not painting — a background tab, a minimised
   * window — so a timer applies the final matrix regardless. Without it,
   * clicking the button in a tab that happens not to be drawing does nothing at
   * all, which is a far worse failure than a missing animation.
   */
  const fitToBudget = () => {
    if (fitFactor === null) return

    const start = matrix
    const settled = scaleMatrix(start, fitFactor)
    cancelPendingFit()

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (prefersReducedMotion) {
      setMatrix(settled)
      return
    }

    const startedAt = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / FIT_ANIMATION_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setMatrix(scaleMatrix(start, 1 + (fitFactor - 1) * eased))
      animationRef.current = progress < 1 ? requestAnimationFrame(step) : null
    }
    animationRef.current = requestAnimationFrame(step)

    settleRef.current = window.setTimeout(() => {
      cancelPendingFit()
      setMatrix(settled)
    }, FIT_ANIMATION_MS + 50)
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 px-6 py-3">
        <div className="mx-auto flex max-w-[100rem] items-baseline justify-between gap-6">
          <h1 className="text-sm font-semibold tracking-tight">Merit Lab</h1>
          <p className="text-[11px] text-zinc-500">
            Runs entirely in your browser. Nothing you paste is uploaded, transmitted,
            or stored.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-[100rem] grid-cols-1 gap-10 px-6 py-8 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
        {/* Controls */}
        <div>
          <Panel title="Merit matrix">
            <MeritMatrixGrid
              matrix={matrix}
              totals={scenario.matrixCells}
              onCellChange={(rating, bandId, percent) =>
                setMatrix((current) => setMatrixCell(current, rating, bandId, percent))
              }
              onBoundaryChange={(index, value) =>
                setMatrix((current) => setBandBoundary(current, index, value))
              }
              onRemoveRating={(rating) =>
                setMatrix((current) => removeRatingRow(current, rating))
              }
              hovered={hoveredCell}
              onHoverChange={setHoveredCell}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newRating}
                onChange={(e) => setNewRating(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewRating()
                }}
                placeholder="Add a rating row"
                aria-label="Add a rating row"
                className="w-40 rounded border border-zinc-300 bg-white px-2 py-1 text-xs placeholder:text-zinc-300 focus:border-zinc-500 focus:outline-none"
              />
              <ActionButton onClick={commitNewRating} disabled={newRating.trim() === ''}>
                Add
              </ActionButton>
              <ActionButton onClick={() => setMatrix(DEFAULT_MERIT_MATRIX)}>
                Reset matrix
              </ActionButton>
              <ActionButton onClick={fitToBudget} disabled={fitFactor === null}>
                Fit to budget
              </ActionButton>
              {fitFactor !== null && hasData ? (
                <span className="text-[11px] tabular-nums text-zinc-400">
                  scales every cell by {fitFactor.toFixed(3)}
                </span>
              ) : null}
            </div>

            {noMatrixCell.length > 0 ? (
              <p className="mt-3 text-xs text-amber-800">
                {pluralize(noMatrixCell.length, 'employee')} carry a rating with no row
                in this matrix and {noMatrixCell.length === 1 ? 'was' : 'were'} not
                costed. Add the rating above, or correct the data.
              </p>
            ) : null}
          </Panel>

          <Panel title="Plan settings">
            <SettingsPanel settings={settings} onChange={setSettings} />
          </Panel>

          <Panel
            title="Population"
            aside={
              employees.length > 0
                ? `${formatCount(profile.eligibleCount)} eligible`
                : undefined
            }
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-medium tabular-nums">
                {formatCount(employees.length)}
              </span>
              <span className="text-sm text-zinc-500">
                {employees.length === 1 ? 'employee' : 'employees'}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <ActionButton onClick={loadSample}>Load sample</ActionButton>
              <ActionButton
                onClick={clearAll}
                disabled={!sampleLoaded && !populationText && !structureText}
              >
                Clear
              </ActionButton>
            </div>

            {sampleLoaded && !populationText ? (
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Showing a synthetic 204-employee population, generated by code. It
                deliberately includes green-circled, red-circled, part-time and
                ineligible employees.
              </p>
            ) : null}
          </Panel>

          <Panel title="Paste population">
            <PasteArea
              label="Paste population data"
              value={populationText}
              onChange={setPopulationText}
              placeholder={POPULATION_PLACEHOLDER}
              rows={5}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              CSV or a column range copied from a spreadsheet. Needs an id, grade,
              base salary and rating; FTE, eligibility and hire date are optional.
              Any other column becomes a grouping you can break results down by.
            </p>
          </Panel>

          <Panel
            title="Salary structure"
            aside={grades.length > 0 ? pluralize(grades.length, 'grade') : undefined}
          >
            <PasteArea
              label="Paste salary structure"
              value={structureText}
              onChange={setStructureText}
              placeholder={STRUCTURE_PLACEHOLDER}
              rows={4}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Needs a grade code, minimum and maximum. Midpoint is derived from the
              range if you leave it out. Order is derived from midpoint if you leave
              it out, and it will say so.
            </p>
          </Panel>
        </div>

        {/* Consequences */}
        <div>
          {hasData ? (
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
                        matrix.bands.find((b) => b.id === hoveredCell.bandId)?.label ??
                        ''
                      }`
                    : 'one dot per employee'
                }
              >
                <DotPlot
                  layout={dotLayout}
                  bands={matrix.bands}
                  hovered={hoveredCell}
                />
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
                <GradeTable
                  profile={profile}
                  grades={grades}
                  byGrade={scenario.byGrade}
                />
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
                    A merit matrix does not clear green-circling. Moving these
                    employees into range needs a separate adjustment, costed outside
                    the merit budget.
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
                    {pluralize(profile.unplaceable, 'employee')} could not be placed
                    in a range and {profile.unplaceable === 1 ? 'is' : 'are'} left out
                    of every average. They are still counted in headcount and payroll.
                  </p>
                ) : null}
              </Panel>

              <Panel title="Rating distribution">
                <RatingBars profile={profile} />
              </Panel>
            </>
          ) : (
            <EmptyState hasGrades={grades.length > 0} hasEmployees={employees.length > 0} />
          )}

          {errors.length > 0 || warnings.length > 0 ? (
            <Panel title="Import notes">
              <IssueList errors={errors} warnings={warnings} />
            </Panel>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function RatingBars({ profile }: { profile: ReturnType<typeof profilePopulation> }) {
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

function EmptyState({
  hasGrades,
  hasEmployees,
}: {
  hasGrades: boolean
  hasEmployees: boolean
}) {
  let message = 'Load the sample population, or paste your own data on the left.'
  if (hasEmployees && !hasGrades) {
    message =
      'A population is loaded but there is no salary structure to place it against. Paste a structure on the left.'
  } else if (hasGrades && !hasEmployees) {
    message = 'A salary structure is loaded. Paste a population to place against it.'
  }

  return (
    <div className="rounded border border-dashed border-zinc-300 px-6 py-12 text-center">
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  )
}
