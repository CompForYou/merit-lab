/**
 * The compensation math library.
 *
 * Every function here is pure: numbers in, numbers out, no dependency on the
 * interface and no side effects. Nothing rounds — rounding belongs at display
 * time only. Percentages are decimals (0.035, not 3.5).
 *
 * Formulas follow docs/SPEC.md section 6.
 */

export { calculateCompaRatio } from './compa-ratio'
export { calculateRangePenetration } from './range-penetration'
export { calculateRangeSpread } from './range-spread'
export {
  calculateMidpointProgression,
  calculateStructureProgressions,
  type GradeProgression,
} from './midpoint-progression'
export {
  assignCompaRatioBand,
  DEFAULT_COMPA_RATIO_BANDS,
} from './compa-ratio-bands'
export {
  calculateProrationFactor,
  completedMonthsBetween,
  PERFORMANCE_PERIOD_MONTHS,
} from './proration'
export {
  calculateEmployeeMerit,
  type EmployeeMeritResult,
  type ExclusionReason,
} from './merit-increase'
export {
  summarizeBudget,
  summarizeBudgetBy,
  type BudgetSummary,
} from './budget'
export {
  summarizeDistribution,
  type DistributionSummary,
} from './distribution'
export {
  calculateCompressionIndicators,
  MIN_HEADCOUNT_FOR_COMPRESSION_FLAG,
  type CompressionPair,
} from './compression'
export { mean, median } from './statistics'

export { parseDelimitedText, normalizeHeader } from './csv'
export {
  importEmployeesFromCsv,
  type EmployeeImportResult,
  type EmployeeImportOptions,
  type ImportIssue,
} from './import-employees'
export {
  importGradesFromCsv,
  type GradeImportResult,
} from './import-grades'
export {
  profilePopulation,
  type PopulationProfile,
  type GradeProfile,
} from './population-profile'
export * from './format'
export * from './matrix-edit'
export {
  summarizeMatrixCells,
  findCell,
  type MatrixCellSummary,
  type MatrixCellTotals,
} from './matrix-cells'
export {
  runScenario,
  fitToBudgetFactor,
  type ScenarioResults,
} from './run-scenario'
export { layoutDots, DEFAULT_BIN_WIDTH, type Dot, type DotLayout } from './dot-layout'
export {
  serializeScenario,
  parseScenarioFile,
  scenarioFileName,
  SCENARIO_FILE_VERSION,
  type ScenarioFile,
  type ScenarioParseResult,
} from './scenario-file'
export { resultsToCsv } from './export-csv'
export { downloadText, readFileAsText } from './download'
export {
  groupResults,
  availableGroupings,
  widestAverageGap,
  MIN_GROUP_SIZE,
  GROUP_BY_GRADE,
  type GroupRow,
} from './grouping'
export { explainDot, type DotExplanation, type DotStatus } from './dot-explain'
export { layoutDotsByGrade, type DotGradeGroup, type GroupedDotLayout } from './dot-layout'
export { GLOSSARY, TERM_IDS, lookupTerm, type TermId, type GlossaryEntry } from './glossary'
export {
  adviseOnScenario,
  type Finding,
  type Severity,
  type AdvisorContext,
} from './advisor'
export {
  costToClearGreenCircles,
  compareOverMaxModes,
  projectCyclesToMidpoint,
  zeroIncreaseEmployees,
  structureHealth,
} from './remediation'
export {
  increaseDistribution,
  topCostDrivers,
  bandMovement,
  costPerCompaRatioPoint,
  structureRows,
  type IncreaseBucket,
  type BandMovement,
  type GradeStructureRow,
} from './insights'
