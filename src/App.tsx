const FORMULAS: { name: string; formula: string }[] = [
  { name: 'Compa-ratio', formula: 'fullTimeEquivalentSalary / gradeMidpoint' },
  { name: 'Range penetration', formula: '(salary - min) / (max - min)' },
  { name: 'Range spread', formula: '(max - min) / min' },
  { name: 'Midpoint progression', formula: '(mid - midBelow) / midBelow' },
  { name: 'Compa-ratio band assignment', formula: 'lower bound inclusive, upper exclusive' },
  { name: 'Merit increase', formula: 'salary x matrixPercent x prorationFactor' },
  { name: 'Proration', formula: 'completedMonths / 12' },
  { name: 'Range maximum handling', formula: 'capAtMax | allowOverMax | lumpSum' },
  { name: 'Budget aggregates', formula: 'baseBuild + lumpSum, by grade or grouping' },
  { name: 'Post-cycle distribution', formula: 'mean and median shift, crossings' },
  { name: 'Compression indicator', formula: '(higherMedian - lowerMedian) / lowerMedian' },
]

const TEST_COUNT = 198

export default function App() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 p-8 sm:p-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Merit Lab</h1>
        <p className="mt-4 text-zinc-600 leading-relaxed">
          A merit matrix and budget simulator that runs entirely in your browser.
          Your pay data is never uploaded, never transmitted, and never stored.
        </p>

        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-widest text-zinc-400">
            Milestone 1 — the math library
          </h2>
          <p className="mt-3 text-sm text-zinc-600">
            No interface yet. These are the compensation formulas, implemented as
            pure functions and covered by{' '}
            <span className="font-medium text-zinc-900">{TEST_COUNT} tests</span>{' '}
            with hand-calculated expected values. The deployment runs the suite
            before publishing, so a failing test never reaches this page.
          </p>

          <table className="mt-6 w-full text-sm border-collapse">
            <tbody>
              {FORMULAS.map((f) => (
                <tr key={f.name} className="border-t border-zinc-200">
                  <td className="py-2 pr-4 align-top whitespace-nowrap font-medium">
                    {f.name}
                  </td>
                  <td className="py-2 align-top text-zinc-500 font-mono text-xs">
                    {f.formula}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="mt-12 text-xs text-zinc-400">
          Next: Milestone 2 — data entry, validation, and a synthetic sample
          population.
        </p>
      </div>
    </main>
  )
}
