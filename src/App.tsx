import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from './components/Panel'
import { PasteArea, ActionButton } from './components/PasteArea'
import { MeritMatrixGrid } from './components/MeritMatrixGrid'
import { SettingsPanel } from './components/SettingsPanel'
import { ScenarioBar } from './components/ScenarioBar'
import { ConsequencesColumn } from './components/ConsequencesColumn'
import { IssueList } from './components/IssueList'
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
  serializeScenario,
  parseScenarioFile,
  scenarioFileName,
} from './lib/scenario-file'
import { resultsToCsv } from './lib/export-csv'
import { downloadText, readFileAsText } from './lib/download'
import { formatCount, formatCurrencyCompact, pluralize } from './lib/format'
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
  const [fileNotes, setFileNotes] = useState<ImportIssue[]>([])

  const animationRef = useRef<number | null>(null)
  const settleRef = useRef<number | null>(null)

  const matrix = plans[activePlan].matrix
  const settings = plans[activePlan].settings

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

  const populationImport = useMemo(
    () =>
      populationText.trim()
        ? importEmployeesFromCsv(populationText, {
            knownGradeIds: grades.length > 0 ? grades.map((g) => g.id) : undefined,
          })
        : null,
    [populationText, grades],
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

  const dotLayout = useMemo(() => layoutDots(scenario.results), [scenario.results])

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

            {loaded && !populationText && employees === SAMPLE_POPULATION ? (
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
            <ConsequencesColumn
              scenario={scenario}
              profile={profile}
              grades={grades}
              matrix={matrix}
              settings={settings}
              dotLayout={dotLayout}
              hoveredCell={hoveredCell}
              errors={errors}
              warnings={warnings}
            />
          ) : (
            <>
              <EmptyState
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
  let message =
    'Load the sample population, paste your own data, or load a saved scenario.'
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
