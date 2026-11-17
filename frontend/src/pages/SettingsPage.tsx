import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Download, Moon, Sun, Upload } from 'lucide-react'
import { portabilityApi } from '@/api/portability'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useApp } from '@/state/AppContext'
import type { ImportResult, ThemeMode, WeekStartDay } from '@/types'

const COMMON_TIMEZONES = [
  'UTC',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Bogota',
  'America/Buenos_Aires',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function SettingsPage() {
  const {
    user,
    theme,
    setTheme,
    updateUser,
    activities,
    projects,
    notify,
    reloadCatalogs,
    bumpDataVersion,
  } = useApp()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>('monday')
  const [confirmSwitch, setConfirmSwitch] = useState(true)
  const [defaultManualMode, setDefaultManualMode] = useState<'start_end' | 'duration'>('start_end')
  const [defaultActivityId, setDefaultActivityId] = useState('')
  const [defaultProjectId, setDefaultProjectId] = useState('')
  const [t1Mins, setT1Mins] = useState('30')
  const [t2Mins, setT2Mins] = useState('90')
  const [t3Mins, setT3Mins] = useState('180')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setEmail(user.email)
    setTimezone(user.timezone)
    setWeekStartDay(user.week_start_day)
    setConfirmSwitch(user.tracking_preferences.confirm_switch)
    setDefaultManualMode(user.tracking_preferences.default_manual_mode)
    setDefaultActivityId(user.tracking_preferences.default_activity_id ?? '')
    setDefaultProjectId(user.tracking_preferences.default_project_id ?? '')
    setT1Mins(String(Math.round(user.intensity_thresholds[0] / 60)))
    setT2Mins(String(Math.round(user.intensity_thresholds[1] / 60)))
    setT3Mins(String(Math.round(user.intensity_thresholds[2] / 60)))
  }, [user])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const m1 = Number(t1Mins)
    const m2 = Number(t2Mins)
    const m3 = Number(t3Mins)
    if (!m1 || !m2 || !m3 || !(m1 > 0 && m1 < m2 && m2 < m3)) {
      setError('Contribution thresholds (minutes) must be positive and strictly increasing.')
      return
    }

    setSaving(true)
    try {
      await updateUser({
        name: name.trim(),
        email: email.trim(),
        timezone: timezone.trim(),
        week_start_day: weekStartDay,
        theme,
        intensity_thresholds: [m1 * 60, m2 * 60, m3 * 60],
        tracking_preferences: {
          confirm_switch: confirmSwitch,
          default_manual_mode: defaultManualMode,
          default_activity_id: defaultActivityId || null,
          default_project_id: defaultProjectId || null,
        },
      })
      notify('Settings saved', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await portabilityApi.importFile(file)
      setImportResult(res)
      await reloadCatalogs()
      bumpDataVersion()
      notify(`Imported ${res.sessions_created} session(s)`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  const tzChoices = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Profile, appearance, time preferences, contribution scale, and data portability."
      />

      <form onSubmit={handleSave} className="space-y-5">
        {/* Appearance & Profile */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-fg">Profile &amp; appearance</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-fg-muted">Theme</span>
            <div className="flex gap-2">
              {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void setTheme(mode)}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    theme === mode
                      ? 'border-accent bg-accent-subtle text-fg'
                      : 'border-border bg-bg text-fg-muted hover:text-fg'
                  }`}
                >
                  {mode === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {mode} mode
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time & Tracking Preferences */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-fg">Time &amp; tracking preferences</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Timezone" hint="Controls daily grouping & midnight split">
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {tzChoices.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Week start day">
              <Select
                value={weekStartDay}
                onChange={(e) => setWeekStartDay(e.target.value as WeekStartDay)}
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </Select>
            </Field>

            <Field label="Default manual entry mode">
              <Select
                value={defaultManualMode}
                onChange={(e) => setDefaultManualMode(e.target.value as 'start_end' | 'duration')}
              >
                <option value="start_end">Start &amp; end time</option>
                <option value="duration">Direct duration</option>
              </Select>
            </Field>

            <Field label="Default activity">
              <Select
                value={defaultActivityId}
                onChange={(e) => setDefaultActivityId(e.target.value)}
              >
                <option value="">First active activity</option>
                {activities
                  .filter((a) => !a.is_archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Default project">
              <Select
                value={defaultProjectId}
                onChange={(e) => setDefaultProjectId(e.target.value)}
              >
                <option value="">None</option>
                {projects
                  .filter((p) => p.status !== 'archived')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={confirmSwitch}
              onChange={(e) => setConfirmSwitch(e.target.checked)}
              className="rounded border-border accent-accent"
            />
            Prompt before switching from an active or paused timer
          </label>
        </div>

        {/* Contribution Graph Intensity */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-fg">Contribution graph intensity</h2>
              <p className="text-xs text-fg-muted">
                Configure daily minute thresholds separating levels 1 through 4.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {([0, 1, 2, 3, 4] as const).map((lvl) => (
                <span
                  key={lvl}
                  className="h-3.5 w-3.5 rounded-[2px] border border-black/10 dark:border-white/10"
                  style={{ backgroundColor: `var(--contrib-${lvl})` }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Level 1 → 2 (minutes)">
              <Input
                type="number"
                min={1}
                value={t1Mins}
                onChange={(e) => setT1Mins(e.target.value)}
                required
              />
            </Field>
            <Field label="Level 2 → 3 (minutes)">
              <Input
                type="number"
                min={2}
                value={t2Mins}
                onChange={(e) => setT2Mins(e.target.value)}
                required
              />
            </Field>
            <Field label="Level 3 → 4 (minutes)">
              <Input
                type="number"
                min={3}
                value={t3Mins}
                onChange={(e) => setT3Mins(e.target.value)}
                required
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>

      {/* Export / Import */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Data portability</h2>
          <p className="text-xs text-fg-muted">
            Export your complete activity logs or import sessions from JSON or CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void portabilityApi.exportFile('csv')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => void portabilityApi.exportFile('json')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>

          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface-muted px-3 text-[13px] font-medium text-fg hover:bg-border">
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Importing…' : 'Import JSON / CSV'}
            <input
              type="file"
              accept=".json,.csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => void handleImportFile(e)}
            />
          </label>
        </div>

        {importResult && (
          <div className="rounded-md border border-border bg-bg p-3 text-xs space-y-1">
            <div className="font-medium text-fg">Import summary</div>
            <div className="text-fg-muted tabular-nums">
              Activities created: {importResult.activities_created} · Projects created:{' '}
              {importResult.projects_created} · Sessions created: {importResult.sessions_created}{' '}
              · Skipped: {importResult.sessions_skipped}
            </div>
            {importResult.errors.length > 0 && (
              <ul className="list-disc pl-4 text-fg-subtle">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
