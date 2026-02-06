import s from './iconography.module.css'
import { Icon } from '~/components/Icons'

const ICONS = [
  { name: 'wave', label: 'Wave' },
  { name: 'pin', label: 'Pin' },
  { name: 'chat', label: 'Chat' },
  { name: 'person', label: 'Person' },
  { name: 'filter', label: 'Filter' },
  { name: 'star', label: 'Star' },
  { name: 'compass', label: 'Compass' },
  { name: 'zap', label: 'Zap' },
  { name: 'leaf', label: 'Leaf' },
  { name: 'grid', label: 'Grid' },
  { name: 'sword', label: 'Sword' },
  { name: 'check', label: 'Check' },
  { name: 'x', label: 'Decline' },
  { name: 'send', label: 'Send' },
  { name: 'clock', label: 'Clock' },
  { name: 'location-arrow', label: 'Location' },
  { name: 'settings', label: 'Settings' },
  { name: 'arrow-left', label: 'Back' },
  { name: 'search', label: 'Search' },
  { name: 'heart', label: 'Heart' },
]

const SIZES = [16, 24, 32] as const

export function Iconography() {
  return (
    <div className={s.grid}>
      {ICONS.map((icon) => (
        <div key={icon.name} className={s.item}>
          <div className={s.sizes}>
            {SIZES.map((size) => (
              <Icon
                key={size}
                name={icon.name}
                style={{ width: size, height: size, color: 'var(--db-ink)' }}
              />
            ))}
          </div>
          <span className={s.label}>{icon.label}</span>
          <code className={s.code}>{icon.name}</code>
        </div>
      ))}
    </div>
  )
}
