import { tauriInvoke } from './client'
import type { ImportResult } from '@/types'

export const portabilityApi = {
  exportFile: async (format: 'json' | 'csv'): Promise<string | null> => {
    return tauriInvoke<string | null>('export_data_to_file', { format })
  },
  importFile: async (file: File) => {
    const content = await file.text()
    return tauriInvoke<ImportResult>('import_data', {
      filename: file.name,
      content,
    })
  },
}
