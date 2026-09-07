import { useState } from 'react'
import type { OverMaxMode, ScenarioSettings } from '../types/domain'
import { formatCurrency, formatPercent } from '../lib/format'
import { Explain } from './Explain'

const OVER_MAX_MODES: { value: OverMaxMode; label: string; help: string }[] = [
  {
    value: 'capAtMax',
    label: 'Cap',
    help: 'The increase is reduced so the new salary lands exactly on the range maximum. Somebody already above the maximum gets nothing; a merit cycle never cuts pay.',
  },
  {
    value: 'allowOverMax',
    label: 'Allow over',
    help: 'The increase applies in full and the employee becomes red-circled. Costs the most, and it compounds into next year.',
  },
  {
    value: 'lumpSum',
    label: 'Lump sum',
    help: 'Base rises to the maximum and the remainder is paid once, not added to base. Same cash as allowing over, but it does not build into the run rate.',
  },
]

/**
 * The three settings that change what the matrix costs without changing a single
 * percentage in it. The over-maximum mode in particular can move the same plan
 * from under budget to over it, which is why the spec insists it stays on screen.
 */
export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: ScenarioSettings
  onChange: (next: ScenarioSettings) => void
}) {
  const activeMode = OVER_MAX_MODES.find((m) => m.value === settings.overMaxMode)!

  return (
    <div className="space-y-4">
      <TargetBudget
        value={settings.targetBudgetPercent}
        onChange={(targetBudgetPercent) => onChange({ ...settings, targetBudgetPercent })}
      />

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            Over maximum<Explain term="over-max-modes" />
          </span>
        </div>
        <div className="inline-flex rounded border border-zinc-300 bg-white p-0.5">
          {OVER_MAX_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange({ ...settings, overMaxMode: mode.value })}
              title={mode.help}
              className={`rounded-sm px-2.5 py-1 text-xs transition ${
                settings.overMaxMode === mode.value
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          {activeMode.help}
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          Proration<Explain term="proration" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={settings.prorationEnabled}
            aria-label="Prorate increases for mid-period hires"
            onClick={() =>
              onChange({ ...settings, prorationEnabled: !settings.prorationEnabled })
            }
            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
              settings.prorationEnabled
                ? 'border-zinc-800 bg-zinc-800'
                : 'border-zinc-300 bg-white'
            }`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full transition ${
                settings.prorationEnabled
                  ? 'translate-x-[18px] bg-white'
                  : 'translate-x-[2px] bg-zinc-300'
              }`}
            />
          </button>
          <span className="text-xs text-zinc-600">
            {settings.prorationEnabled ? 'On' : 'Off'}
          </span>

          {settings.prorationEnabled ? (
            <label className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
              Effective
              <input
                type="date"
                value={settings.meritEffectiveDate ?? ''}
                onChange={(e) =>
                  onChange({ ...settings, meritEffectiveDate: e.target.value })
                }
                aria-label="Merit effective date"
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-800 focus:border-zinc-500 focus:outline-none"
              />
            </label>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          {settings.prorationEnabled
            ? 'Increases are scaled by completed whole months of the twelve-month performance period ending on the effective date. Anyone with no hire date is treated as employed throughout.'
            : 'Every eligible employee receives a full increase regardless of hire date.'}
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          Round new salaries<Explain term="rounding" />
        </div>
        <div className="inline-flex rounded border border-zinc-300 bg-white p-0.5">
          {ROUNDING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...settings, roundingIncrement: option.value })}
              className={`rounded-sm px-2.5 py-1 text-xs transition ${
                (settings.roundingIncrement ?? 0) === option.value
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          {(settings.roundingIncrement ?? 0) === 0
            ? 'Increases are applied at full precision, which is what makes every figure here reconcile exactly.'
            : `Each new base salary is rounded to the nearest ${formatCurrency(settings.roundingIncrement ?? 0)}. This changes the total cost, and never rounds anyone above a maximum the mode is holding.`}
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          Currency
        </div>
        <select
          value={`${settings.currency ?? 'USD'}|${settings.locale ?? 'en-US'}`}
          onChange={(e) => {
            const [currency, locale] = e.target.value.split('|')
            onChange({ ...settings, currency, locale })
          }}
          aria-label="Currency and locale"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          Display only. Every calculation here is unit-agnostic, and a scenario
          holds a single currency.
        </p>
      </div>
    </div>
  )
}

const ROUNDING_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1_000, label: '1,000' },
]

const CURRENCIES = [
  { value: 'USD|en-US', label: 'USD — US dollar' },
  { value: 'CAD|en-CA', label: 'CAD — Canadian dollar' },
  { value: 'GBP|en-GB', label: 'GBP — Pound sterling' },
  { value: 'EUR|de-DE', label: 'EUR — Euro' },
  { value: 'AUD|en-AU', label: 'AUD — Australian dollar' },
  { value: 'NZD|en-NZ', label: 'NZD — New Zealand dollar' },
  { value: 'CHF|de-CH', label: 'CHF — Swiss franc' },
  { value: 'SGD|en-SG', label: 'SGD — Singapore dollar' },
  { value: 'JPY|ja-JP', label: 'JPY — Japanese yen' },
  { value: 'INR|en-IN', label: 'INR — Indian rupee' },
]

/**
 * The budget target: a slider for exploring and a field for landing on the exact
 * figure somebody was actually given.
 */
function TargetBudget({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          Target budget<Explain term="merit-budget" />
        </span>
        <span className="flex items-baseline gap-0.5 text-sm tabular-nums text-zinc-900">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Target budget percent"
            value={draft ?? String(Math.round(value * 10000) / 100)}
            onChange={(e) => {
              const raw = e.target.value
              if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
              setDraft(raw)
              const parsed = Number(raw)
              if (raw !== '' && Number.isFinite(parsed)) onChange(parsed / 100)
              if (raw === '') onChange(0)
            }}
            onFocus={(e) => {
              setDraft(String(Math.round(value * 10000) / 100))
              e.target.select()
            }}
            onBlur={() => setDraft(null)}
            className="w-12 rounded-sm bg-transparent text-right tabular-nums outline-none focus:bg-white focus:ring-1 focus:ring-zinc-400"
          />
          <span className="text-xs text-zinc-400">%</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.05}
        value={Math.min(Math.max(value * 100, 0), 10)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label="Target budget slider"
        className="w-full accent-zinc-800"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-zinc-300">
        <span>{formatPercent(0, 0)}</span>
        <span>{formatPercent(0.05, 0)}</span>
        <span>{formatPercent(0.1, 0)}</span>
      </div>
    </div>
  )
}
