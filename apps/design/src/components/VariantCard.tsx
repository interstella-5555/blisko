import type { ReactNode } from 'react'
import type { VariantMeta } from '~/variants/types'
import { VariantDescription } from './VariantDescription'

export function VariantCard({
  meta,
  children,
  index,
}: {
  meta: VariantMeta
  children: ReactNode
  index: number
}) {
  const isEven = index % 2 === 1
  return (
    <div className={`variant-section${isEven ? ' variant-section-reverse' : ''}`}>
      {children}
      <VariantDescription meta={meta} />
    </div>
  )
}
