import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, CollapsiblePanel } from './components/Panel'
import { PasteArea, ActionButton } from './components/PasteArea'
import { MeritMatrixGrid } from './components/MeritMatrixGrid'
import { SettingsPanel } from './components/SettingsPanel'
import { ScenarioBar } from './components/ScenarioBar'
import { ConsequencesColumn } from './components/ConsequencesColumn'
import type { DotPlotMode } from './components/DotPlot'
import { HeadlineStrip } from './components/HeadlineStrip'
import { Explain } from './components/Explain'
import { RatingBars } from './components/RatingBars'
import { GettingStarted } from './components/GettingStarted'
import { IssueList } from './components/IssueList'
import { importEmployeesFromCsv } from './lib/import-employees'
import { importGradesFromCsv } from './lib/import-grades'
import { ColumnMapper } from './components/ColumnMapper'
import { parseDelimitedText } from './lib/csv'
import { proposeMapping, type ColumnMapping } from './lib/column-mapping'
import {
  browserStore,
  loadDesign,
  saveDesign,
  clearDesign,
} from './lib/session-memory'
import { profilePopulation } from './lib/population-profile'
import {
  groupResults,
  availableGroupings,
  GROUP_BY_GRADE,
} from './lib/grouping'
import { runScenario, fitToBudgetFactor } from './lib/run-scenario'
import { adviseOnScenario } from './lib/advisor'
import { budgetSensitivity, defaultSensitivityTargets } from './lib/sensitivity'
import { findInversions } from './lib/inversions'
import { ratingGovernance, topBoxPayPosition } from './lib/rating-governance'
import { compareOverMaxModes } from './lib/remediation'
import {
  setMatrixCell,
  setBandBoundary,
  addRatingRow,
  removeRatingRow,
  renameRatingRow,
  splitBand,
  removeBand,
  scaleMatrix,
} from './lib/matrix-edit'
import {
  serializeScenario,
  parseScenarioFile,
  scenarioFileName,
} from './lib/scenario-file'
import { resultsToCsv } from './lib/export-csv'
import { downloadText, readFileAsText } from './lib/download'
import {
  formatCount,
  formatCurrencyCompact,
  pluralize,
  setCurrencyFormat,
} from './lib/format'
import { SAMPLE_POPULATION } from './data/sample-population'
import { SAMPLE_GRADES } from './data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from './data/default-matrix'
import type { ImportIssue } from './lib/import-employees'
import type {
  Employee,
  Grade,
  MeritMatrix,
  ScenarioSettings,
} from './types/domain'

const POPULATION_PLACEHOLDER = `employee_id,grade,base_salary,performance_rating,fte,eligible,hire_date
E001,G3,74500,Meets,1,Y,2019-04-01
E002,G5,103000,Exceeds,0.8,Y,2022-11-15`

const STRUCTURE_PLACEHOLDER = `grade,name,order,min,mid,max
G1,Analyst,1,51000,60000,69000
G2,Senior Analyst,2,56500,67000,77500`

/** Long enough to see which cells moved, short enough not to be a wait. */
const FIT_ANIMATION_MS = 400

/** One plan design. The population is shared; only these differ between A and B. */
interface Plan {
  name: string
  matrix: MeritMatrix
  settings: ScenarioSettings
}

const newPlan = (name: string): Plan => ({
  name,
  matrix: DEFAULT_MERIT_MATRIX,
  settings: DEFAULT_SETTINGS,
})

export default function App() {
  const [populationText, setPopulationText] = useState('')
  const [structureText, setStructureText] = useState('')
  const [loaded, setLoaded] = useState<{
    employees: Employee[]
    grades: Grade[]
  } | null>(null)

  const [plans, setPlans] = useState<[Plan, Plan]>([
    newPlan('Plan A'),
    newPlan('Plan B'),
  ])
  const [activePlan, setActivePlan] = useState<0 | 1>(0)
  const [newRating, setNewRating] = useState('')
  const [hoveredCell, setHoveredCell] = useState<{
    rating: string
    bandId: string
  } | null>(null)
  const [dotMode, setDotMode] = useState<DotPlotMode>('single')
  const [groupBy, setGroupBy] = useState<string>(GROUP_BY_GRADE)
  const [highlightedGroupKey, setHighlightedGroupKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fileNotes, setFileNotes] = useState<ImportIssue[]>([])
  /**
   * Column mappings the user set by hand, keyed by the header row they were
   * made for. Keyed rather than singular so that pasting a second file does not
   * inherit a mapping made for the first — a column index means nothing once
   * the columns change — and so the same export maps itself next cycle.
   */
  const [mappings, setMappings] = useState<Record<string, ColumnMapping>>({})
  const [restored, setRestored] = useState(false)
  /** False until the remembered design has been read, so the save below cannot pre-empt it. */
  const [hydrated, setHydrated] = useState(false)

  /** Null in a private window or wherever site data is blocked. Everything degrades quietly. */
  const store = useMemo(() => browserStore(), [])

  const animationRef = useRef<number | null>(null)
  const settleRef = useRef<number | null>(null)

  const matrix = plans[activePlan].matrix
  const settings = plans[activePlan].settings

  // Formatting is module state, so it is set before anything renders figures.
  // Doing it during render rather than in an effect means the first paint after
  // a currency change is already in the new currency.
  setCurrencyFormat({
    currency: settings.currency ?? 'USD',
    locale: settings.locale ?? 'en-US',
  })

  /**
   * Bring back the plan design from last time, once, on open.
   *
   * The population is deliberately not restored and never was stored. Somebody
   * returning to the tool re-pastes their file, which they still have, and finds
   * the matrix they spent an afternoon on already in place.
   */
  useEffect(() => {
    const remembered = loadDesign(store)
    if (remembered) {
      setPlans([remembered.plans[0], remembered.plans[1]])
      setActivePlan(remembered.activePlan)
      setMappings(remembered.mappings)
      setRestored(true)
    }
    setHydrated(true)
  }, [store])

  /**
   * True while nothing has been changed from the state the tool opens in.
   *
   * Reference equality is enough: `newPlan` hands out the same two frozen
   * constants, and every edit builds a new object. It means a visitor who opens
   * the tool, looks around and leaves has had nothing written to their device at
   * all, and it makes "Forget it" honest — otherwise the save below fires on the
   * next render and puts a default design straight back.
   */
  const designIsPristine =
    Object.keys(mappings).length === 0 &&
    plans[0].name === 'Plan A' &&
    plans[1].name === 'Plan B' &&
    plans.every(
      (p) => p.matrix === DEFAULT_MERIT_MATRIX && p.settings === DEFAULT_SETTINGS,
    )

  /**
   * Written on every design change, but never before the restore above has run.
   *
   * Without that gate the two effects race on first render: this one fires with
   * the default matrix still in state and overwrites the design that was about
   * to be restored. The symptom is a tool that silently forgets your work every
   * time you open it, which is worse than not remembering at all.
   *
   * It is a few kilobytes of percentages, so there is nothing to debounce.
   */
  useEffect(() => {
    if (!hydrated) return
    if (designIsPristine) {
      clearDesign(store)
      return
    }
    saveDesign(
      {
        plans: [
          { name: plans[0].name, matrix: plans[0].matrix, settings: plans[0].settings },
          { name: plans[1].name, matrix: plans[1].matrix, settings: plans[1].settings },
        ],
        activePlan,
        mappings,
      },
      store,
    )
  }, [hydrated, designIsPristine, plans, activePlan, mappings, store])

  const forgetDesign = useCallback(() => {
    clearDesign(store)
    setPlans([newPlan('Plan A'), newPlan('Plan B')])
    setActivePlan(0)
    setMappings({})
    setRestored(false)
  }, [store])

  const updateActivePlan = useCallback(
    (change: (plan: Plan) => Plan) => {
      setPlans((current) => {
        const next: [Plan, Plan] = [current[0], current[1]]
        next[activePlan] = change(current[activePlan])
        return next
      })
    },
    [activePlan],
  )

  const setMatrix = useCallback(
    (change: (current: MeritMatrix) => MeritMatrix) =>
      updateActivePlan((plan) => ({ ...plan, matrix: change(plan.matrix) })),
    [updateActivePlan],
  )

  // Everything below recomputes on every keystroke. There is no server, so
  // there is nothing that could be loading and no reason to make anyone wait.
  const structureImport = useMemo(
    () => (structureText.trim() ? importGradesFromCsv(structureText) : null),
    [structureText],
  )

  const grades =
    structureImport && structureImport.grades.length > 0
      ? structureImport.grades
      : (loaded?.grades ?? [])

  // Parsed once and shared, because the mapper needs the same rows the importer
  // will read. A preview computed from a second parse could disagree with the
  // import, which is worse than showing no preview at all.
  const populationRows = useMemo(
    () => (populationText.trim() ? parseDelimitedText(populationText) : []),
    [populationText],
  )

  /**
   * A mapping the user set by hand, remembered against the headers it was made
   * for. Pasting a different file drops it: a column index chosen for one
   * export means nothing in another, and silently carrying it over would point
   * a field at whatever now sits in that position.
   */
  const populationHeaders = useMemo(() => populationRows[0] ?? [], [populationRows])
  const headerSignature = populationHeaders.join('|')
  const mapping: ColumnMapping = useMemo(
    () => mappings[headerSignature] ?? proposeMapping(populationHeaders),
    [mappings, headerSignature, populationHeaders],
  )

  const populationImport = useMemo(
    () =>
      populationText.trim()
        ? importEmployeesFromCsv(populationText, {
            knownGradeIds: grades.length > 0 ? grades.map((g) => g.id) : undefined,
            mapping,
          })
        : null,
    [populationText, grades, mapping],
  )

  const employees = populationImport?.employees ?? loaded?.employees ?? []

  const profile = useMemo(
    () => profilePopulation(employees, grades),
    [employees, grades],
  )

  const scenario = useMemo(
    () => runScenario(employees, grades, matrix, settings),
    [employees, grades, matrix, settings],
  )

  // The other plan is costed too, so the comparison is always live rather than
  // computed only at the moment of swapping.
  const otherIndex: 0 | 1 = activePlan === 0 ? 1 : 0
  const otherScenario = useMemo(
    () =>
      runScenario(
        employees,
        grades,
        plans[otherIndex].matrix,
        plans[otherIndex].settings,
      ),
    [employees, grades, plans, otherIndex],
  )


  const errors: ImportIssue[] = [
    ...(structureImport?.errors ?? []),
    ...(populationImport?.errors ?? []),
    ...fileNotes.filter((n) => n.column === 'error'),
  ]
  const warnings: ImportIssue[] = [
    ...(structureImport?.warnings ?? []),
    ...(populationImport?.warnings ?? []),
    ...fileNotes.filter((n) => n.column !== 'error'),
  ]

  const hasData = employees.length > 0 && grades.length > 0
  const noMatrixCell = scenario.results.filter(
    (r) => r.exclusionReason === 'no-matrix-cell',
  )

  const groupings = useMemo(() => availableGroupings(employees), [employees])

  // A grouping the user picked can vanish when they paste a different file.
  const activeGroupBy = groupings.includes(groupBy) ? groupBy : GROUP_BY_GRADE

  const attributeOf = useMemo(() => {
    const lookup = new Map<string, string>()
    if (activeGroupBy === GROUP_BY_GRADE) return lookup
    for (const e of employees) {
      lookup.set(e.id, e.attributes?.[activeGroupBy] ?? 'Unspecified')
    }
    return lookup
  }, [employees, activeGroupBy])

  const groupRows = useMemo(() => {
    const gradeName = new Map(grades.map((g) => [g.id, g.name]))
    return activeGroupBy === GROUP_BY_GRADE
      ? groupResults(
          scenario.results,
          (r) => r.gradeId,
          (k) => gradeName.get(k) ?? k,
          settings.targetBudgetPercent,
        )
      : groupResults(
          scenario.results,
          (r) => attributeOf.get(r.employeeId) ?? 'Unspecified',
          (k) => k,
          settings.targetBudgetPercent,
        )
  }, [scenario.results, grades, activeGroupBy, attributeOf, settings.targetBudgetPercent])

  /**
   * Columns whose grouping deserves the pay-equity caution. Matched on name,
   * because these arrive as free-form headings from whatever system exported
   * the file.
   */
  const isDemographicGrouping = /gender|sex|ethnic|race|disab|age|nationality/i.test(
    activeGroupBy,
  )

  /**
   * The employee the search box has found. Only pins the plot on an unambiguous
   * match: highlighting one of nine candidates would be a guess.
   */
  const searchCandidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term === '') return []
    return employees.filter((e) => e.id.toLowerCase().includes(term))
  }, [search, employees])
  const searchMatches = searchCandidates.length
  const searchMatch = searchMatches === 1 ? searchCandidates[0].id : null

  /**
   * Who stays lit in the plot. One path for three sources, so they cannot
   * disagree: a hovered matrix cell, a hovered group row, or a search match.
   */
  const highlightedIds = useMemo<ReadonlySet<string> | null>(() => {
    if (searchMatch) return new Set([searchMatch])
    if (highlightedGroupKey !== null) {
      const members = scenario.results.filter((r) =>
        activeGroupBy === GROUP_BY_GRADE
          ? r.gradeId === highlightedGroupKey
          : (attributeOf.get(r.employeeId) ?? 'Unspecified') === highlightedGroupKey,
      )
      return new Set(members.map((r) => r.employeeId))
    }
    if (hoveredCell) {
      const members = scenario.results.filter(
        (r) =>
          r.performanceRating === hoveredCell.rating && r.bandId === hoveredCell.bandId,
      )
      return new Set(members.map((r) => r.employeeId))
    }
    return null
  }, [searchMatch, highlightedGroupKey, hoveredCell, scenario.results, activeGroupBy, attributeOf])

  /**
   * The three "defend it in the room" answers.
   *
   * Sensitivity runs the whole population once per candidate budget, so it is
   * six full scenario runs. On a two-hundred-employee population that is a few
   * tens of thousands of multiplications and still imperceptible, but it is
   * gated on `hasData` so it never runs against an empty population.
   */
  const sensitivity = useMemo(() => {
    if (!hasData) return []
    return budgetSensitivity(
      employees,
      grades,
      matrix,
      settings,
      defaultSensitivityTargets(settings.targetBudgetPercent),
    )
  }, [hasData, employees, grades, matrix, settings])

  const inversions = useMemo(
    () => findInversions(scenario.results, matrix.ratings),
    [scenario.results, matrix.ratings],
  )

  const ratingReport = useMemo(() => {
    const gradeName = new Map(grades.map((g) => [g.id, g.name]))
    return activeGroupBy === GROUP_BY_GRADE
      ? ratingGovernance(
          scenario.results,
          (r) => r.gradeId,
          (k) => gradeName.get(k) ?? k,
          matrix.ratings,
        )
      : ratingGovernance(
          scenario.results,
          (r) => attributeOf.get(r.employeeId) ?? 'Unspecified',
          (k) => k,
          matrix.ratings,
        )
  }, [scenario.results, grades, matrix.ratings, activeGroupBy, attributeOf])

  const payPosition = useMemo(
    () => topBoxPayPosition(scenario.results, matrix.ratings),
    [scenario.results, matrix.ratings],
  )

  const findings = useMemo(() => {
    if (!hasData) return []
    return adviseOnScenario({
      scenario,
      employees,
      grades,
      matrix,
      settings,
      modeOutcomes: compareOverMaxModes(
        employees,
        grades,
        matrix,
        settings,
        runScenario,
      ),
    })
  }, [hasData, scenario, employees, grades, matrix, settings])

  const fitFactor = fitToBudgetFactor(
    scenario.budget.budgetSpendPercent,
    settings.targetBudgetPercent,
  )

  /**
   * Under-target while the maximum is withholding money means fit-to-budget has
   * nothing left to give: those employees cannot absorb a larger percentage, so
   * scaling the matrix higher stops raising spend.
   */
  const capIsLimiting =
    hasData &&
    scenario.budget.reducedByCap > 0 &&
    scenario.budget.budgetSpendPercent !== null &&
    scenario.budget.budgetSpendPercent < settings.targetBudgetPercent - 0.0001

  /** Backtick swaps plans, except while the user is typing into a field. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '`' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      setActivePlan((current) => (current === 0 ? 1 : 0))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const loadSample = () => {
    setLoaded({ employees: SAMPLE_POPULATION, grades: SAMPLE_GRADES })
    setPopulationText('')
    setStructureText('')
    setFileNotes([])
  }

  const clearAll = () => {
    setLoaded(null)
    setPopulationText('')
    setStructureText('')
    setFileNotes([])
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
   * The animation is decoration; the result is not. Animation frames stop
   * arriving whenever the page is not painting — a background tab, a minimised
   * window — so a timer applies the final matrix regardless.
   */
  const fitToBudget = () => {
    if (fitFactor === null) return

    const start = matrix
    const settled = scaleMatrix(start, fitFactor)
    cancelPendingFit()

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (prefersReducedMotion) {
      setMatrix(() => settled)
      return
    }

    const startedAt = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / FIT_ANIMATION_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setMatrix(() => scaleMatrix(start, 1 + (fitFactor - 1) * eased))
      animationRef.current = progress < 1 ? requestAnimationFrame(step) : null
    }
    animationRef.current = requestAnimationFrame(step)

    settleRef.current = window.setTimeout(() => {
      cancelPendingFit()
      setMatrix(() => settled)
    }, FIT_ANIMATION_MS + 50)
  }

  const exportScenario = () => {
    const json = serializeScenario({
      name: plans[activePlan].name,
      employees,
      grades,
      matrix,
      settings,
    })
    downloadText(scenarioFileName(plans[activePlan].name), json, 'application/json')
  }

  const exportCsv = () => {
    const csv = resultsToCsv(scenario.results, employees, grades)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`merit-lab-results-${stamp}.csv`, csv, 'text/csv')
  }

  const importScenario = async (file: File) => {
    let text: string
    try {
      text = await readFileAsText(file)
    } catch {
      setFileNotes([
        { row: null, column: 'error', message: `Could not read ${file.name}.` },
      ])
      return
    }

    const parsed = parseScenarioFile(text)
    if (!parsed.scenario) {
      setFileNotes(
        parsed.errors.map((message) => ({ row: null, column: 'error', message })),
      )
      return
    }

    setLoaded({
      employees: parsed.scenario.employees,
      grades: parsed.scenario.grades,
    })
    setPopulationText('')
    setStructureText('')
    updateActivePlan(() => ({
      name: parsed.scenario!.name,
      matrix: parsed.scenario!.matrix,
      settings: parsed.scenario!.settings,
    }))
    setFileNotes(
      parsed.warnings.map((message) => ({ row: null, column: null, message })),
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] items-baseline justify-between gap-6 px-6 py-2.5">
          <h1 className="text-sm font-semibold tracking-tight">Merit Lab</h1>
          <p className="hidden text-[11px] text-zinc-500 sm:block">
            Runs entirely in your browser. Nothing you paste is uploaded, transmitted,
            or stored.
          </p>
        </div>
        {hasData ? (
          <div className="mx-auto max-w-[100rem] border-t border-zinc-200 px-6 py-2">
            <HeadlineStrip
              budget={scenario.budget}
              overMaxMode={settings.overMaxMode}
              planName={plans[activePlan].name}
            />
          </div>
        ) : null}
      </header>

      <main
        className="mx-auto grid max-w-[100rem] grid-cols-1 gap-10 px-6 py-6 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]"
        style={{ ['--header-h' as string]: hasData ? '92px' : '46px' }}
      >
        {/* Controls */}
        <div className="xl:sticky xl:top-[var(--header-h)] xl:max-h-[calc(100vh-var(--header-h)-1rem)] xl:self-start xl:overflow-y-auto xl:pr-2">
          <Panel title="Scenarios">
            <ScenarioBar
              slots={[
                {
                  name: plans[0].name,
                  budget: hasData
                    ? activePlan === 0
                      ? scenario.budget
                      : otherScenario.budget
                    : null,
                },
                {
                  name: plans[1].name,
                  budget: hasData
                    ? activePlan === 1
                      ? scenario.budget
                      : otherScenario.budget
                    : null,
                },
              ]}
              activeIndex={activePlan}
              onSelect={setActivePlan}
              onRename={(index, name) =>
                setPlans((current) => {
                  const next: [Plan, Plan] = [current[0], current[1]]
                  next[index] = { ...current[index], name }
                  return next
                })
              }
              onCopyToOther={() =>
                setPlans((current) => {
                  const next: [Plan, Plan] = [current[0], current[1]]
                  next[otherIndex] = {
                    ...current[activePlan],
                    name: current[otherIndex].name,
                  }
                  return next
                })
              }
              onExportScenario={exportScenario}
              onExportCsv={exportCsv}
              onImportScenario={importScenario}
              canExport={hasData}
            />
          </Panel>

          {restored ? (
            <div className="mb-3 flex items-baseline justify-between gap-3 rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-500">
              <span>
                Picked up your last matrix design. Your population was not kept —
                paste it again.
              </span>
              <button
                type="button"
                onClick={() => setRestored(false)}
                className="shrink-0 text-zinc-400 hover:text-zinc-700"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ) : null}

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
              onRenameRating={(from, to) =>
                setMatrix((current) => renameRatingRow(current, from, to))
              }
              onSplitBand={(index, value) =>
                setMatrix((current) => splitBand(current, index, value))
              }
              onRemoveBand={(index) =>
                setMatrix((current) => removeBand(current, index))
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
              <ActionButton
                onClick={() =>
                  updateActivePlan((plan) => ({
                    ...plan,
                    matrix: DEFAULT_MERIT_MATRIX,
                  }))
                }
              >
                Reset matrix
              </ActionButton>
              <ActionButton onClick={fitToBudget} disabled={fitFactor === null}>
                Fit to budget
              </ActionButton>
              <Explain term="fit-to-budget" />
              {fitFactor !== null && hasData ? (
                <span className="text-[11px] tabular-nums text-zinc-400">
                  scales every cell by {fitFactor.toFixed(3)}
                </span>
              ) : null}
            </div>

            {capIsLimiting ? (
              <p className="mt-3 text-xs text-amber-800">
                Spend is below target while{' '}
                {formatCurrencyCompact(scenario.budget.reducedByCap)} is being
                withheld at the range maximum. Scaling the matrix higher will not
                close the gap: those employees cannot absorb more. Switch the
                over-maximum mode, or the ranges need to move.
              </p>
            ) : null}

            {noMatrixCell.length > 0 ? (
              <p className="mt-3 text-xs text-amber-800">
                {pluralize(noMatrixCell.length, 'employee')} carry a rating with no row
                in this matrix and {noMatrixCell.length === 1 ? 'was' : 'were'} not
                costed. Add the rating above, or correct the data.
              </p>
            ) : null}
          </Panel>

          <Panel title="Plan settings">
            <SettingsPanel
              settings={settings}
              onChange={(next) =>
                updateActivePlan((plan) => ({ ...plan, settings: next }))
              }
            />
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
                disabled={!loaded && !populationText && !structureText}
              >
                Clear
              </ActionButton>
            </div>

            {employees.length > 0 ? (
              <div className="mt-3">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find an employee by id"
                  aria-label="Find an employee by id"
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs placeholder:text-zinc-300 focus:border-zinc-500 focus:outline-none"
                />
                {search.trim() !== '' ? (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {searchMatch
                      ? `Showing ${searchMatch} in the plot.`
                      : `${formatCount(searchMatches)} ${
                          searchMatches === 1 ? 'match' : 'matches'
                        } — keep typing to narrow to one.`}
                  </p>
                ) : null}
              </div>
            ) : null}

            {employees.length > 0 ? (
              <div className="mt-4 border-t border-zinc-100 pt-3">
                <RatingBars profile={profile} />
              </div>
            ) : null}

            {loaded && !populationText && employees === SAMPLE_POPULATION ? (
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Showing a synthetic 204-employee population, generated by code. It
                deliberately includes green-circled, red-circled, part-time and
                ineligible employees.
              </p>
            ) : null}
          </Panel>

          <CollapsiblePanel
            title="Paste population"
            collapsed={loaded !== null && populationText === ''}
            summary="replace the loaded population"
          >
            <PasteArea
              label="Paste population data"
              value={populationText}
              onChange={setPopulationText}
              placeholder={POPULATION_PLACEHOLDER}
              rows={5}
            />
            {populationRows.length > 0 ? (
              <div className="mt-2.5">
                <ColumnMapper
                  rows={populationRows}
                  mapping={mapping}
                  onChange={(next) =>
                    setMappings((current) => ({ ...current, [headerSignature]: next }))
                  }
                />
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                CSV or a column range copied from a spreadsheet. Needs an id, grade,
                base salary and rating; FTE, eligibility and hire date are optional.
                Any other column becomes a grouping you can break results down by.
                Nothing needs renaming first — you can tell it which column is which.
              </p>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Salary structure"
            aside={grades.length > 0 ? pluralize(grades.length, 'grade') : undefined}
            collapsed={grades.length > 0 && structureText === ''}
            summary="replace the loaded structure"
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
          </CollapsiblePanel>
        </div>

        {/* Consequences */}
        <div>
          {hasData ? (
            <ConsequencesColumn
              scenario={scenario}
              profile={profile}
              grades={grades}
              matrix={matrix}
              settings={settings}
              hoveredCell={hoveredCell}
              dotMode={dotMode}
              onDotModeChange={setDotMode}
              highlightedIds={highlightedIds}
              focusId={searchMatch}
              groupRows={groupRows}
              groupings={groupings}
              groupBy={activeGroupBy}
              onGroupByChange={setGroupBy}
              highlightedGroupKey={highlightedGroupKey}
              onHighlightGroup={setHighlightedGroupKey}
              isDemographicGrouping={isDemographicGrouping}
              findings={findings}
              sensitivity={sensitivity}
              inversions={inversions}
              ratingReport={ratingReport}
              payPosition={payPosition}
              errors={errors}
              warnings={warnings}
            />
          ) : (
            <>
              <GettingStarted
                onLoadSample={loadSample}
                hasGrades={grades.length > 0}
                hasEmployees={employees.length > 0}
              />
              {errors.length > 0 || warnings.length > 0 ? (
                <div className="mt-8">
                  <Panel title="Import notes">
                    <IssueList errors={errors} warnings={warnings} />
                  </Panel>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      {/*
        The one link a reviewer wants: straight to the arithmetic. The whole
        credibility argument of this tool is that the maths is readable and
        tested, which is worth nothing if you cannot find it.
      */}
      <footer className="mx-auto max-w-[100rem] border-t border-zinc-200 px-6 py-4">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Merit Lab runs entirely in your browser. No server and no account.{' '}
          <span className="text-zinc-500">
            Your population is never written anywhere
          </span>
          : close the tab and the people are gone. Your matrix design — the
          percentages, bands and settings, which contain nobody's pay — is kept on
          this device so a refresh does not cost you the work.{' '}
          <button
            type="button"
            onClick={forgetDesign}
            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700"
          >
            Forget it
          </button>
          .{' '}
          <a
            href="https://github.com/CompForYou/merit-lab"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
          >
            The source is public
          </a>
          , and every compensation formula lives in{' '}
          <code className="text-zinc-500">src/lib/</code> with a unit test and a
          hand-calculated expected value.
        </p>
      </footer>
    </div>
  )
}

