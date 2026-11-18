import { tauriInvoke } from './client'
import type { WidgetState } from '@/types'

export const windowsApi = {
  openMain: () => tauriInvoke<void>('open_main_window'),
  hidePopover: () => tauriInvoke<void>('hide_popover_window'),
  toggleWidget: () => tauriInvoke<WidgetState>('toggle_widget_window'),
  setWidgetVisible: (visible: boolean) => tauriInvoke<WidgetState>('set_widget_visible', { visible }),
  getWidgetState: () => tauriInvoke<WidgetState>('get_widget_state'),
  setWidgetAlwaysOnTop: (alwaysOnTop: boolean) =>
    tauriInvoke<WidgetState>('set_widget_always_on_top', { alwaysOnTop }),
  getAutostartEnabled: () => tauriInvoke<boolean>('get_autostart_enabled'),
  setAutostartEnabled: (enabled: boolean) =>
    tauriInvoke<boolean>('set_autostart_enabled', { enabled }),
}
