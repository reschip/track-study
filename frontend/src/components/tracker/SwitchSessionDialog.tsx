import { ConfirmDialog } from '@/components/ui/Dialog'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

export function SwitchSessionDialog() {
  const { activeSession, elapsedSeconds, pendingSwitch, confirmSwitch, cancelSwitch, timerBusy } =
    useApp()

  if (!pendingSwitch || !activeSession) return null

  return (
    <ConfirmDialog
      open={Boolean(pendingSwitch)}
      onClose={cancelSwitch}
      onConfirm={() => void confirmSwitch()}
      title="Switch active timer?"
      description={`"${activeSession.activity.name}" is currently ${activeSession.status} (${formatTimerClock(elapsedSeconds)}). Finishing it will save that session and start "${pendingSwitch.nextActivityName}".`}
      confirmLabel={`Finish & start ${pendingSwitch.nextActivityName}`}
      loading={timerBusy}
    />
  )
}
