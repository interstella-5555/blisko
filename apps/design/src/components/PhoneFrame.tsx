import type { ReactNode } from 'react'

export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        width: 360,
        height: 780,
        borderRadius: 40,
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}
