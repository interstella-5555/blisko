import s from './layout-rules.module.css'

const SPACING = [
  { px: 4, name: 'Hairline', usage: 'Handle bar height, micro gaps' },
  { px: 6, name: 'Tick', usage: 'Tag gaps, icon-text gaps' },
  { px: 8, name: 'Tight', usage: 'Inner padding, badge padding' },
  { px: 10, name: 'Compact', usage: 'User card padding, input padding' },
  { px: 12, name: 'Gutter', usage: 'Card internal gaps, avatar-info gap' },
  { px: 16, name: 'Column', usage: 'Horizontal content margin, section padding' },
  { px: 24, name: 'Section', usage: 'Major section padding, form spacing' },
  { px: 32, name: 'Block', usage: 'Screen top padding, between sections' },
]

export function LayoutRules() {
  return (
    <>
      {/* Spacing Scale */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Spacing Scale</h4>
        <div className={s.spacingList}>
          {SPACING.map((sp) => (
            <div key={sp.px} className={s.spacingRow}>
              <div className={s.spacingVisual}>
                <div className={s.spacingBar} style={{ width: sp.px * 4 }} />
              </div>
              <code className={s.spacingPx}>{sp.px}px</code>
              <span className={s.spacingName}>{sp.name}</span>
              <span className={s.spacingUsage}>{sp.usage}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Layout Rules */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Layout Rules</h4>
        <div className={s.ruleGrid}>
          <div className={s.ruleItem}>
            <div className={s.ruleTitle}>Content Margins</div>
            <div className={s.ruleDiagram}>
              <div className={s.marginDemo}>
                <div className={s.marginLine} />
                <div className={s.marginContent}>
                  <span>16px</span>
                  Content Area
                  <span>16px</span>
                </div>
                <div className={s.marginLine} />
              </div>
            </div>
            <p className={s.ruleDesc}>All screen content uses 16px horizontal margins, newspaper-style columns within.</p>
          </div>

          <div className={s.ruleItem}>
            <div className={s.ruleTitle}>Section Dividers</div>
            <div className={s.ruleDiagram}>
              <div className={s.dividerDemo}>
                <div className={s.dividerLine} style={{ borderBottom: '3px double var(--db-ink)' }}>
                  <span>Masthead — 3px double</span>
                </div>
                <div className={s.dividerLine} style={{ borderBottom: '1px solid var(--db-ink)' }}>
                  <span>Section — 1px solid ink</span>
                </div>
                <div className={s.dividerLine} style={{ borderBottom: '1px solid var(--db-rule)' }}>
                  <span>Item — 1px solid rule</span>
                </div>
              </div>
            </div>
            <p className={s.ruleDesc}>Three-tier hierarchy: double for masthead, solid ink for sections, rule for items.</p>
          </div>

          <div className={s.ruleItem}>
            <div className={s.ruleTitle}>Tab Bar</div>
            <div className={s.ruleDiagram}>
              <div className={s.tabBarDemo}>
                <div className={s.tabBarBorder}>2px solid ink</div>
                <div className={s.tabBarBody}>
                  <span>75px height</span>
                  <span className={s.tabBarLabel}>8PX UPPERCASE LABELS</span>
                </div>
              </div>
            </div>
            <p className={s.ruleDesc}>Fixed 75px bottom tab bar with 2px top border in ink color.</p>
          </div>

          <div className={s.ruleItem}>
            <div className={s.ruleTitle}>Bottom Sheet</div>
            <div className={s.ruleDiagram}>
              <div className={s.snapDemo}>
                <div className={s.snapLine} style={{ top: '15%' }}>
                  <span>Peek — 90px</span>
                </div>
                <div className={s.snapLine} style={{ top: '55%' }}>
                  <span>Half — 45%</span>
                </div>
                <div className={s.snapLine} style={{ top: '85%' }}>
                  <span>Expanded — 85%</span>
                </div>
              </div>
            </div>
            <p className={s.ruleDesc}>Three snap points: peek (handle visible), half (list browsing), expanded (full list).</p>
          </div>
        </div>
      </div>

      {/* Motion Guidelines */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Motion Guidelines</h4>
        <div className={s.motionGrid}>
          <div className={s.motionItem}>
            <div className={s.motionTitle}>Spring Configuration</div>
            <div className={s.motionValues}>
              <div className={s.motionValue}>
                <span className={s.motionLabel}>Damping</span>
                <code>20</code>
              </div>
              <div className={s.motionValue}>
                <span className={s.motionLabel}>Stiffness</span>
                <code>200</code>
              </div>
              <div className={s.motionValue}>
                <span className={s.motionLabel}>Mass</span>
                <code>0.8</code>
              </div>
            </div>
            <p className={s.motionDesc}>Critically damped — arrives quickly without overshoot or bounce.</p>
          </div>
          <div className={s.motionItem}>
            <div className={s.motionTitle}>Transition Principles</div>
            <ul className={s.motionList}>
              <li>Subtle fades and slide-ups only</li>
              <li>No bouncy or playful animations</li>
              <li>Reserved, calm editorial feel</li>
              <li>Sheet drag uses velocity-aware snapping</li>
              <li>Press states: scale(0.95-0.98)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Do / Don't */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Do &amp; Don&apos;t</h4>
        <div className={s.doGrid}>
          <div className={s.doItem}>
            <div className={s.doHeader}>Do</div>
            <ul className={s.doList}>
              <li>Thin 1px rules between items</li>
              <li>Serif names (Instrument Serif)</li>
              <li>Muted, desaturated status tones</li>
              <li>SVG stroke icons in editorial weight</li>
              <li>Grayscale-tinted avatars</li>
              <li>&#167; section-mark prefix on tags</li>
              <li>Uppercase DM Sans labels</li>
              <li>Cream background, ink text</li>
            </ul>
          </div>
          <div className={s.dontItem}>
            <div className={s.dontHeader}>Don&apos;t</div>
            <ul className={s.doList}>
              <li>Emoji icons (no more emoji tab labels)</li>
              <li>Bright saturated colors (#007AFF, #4CAF50)</li>
              <li>Bouncy spring animations</li>
              <li>Rounded pill-shaped buttons</li>
              <li>Sans-serif for display headings</li>
              <li>White backgrounds with colored accents</li>
              <li>Drop shadows on cards</li>
              <li>Playful UI language or tone</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
