import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface-muted text-fg hover:bg-border border border-border',
  outline: 'bg-surface text-fg hover:bg-surface-muted border border-border',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-muted border border-transparent',
  danger: 'bg-danger-subtle text-danger hover:bg-danger hover:text-white border border-danger/25',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
  md: 'h-8 px-3 text-[13px] rounded-md gap-1.5',
  lg: 'h-9 px-4 text-sm rounded-md gap-2',
  icon: 'h-8 w-8 rounded-md p-0 justify-center',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}
