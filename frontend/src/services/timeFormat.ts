export function formatDurationHuman(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  if (safe === 0) return '0m'
  if (safe < 60) return `${safe}s`
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function formatHoursDecimal(totalSeconds: number): string {
  const hours = Math.max(0, totalSeconds) / 3600
  return `${hours.toFixed(1)}h`
}

export function formatTimeInZone(isoUtc: string, timeZone: string): string {
  const dt = new Date(isoUtc)
  if (Number.isNaN(dt.getTime())) return '--:--'
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt)
}

export function formatDateInZone(isoUtc: string, timeZone: string): string {
  const dt = new Date(isoUtc)
  if (Number.isNaN(dt.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function formatReadableDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt)
}

export function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(dt)
}

export function todayDateStringInZone(timeZone: string): string {
  return formatDateInZone(new Date().toISOString(), timeZone)
}

function getZonePartsMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs))
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const hour = num('hour') % 24
  return Date.UTC(num('year'), num('month') - 1, num('day'), hour, num('minute'), num('second'))
}

/**
 * Convert a local YYYY-MM-DD and HH:MM in an arbitrary IANA timezone to an ISO UTC timestamp.
 */
export function localDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const targetNaiveMs = Date.UTC(y, m - 1, d, hh, mm, 0)

  let utcMs = targetNaiveMs
  for (let i = 0; i < 2; i += 1) {
    const shownMs = getZonePartsMs(utcMs, timeZone)
    utcMs += targetNaiveMs - shownMs
  }
  return new Date(utcMs).toISOString()
}

export function formatThresholdLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hrs = seconds / 3600
  return Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`
}
