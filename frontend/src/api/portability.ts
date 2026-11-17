import { tauriInvoke } from './client'
import type { ImportResult } from '@/types'

export const portabilityApi = {
  exportFile: async (format: 'json' | 'csv') => {
    const filename = `activity-export.${format}`
    const content = await tauriInvoke<string>('export_data', { format })
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  importFile: async (file: File) => {
    const content = await file.text()
    return tauriInvoke<ImportResult>('import_data', {
      filename: file.name,
      content,
    })
  },
}
