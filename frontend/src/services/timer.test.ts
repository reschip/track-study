import { describe, expect, it } from 'vitest'
import { computeClockOffsetMs, computeElapsedSeconds, formatTimerClock } from './timer'
import { formatDateInZone, formatDurationHuman, localDateTimeToUtcIso } from './timeFormat'
import type { TrackerSession } from '@/types'

const baseSession: TrackerSession = {
  id: 's1',
  activity_id: 'a1',
  activity: {
    id: 'a1',
    name: 'Programming',
    color: '#1F6FEB',
    category: 'professional',
    is_archived: false,
  },
  project_id: null,
  project: null,
  started_at: '2026-11-12T10:00:00Z',
  ended_at: null,
  accumulated_seconds: 1200,
  current_segment_started_at: '2026-11-12T10:45:00Z',
  status: 'active',
  description: null,
  tracking_method: 'timer',
  segments: [],
  server_now: '2026-11-12T10:50:00Z',
}

describe('timer service', () => {
  it('computes active elapsed time from accumulated_seconds + active segment', () => {
    const nowMs = Date.parse('2026-11-12T10:50:15Z')
    expect(computeElapsedSeconds(baseSession, nowMs, 0)).toBe(1515)
  })

  it('never accumulates time when paused', () => {
    const paused: TrackerSession = {
      ...baseSession,
      status: 'paused',
      current_segment_started_at: null,
    }
    const laterMs = Date.parse('2026-11-12T12:30:00Z')
    expect(computeElapsedSeconds(paused, laterMs, 0)).toBe(1200)
  })

  it('handles clock skew offset cleanly', () => {
    const receivedAtClientMs = Date.parse('2026-11-12T10:49:50Z') // client clock 10s behind server
    const offset = computeClockOffsetMs(baseSession, receivedAtClientMs)
    expect(offset).toBe(10_000)
    expect(computeElapsedSeconds(baseSession, receivedAtClientMs, offset)).toBe(300 + 1200)
  })

  it('formats clock and durations accurately', () => {
    expect(formatTimerClock(3665)).toBe('01:01:05')
    expect(formatDurationHuman(5400)).toBe('1h 30m')
    expect(formatDurationHuman(45)).toBe('45s')
  })

  it('converts local date/time in specified IANA timezone to UTC ISO', () => {
    const iso = localDateTimeToUtcIso('2026-11-11', '23:30', 'America/Mexico_City')
    expect(iso).toBe('2026-11-12T05:30:00.000Z')
    expect(formatDateInZone(iso, 'America/Mexico_City')).toBe('2026-11-11')
  })
})
