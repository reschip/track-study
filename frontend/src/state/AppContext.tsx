import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ApiError, isTauri } from '@/api/client'
import { activitiesApi } from '@/api/activities'
import { projectsApi } from '@/api/projects'
import { trackerApi, type TrackerStartPayload, type TrackerUpdateMetaPayload } from '@/api/tracker'
import { userApi, type UserUpdatePayload } from '@/api/user'
import { windowsApi } from '@/api/windows'
import { computeClockOffsetMs, computeElapsedSeconds, formatTimerClock } from '@/services/timer'
import type { Activity, NavSection, Project, ThemeMode, TrackerSession, User, WidgetState } from '@/types'

export interface ToastItem {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
}

interface PendingSwitchRequest {
  payload: TrackerStartPayload
  nextActivityName: string
}

interface AppContextValue {
  user: User | null
  loadingBoot: boolean
  theme: ThemeMode
  setTheme: (next: ThemeMode) => Promise<void>
  updateUser: (payload: UserUpdatePayload) => Promise<User>
  activities: Activity[]
  projects: Project[]
  reloadCatalogs: () => Promise<void>
  activeSession: TrackerSession | null
  elapsedSeconds: number
  timerBusy: boolean
  startTimer: (payload: TrackerStartPayload) => Promise<boolean>
  pauseTimer: () => Promise<void>
  resumeTimer: () => Promise<void>
  stopTimer: (description?: string | null) => Promise<void>
  updateRunningMeta: (payload: TrackerUpdateMetaPayload) => Promise<void>
  pendingSwitch: PendingSwitchRequest | null
  confirmSwitch: () => Promise<void>
  cancelSwitch: () => void
  manualModalOpen: boolean
  setManualModalOpen: (open: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean | ((cur: boolean) => boolean)) => void
  activeNav: NavSection
  setActiveNav: (nav: NavSection) => void
  dataVersion: number
  bumpDataVersion: () => void
  toasts: ToastItem[]
  notify: (message: string, tone?: ToastItem['tone']) => void
  dismissToast: (id: string) => void
  widgetState: WidgetState
  toggleWidget: () => Promise<void>
  setWidgetAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function isAuxWindowView(): boolean {
  if (typeof window === 'undefined') return false
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'popover' || view === 'widget'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const isAuxView = isAuxWindowView()
  const [user, setUser] = useState<User | null>(null)
  const [loadingBoot, setLoadingBoot] = useState(true)
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('activity_theme')
    return saved === 'dark' ? 'dark' : 'light'
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeSession, setActiveSession] = useState<TrackerSession | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [timerBusy, setTimerBusy] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitchRequest | null>(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<NavSection>(() => {
    const hash = window.location.hash.replace('#/', '') as NavSection
    const valid: NavSection[] = [
      'overview',
      'tracker',
      'activities',
      'projects',
      'calendar',
      'analytics',
      'history',
      'settings',
    ]
    return valid.includes(hash) ? hash : 'overview'
  })
  const [dataVersion, setDataVersion] = useState(0)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [widgetState, setWidgetState] = useState<WidgetState>({
    visible: false,
    always_on_top: true,
  })
  const toastCounter = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    toastCounter.current += 1
    const id = `toast-${toastCounter.current}-${Date.now()}`
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3400)
  }, [])

  const bumpDataVersion = useCallback(() => {
    setDataVersion((v) => v + 1)
  }, [])

  // Sync theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('activity_theme', theme)
  }, [theme])

  // Sync hash navigation cleanly (only for main workspace window)
  useEffect(() => {
    if (isAuxView) return
    const nextHash = `#/${activeNav}`
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    }
  }, [activeNav, isAuxView])

  useEffect(() => {
    if (isAuxView) return
    const onHash = () => {
      const hash = window.location.hash.replace('#/', '') as NavSection
      const valid: NavSection[] = [
        'overview',
        'tracker',
        'activities',
        'projects',
        'calendar',
        'analytics',
        'history',
        'settings',
      ]
      if (valid.includes(hash)) {
        setActiveNav(hash)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [isAuxView])

  const applyTimerSnapshot = useCallback((session: TrackerSession | null) => {
    const receivedAt = Date.now()
    const offset = computeClockOffsetMs(session, receivedAt)
    setActiveSession(session)
    setClockOffsetMs(offset)
    setElapsedSeconds(computeElapsedSeconds(session, receivedAt, offset))
  }, [])

  const reloadCatalogs = useCallback(async () => {
    const [acts, projs] = await Promise.all([
      activitiesApi.list({ include_archived: true }),
      projectsApi.list(),
    ])
    setActivities(acts)
    setProjects(projs)
  }, [])

  const syncCurrentTimer = useCallback(async () => {
    try {
      const current = await trackerApi.getCurrent()
      applyTimerSnapshot(current.active_session)
    } catch {
      // Ignore transient network focus errors
    }
  }, [applyTimerSnapshot])

  useEffect(() => {
    if (!isTauri()) return
    const unlisteners: (() => void)[] = []
    let disposed = false

    const setup = async () => {
      const u1 = await listen('timer-changed', () => {
        void syncCurrentTimer()
        setDataVersion((v) => v + 1)
      })
      const u2 = await listen('workspace-changed', () => {
        void userApi.get().then((u) => {
          setUser(u)
          setThemeState(u.theme)
        })
        void reloadCatalogs()
        setDataVersion((v) => v + 1)
      })
      const u3 = await listen<WidgetState>('widget-state-changed', (event) => {
        if (event.payload) {
          setWidgetState(event.payload)
        }
      })

      if (disposed) {
        u1()
        u2()
        u3()
      } else {
        unlisteners.push(u1, u2, u3)
      }
    }

    void setup()
    void windowsApi
      .getWidgetState()
      .then((ws) => {
        if (!disposed) setWidgetState(ws)
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisteners.forEach((fn) => fn())
    }
  }, [reloadCatalogs, syncCurrentTimer])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        const [u, acts, projs, current] = await Promise.all([
          userApi.get(),
          activitiesApi.list({ include_archived: true }),
          projectsApi.list(),
          trackerApi.getCurrent(),
        ])
        if (cancelled) return
        setUser(u)
        setThemeState(u.theme)
        setActivities(acts)
        setProjects(projs)
        applyTimerSnapshot(current.active_session)
      } catch (err) {
        if (!cancelled) {
          notify(err instanceof Error ? err.message : 'Failed to load workspace', 'error')
        }
      } finally {
        if (!cancelled) setLoadingBoot(false)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [applyTimerSnapshot, notify])

  // Recover / sync timer if browser tab becomes visible again
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void syncCurrentTimer()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [syncCurrentTimer])

  // Display tick only triggers recalculation from UTC timestamps + dynamic document title
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') {
      const sec = computeElapsedSeconds(activeSession, Date.now(), clockOffsetMs)
      setElapsedSeconds(sec)
      if (!isAuxView) {
        if (!activeSession) {
          document.title = 'Activity — Your time, visualized.'
        } else {
          document.title = `[Paused ${formatTimerClock(sec)}] ${activeSession.activity.name} — Activity`
        }
      }
      return
    }

    const updateTick = () => {
      const sec = computeElapsedSeconds(activeSession, Date.now(), clockOffsetMs)
      setElapsedSeconds(sec)
      if (!isAuxView) {
        document.title = `[${formatTimerClock(sec)}] ${activeSession.activity.name} — Activity`
      }
    }

    updateTick()
    const interval = window.setInterval(updateTick, 500)
    return () => window.clearInterval(interval)
  }, [activeSession, clockOffsetMs, isAuxView])

  const updateUser = useCallback(
    async (payload: UserUpdatePayload) => {
      const updated = await userApi.update(payload)
      setUser(updated)
      setThemeState(updated.theme)
      bumpDataVersion()
      return updated
    },
    [bumpDataVersion],
  )

  const setTheme = useCallback(
    async (next: ThemeMode) => {
      setThemeState(next)
      if (user) {
        try {
          const updated = await userApi.update({ theme: next })
          setUser(updated)
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Failed to save theme', 'error')
        }
      }
    },
    [notify, user],
  )

  const startTimer = useCallback(
    async (payload: TrackerStartPayload): Promise<boolean> => {
      setTimerBusy(true)
      try {
        const session = await trackerApi.start(payload)
        applyTimerSnapshot(session)
        notify(`Started ${session.activity.name}`, 'success')
        if (payload.confirm_switch) {
          await reloadCatalogs()
          bumpDataVersion()
        }
        return true
      } catch (err) {
        if (err instanceof ApiError && err.code === 'active_session_exists' && !payload.confirm_switch) {
          const nextAct = activities.find((a) => a.id === payload.activity_id)
          setPendingSwitch({
            payload,
            nextActivityName: nextAct?.name ?? 'new activity',
          })
          return false
        }
        notify(err instanceof Error ? err.message : 'Could not start timer', 'error')
        return false
      } finally {
        setTimerBusy(false)
      }
    },
    [activities, applyTimerSnapshot, bumpDataVersion, notify, reloadCatalogs],
  )

  const confirmSwitch = useCallback(async () => {
    if (!pendingSwitch) return
    const req = pendingSwitch.payload
    setPendingSwitch(null)
    await startTimer({ ...req, confirm_switch: true })
  }, [pendingSwitch, startTimer])

  const cancelSwitch = useCallback(() => {
    setPendingSwitch(null)
  }, [])

  const pauseTimer = useCallback(async () => {
    setTimerBusy(true)
    try {
      const session = await trackerApi.pause()
      applyTimerSnapshot(session)
      notify(`Paused ${session.activity.name}`, 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not pause timer', 'error')
    } finally {
      setTimerBusy(false)
    }
  }, [applyTimerSnapshot, notify])

  const resumeTimer = useCallback(async () => {
    setTimerBusy(true)
    try {
      const session = await trackerApi.resume()
      applyTimerSnapshot(session)
      notify(`Resumed ${session.activity.name}`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not resume timer', 'error')
    } finally {
      setTimerBusy(false)
    }
  }, [applyTimerSnapshot, notify])

  const stopTimer = useCallback(
    async (description?: string | null) => {
      setTimerBusy(true)
      try {
        const stopped = await trackerApi.stop(description)
        applyTimerSnapshot(null)
        await reloadCatalogs()
        bumpDataVersion()
        notify(`Saved ${stopped.activity.name} session`, 'success')
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Could not stop timer', 'error')
      } finally {
        setTimerBusy(false)
      }
    },
    [applyTimerSnapshot, bumpDataVersion, notify, reloadCatalogs],
  )

  const updateRunningMeta = useCallback(
    async (payload: TrackerUpdateMetaPayload) => {
      const updated = await trackerApi.updateMeta(payload)
      applyTimerSnapshot(updated)
      notify('Updated active session', 'info')
    },
    [applyTimerSnapshot, notify],
  )

  // Mutable ref so global keydown always reads fresh state without listener churn
  const stateRef = useRef({
    activeSession,
    timerBusy,
    activities,
    pauseTimer,
    resumeTimer,
    stopTimer,
    startTimer,
    setManualModalOpen,
    setActiveNav,
    setShortcutsOpen,
  })
  useEffect(() => {
    stateRef.current = {
      activeSession,
      timerBusy,
      activities,
      pauseTimer,
      resumeTimer,
      stopTimer,
      startTimer,
      setManualModalOpen,
      setActiveNav,
      setShortcutsOpen,
    }
  })

  // Global Keyboard Shortcuts (Space, ⌘., N, 1..5, G-chords, ?)
  useEffect(() => {
    if (isAuxView) return
    let lastGTime = 0

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if (target.isContentEditable) return true
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // 1. Always allow Cmd/Ctrl+K regardless of input focus
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((open) => !open)
        return
      }

      // 2. If typing inside an input, textarea or contenteditable, skip single key shortcuts
      if (isTypingTarget(e.target)) {
        return
      }

      const {
        activeSession: currentSession,
        timerBusy: isBusy,
        activities: allActivities,
        pauseTimer: doPause,
        resumeTimer: doResume,
        stopTimer: doStop,
        startTimer: doStart,
        setManualModalOpen: openManual,
        setActiveNav: setNav,
        setShortcutsOpen: toggleShortcuts,
      } = stateRef.current

      // Help modal with '?'
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        toggleShortcuts((cur) => !cur)
        return
      }

      // Stop active timer with ⌘ + . or Ctrl + .
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        if (currentSession && !isBusy) {
          void doStop()
        }
        return
      }

      // Space to Toggle Timer (Start / Pause / Resume)
      if (e.code === 'Space') {
        e.preventDefault()
        if (isBusy) return
        if (currentSession) {
          if (currentSession.status === 'active') {
            void doPause()
          } else if (currentSession.status === 'paused') {
            void doResume()
          }
        } else {
          const activeList = allActivities.filter((a) => !a.is_archived)
          if (activeList.length > 0) {
            void doStart({
              activity_id: activeList[0].id,
              project_id: null,
              description: null,
            })
          }
        }
        return
      }

      // 'N' for Manual Entry Modal
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        openManual(true)
        return
      }

      // '1'..'5' for Quick Start Top Activities
      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        const activeList = allActivities.filter((a) => !a.is_archived)
        if (activeList[idx] && !isBusy) {
          e.preventDefault()
          void doStart({
            activity_id: activeList[idx].id,
            project_id: null,
            description: null,
          })
        }
        return
      }

      // Two-key navigation chord: 'G' then key
      const now = Date.now()
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        lastGTime = now
        return
      }

      if (now - lastGTime < 1200 && !e.metaKey && !e.ctrlKey) {
        const k = e.key.toLowerCase()
        const navMap: Record<string, NavSection> = {
          o: 'overview',
          t: 'tracker',
          a: 'activities',
          p: 'projects',
          c: 'calendar',
          y: 'analytics',
          h: 'history',
          s: 'settings',
        }
        if (navMap[k]) {
          e.preventDefault()
          setNav(navMap[k])
          lastGTime = 0
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAuxView])

  const toggleWidget = useCallback(async () => {
    try {
      const next = await windowsApi.toggleWidget()
      setWidgetState(next)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to toggle widget', 'error')
    }
  }, [notify])

  const setWidgetAlwaysOnTop = useCallback(
    async (alwaysOnTop: boolean) => {
      try {
        const next = await windowsApi.setWidgetAlwaysOnTop(alwaysOnTop)
        setWidgetState(next)
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Unable to update widget pin state', 'error')
      }
    },
    [notify],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      loadingBoot,
      theme,
      setTheme,
      updateUser,
      activities,
      projects,
      reloadCatalogs,
      activeSession,
      elapsedSeconds,
      timerBusy,
      startTimer,
      pauseTimer,
      resumeTimer,
      stopTimer,
      updateRunningMeta,
      pendingSwitch,
      confirmSwitch,
      cancelSwitch,
      manualModalOpen,
      setManualModalOpen,
      commandOpen,
      setCommandOpen,
      shortcutsOpen,
      setShortcutsOpen,
      activeNav,
      setActiveNav,
      dataVersion,
      bumpDataVersion,
      toasts,
      notify,
      dismissToast,
      widgetState,
      toggleWidget,
      setWidgetAlwaysOnTop,
    }),
    [
      user,
      loadingBoot,
      theme,
      setTheme,
      updateUser,
      activities,
      projects,
      reloadCatalogs,
      activeSession,
      elapsedSeconds,
      timerBusy,
      startTimer,
      pauseTimer,
      resumeTimer,
      stopTimer,
      updateRunningMeta,
      pendingSwitch,
      confirmSwitch,
      cancelSwitch,
      manualModalOpen,
      commandOpen,
      shortcutsOpen,
      activeNav,
      dataVersion,
      bumpDataVersion,
      toasts,
      notify,
      dismissToast,
      widgetState,
      toggleWidget,
      setWidgetAlwaysOnTop,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
