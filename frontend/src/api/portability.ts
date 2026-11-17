import { apiRequest, isTauri, tauriInvoke } from './client'
import type { ImportResult } from '@/types'

export const portabilityApi = {
  exportUrl: (format: 'json' | 'csv') => `/api/export?format=${format}`,
  exportFile: async (format: 'json' | 'csv') => {
    const filename = `activity-export.${format}`
    if (isTauri()) {
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
      return
    }
    const a = document.createElement('a')
    a.href = `/api/export?format=${format}`
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  },
  importFile: async (file: File) => {
    if (isTauri()) {
      const content = await file.text()
      return tauriInvoke<ImportResult>('import_data', {
        filename: file.name,
        content,
      })
    }
    const formData = new FormData()
    formData.append('file', file)
    return apiRequest<ImportResult>('/api/import', {
      method: 'POST',
      body: formData,
    })
  },
}
