import type { TrackerSession } from '@/types'

/**
 * Compute authoritative elapsed seconds from persisted server segments & timestamps.
 * Never accumulates during paused state or relies on setInterval ticks for duration math.
 */
export function computeElapsedSeconds(
  session: TrackerSession | null,
  clientNowMs: number,
  clockOffsetMs = 0,
): number {
  if (!session) return 0
  const base = Math.max(0, session.accumulated_seconds)
  if (session.status !== 'active' || !session.current_segment_started_at) {
    return base
  }
  const segStartMs = Date.parse(session.current_segment_started_at)
  if (Number.isNaN(segStartMs)) return base
  const effectiveNowMs = clientNowMs + clockOffsetMs
  const activeDelta = Math.max(0, Math.floor((effectiveNowMs - segStartMs) / 1000))
  return base + activeDelta
}

export function computeClockOffsetMs(session: TrackerSession | null, receivedAtClientMs: number): number {
  if (!session?.server_now) return 0
  const serverMs = Date.parse(session.server_now)
  if (Number.isNaN(serverMs)) return 0
  return serverMs - receivedAtClientMs
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
