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
        width: '100%',
        maxWidth: 402,
        aspectRatio: '402/874',
        borderRadius: 44,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {children}
    </div>
  )
}
