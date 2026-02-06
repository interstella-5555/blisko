import s from './color-palette.module.css'

const CORE_COLORS = [
  { name: 'Ink', var: '--ink', hex: '#1A1A1A', desc: 'Primary text, headlines, strong borders' },
  { name: 'Background', var: '--bg', hex: '#FAF7F2', desc: 'Paper / cream background', light: true },
  { name: 'Accent', var: '--accent', hex: '#C0392B', desc: 'Red accent, CTAs, active states' },
  { name: 'Rule', var: '--rule', hex: '#D5D0C4', desc: 'Dividers, thin borders, subtle lines', light: true },
  { name: 'Muted', var: '--muted', hex: '#8B8680', desc: 'Secondary text, labels, metadata' },
]

const EXTENDED_COLORS = [
  { name: 'Map Bg', hex: '#F0ECE3', desc: 'Map background surface', light: true },
  { name: 'Map Block', hex: '#E2DDD2', desc: 'Map building blocks', light: true },
  { name: 'Grid Line', hex: '#e0dbd0', desc: 'Map grid overlay', light: true },
]

const STATUS_COLORS = [
  { name: 'Success', hex: '#5B7A5E', bg: '#EEF2EE', desc: 'Accepted / confirmed', label: 'Zaakceptowano' },
  { name: 'Warning', hex: '#B8863E', bg: '#F5F0E6', desc: 'Pending / awaiting', label: 'Oczekuje' },
  { name: 'Error', hex: '#9B3B3B', bg: '#F2EEEE', desc: 'Declined / error', label: 'Odrzucono' },
]

export function ColorPalette() {
  return (
    <>
      <div className={s.group}>
        <h4 className={s.groupTitle}>Core Palette</h4>
        <div className={s.swatches}>
          {CORE_COLORS.map((c) => (
            <div key={c.hex} className={s.swatch}>
              <div
                className={s.swatchColor}
                style={{
                  background: c.hex,
                  border: c.light ? '1px solid var(--db-rule)' : 'none',
                }}
              />
              <div className={s.swatchMeta}>
                <span className={s.swatchName}>{c.name}</span>
                <code className={s.swatchHex}>{c.hex}</code>
              </div>
              <p className={s.swatchDesc}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={s.group}>
        <h4 className={s.groupTitle}>Extended — Map Surfaces</h4>
        <div className={s.swatches}>
          {EXTENDED_COLORS.map((c) => (
            <div key={c.hex} className={s.swatch}>
              <div
                className={s.swatchColor}
                style={{ background: c.hex, border: '1px solid var(--db-rule)' }}
              />
              <div className={s.swatchMeta}>
                <span className={s.swatchName}>{c.name}</span>
                <code className={s.swatchHex}>{c.hex}</code>
              </div>
              <p className={s.swatchDesc}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={s.group}>
        <h4 className={s.groupTitle}>Semantic — Status</h4>
        <div className={s.statusRow}>
          {STATUS_COLORS.map((c) => (
            <div key={c.hex} className={s.statusItem}>
              <div className={s.statusSwatch}>
                <div className={s.statusBadge} style={{ background: c.bg, color: c.hex }}>
                  {c.label}
                </div>
              </div>
              <div className={s.statusColors}>
                <div className={s.statusColorChip}>
                  <div className={s.miniChip} style={{ background: c.hex }} />
                  <code>{c.hex}</code>
                  <span className={s.chipLabel}>text</span>
                </div>
                <div className={s.statusColorChip}>
                  <div className={s.miniChip} style={{ background: c.bg, border: '1px solid var(--db-rule)' }} />
                  <code>{c.bg}</code>
                  <span className={s.chipLabel}>bg</span>
                </div>
              </div>
              <p className={s.swatchDesc}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
