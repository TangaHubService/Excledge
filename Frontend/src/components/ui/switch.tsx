'use client'

import { AppToggle } from './AppToggle'
import type { AppToggleColor, AppToggleSize } from './AppToggle'

/**
 * Back-compat shim: every existing call site in the app was written against Radix's raw Switch API
 * (`onCheckedChange`).
 */
export interface SwitchProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  size?: AppToggleSize
  color?: AppToggleColor
  id?: string
  name?: string
  className?: string
}

function Switch({ checked = false, onCheckedChange, ...props }: SwitchProps) {
  return <AppToggle checked={checked} onChange={onCheckedChange} {...props} />
}

export { Switch }
