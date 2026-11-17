import {
  Children,
  Fragment,
  isValidElement,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

const baseControl =
  'w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-subtle ' +
  'transition-colors focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 disabled:opacity-50'

const WRAPPER_TOKEN_RE =
  /^(?:(?:2xs|xs|sm|md|lg|xl|2xl):)*(?:w-|min-w-|max-w-|flex(?:$|-)|grow(?:$|-)|shrink(?:$|-)|basis-|col-span-|row-span-|self-|m-|mx-|my-|mt-|mr-|mb-|ml-)/

function splitSelectClassName(className?: string) {
  if (!className) return { wrapperTokens: [] as string[], visualTokens: [] as string[] }
  const wrapperTokens: string[] = []
  const visualTokens: string[] = []
  for (const token of className.trim().split(/\s+/)) {
    if (!token) continue
    if (WRAPPER_TOKEN_RE.test(token)) {
      wrapperTokens.push(token)
    } else {
      visualTokens.push(token)
    }
  }
  return { wrapperTokens, visualTokens }
}

function extractNodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (isValidElement(node)) {
    return extractNodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

interface ParsedOption {
  value: string
  label: string
}

function collectSelectOptions(children: ReactNode, out: ParsedOption[] = []): ParsedOption[] {
  Children.forEach(children, (child) => {
    if (!child || !isValidElement(child)) return
    if (child.type === Fragment) {
      collectSelectOptions((child.props as { children?: ReactNode }).children, out)
      return
    }
    if (child.type === 'option') {
      const optProps = child.props as { value?: string | number; children?: ReactNode }
      const label = extractNodeText(optProps.children)
      const val = optProps.value !== undefined ? String(optProps.value) : label
      out.push({ value: val, label })
      return
    }
    const nested = (child.props as { children?: ReactNode })?.children
    if (nested) {
      collectSelectOptions(nested, out)
    }
  })
  return out
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseControl, 'h-8', className)} {...props} />
}

export function Select({ className, children, onChange, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const { wrapperTokens, visualTokens } = splitSelectClassName(className)
  const hasBaseSizing = wrapperTokens.some((t) => /^(?:w-|flex-1$|flex-auto$|grow$)/.test(t))
  const [internalValue, setInternalValue] = useState(() =>
    props.defaultValue !== undefined ? String(props.defaultValue) : '',
  )

  const isControlled = props.value !== undefined
  const currentValue = isControlled ? String(props.value ?? '') : internalValue
  const options = collectSelectOptions(children)
  const matchedOption = options.find((opt) => opt.value === currentValue) ?? options[0]
  const displayLabel = matchedOption?.label ?? ''

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!isControlled) setInternalValue(e.target.value)
    onChange?.(e)
  }

  return (
    <div
      className={cn(
        'relative inline-flex min-w-0 items-center',
        !hasBaseSizing && 'w-full',
        wrapperTokens,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          baseControl,
          'flex h-8 w-full items-center justify-between gap-1.5 leading-normal',
          'peer-focus-visible:border-border-strong peer-focus-visible:ring-1 peer-focus-visible:ring-accent/30',
          'peer-disabled:opacity-50',
          visualTokens,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
      </div>
      <select
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer bg-surface text-fg opacity-0 disabled:cursor-not-allowed"
        onChange={handleChange}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseControl, 'py-2 min-h-[72px] resize-y', className)} {...props} />
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
