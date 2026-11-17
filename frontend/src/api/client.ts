import { invoke } from '@tauri-apps/api/core'

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code = 'api_error') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (err) {
    if (err && typeof err === 'object' && 'message' in err) {
      const obj = err as { message: string; status?: number; code?: string }
      throw new ApiError(obj.message, obj.status ?? 400, obj.code ?? 'tauri_error')
    }
    throw new ApiError(String(err), 500, 'tauri_error')
  }
}
