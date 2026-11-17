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

const API_BASE =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE ??
  ''

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const res = await fetch(url, { ...options, headers })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
      const obj = parsed as { detail: unknown; code?: string }
      const detailMsg =
        typeof obj.detail === 'string'
          ? obj.detail
          : Array.isArray(obj.detail)
            ? obj.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join(', ')
            : 'Request failed'
      throw new ApiError(detailMsg, res.status, obj.code ?? 'api_error')
    }
    throw new ApiError(`HTTP ${res.status}`, res.status)
  }

  return parsed as T
}
