import s from './patterns.module.css'

export function Patterns() {
  return (
    <>
      {/* Rule Styles */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Rule Styles</h4>
        <div className={s.rules}>
          <div className={s.ruleRow}>
            <span className={s.ruleLabel}>Hairline</span>
            <div className={s.ruleLine} style={{ borderBottom: '1px solid var(--db-rule)' }} />
            <code className={s.ruleCode}>1px solid #D5D0C4</code>
          </div>
          <div className={s.ruleRow}>
            <span className={s.ruleLabel}>Section</span>
            <div className={s.ruleLine} style={{ borderBottom: '1px solid var(--db-ink)' }} />
            <code className={s.ruleCode}>1px solid #1A1A1A</code>
          </div>
          <div className={s.ruleRow}>
            <span className={s.ruleLabel}>Double</span>
            <div className={s.ruleLine} style={{ borderBottom: '3px double var(--db-ink)' }} />
            <code className={s.ruleCode}>3px double #1A1A1A</code>
          </div>
          <div className={s.ruleRow}>
            <span className={s.ruleLabel}>Heavy</span>
            <div className={s.ruleLine} style={{ borderBottom: '2px solid var(--db-ink)' }} />
            <code className={s.ruleCode}>2px solid #1A1A1A</code>
          </div>
          <div className={s.ruleRow}>
            <span className={s.ruleLabel}>Tab Bar</span>
            <div className={s.ruleLine} style={{ borderBottom: '2px solid var(--db-ink)' }} />
            <code className={s.ruleCode}>2px solid #1A1A1A (top border)</code>
          </div>
        </div>
      </div>

      {/* Tag Prefix Pattern */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Tag Prefix Pattern</h4>
        <div className={s.tagDemo}>
          <div className={s.tagRow}>
            <span className={s.tag}><span className={s.tagPrefix}>&#167; </span>pies</span>
            <span className={s.tag}><span className={s.tagPrefix}>&#167; </span>kregle</span>
            <span className={s.tagMatch}><span className={s.tagPrefix}>&#167; </span>bieganie</span>
            <span className={s.tag}><span className={s.tagPrefix}>&#167; </span>kawa</span>
          </div>
          <p className={s.tagNote}>
            The section mark &#167; prefixes interest tags, evoking editorial taxonomy.
            Matched interests use accent red with bold weight.
          </p>
        </div>
      </div>

      {/* Map Grid Pattern */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Map Grid Pattern</h4>
        <div className={s.mapGridDemo}>
          <div className={s.mapGridInner} />
          <div className={s.mapBlock} style={{ top: 20, left: 30, width: 80, height: 50 }} />
          <div className={s.mapBlock} style={{ top: 90, left: 140, width: 60, height: 40 }} />
          <div className={s.mapRoad} style={{ top: 75, left: 0, right: 0, height: 5 }} />
        </div>
        <p className={s.patternNote}>
          40px repeating grid at 50% opacity on #F0ECE3 — building blocks in #E2DDD2 — roads in #FAF7F2
        </p>
      </div>

      {/* Decorative Elements */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Decorative Elements</h4>
        <div className={s.decoGrid}>
          <div className={s.decoItem}>
            <div className={s.avatarDemo}>
              <img src="https://i.pravatar.cc/80?img=33" alt="" className={s.avatarImg} />
            </div>
            <span className={s.decoLabel}>Avatar</span>
            <code className={s.decoCode}>grayscale(30%), 1px rule border</code>
          </div>
          <div className={s.decoItem}>
            <div className={s.badgeDemo}>
              <span className={s.radiusBadge}>
                <span className={s.dot} /> 2 km
              </span>
            </div>
            <span className={s.decoLabel}>Radius Badge</span>
            <code className={s.decoCode}>bg + rule border + accent dot</code>
          </div>
          <div className={s.decoItem}>
            <div className={s.handleDemo}>
              <div className={s.handle} />
            </div>
            <span className={s.decoLabel}>Sheet Handle</span>
            <code className={s.decoCode}>32px wide, 3px, #D5D0C4</code>
          </div>
          <div className={s.decoItem}>
            <div className={s.markerDemo}>
              <div className={s.markerGroup}>5</div>
              <div className={s.markerSmall}>2</div>
              <div className={s.markerAvatar}>
                <img src="https://i.pravatar.cc/42?img=12" alt="" />
              </div>
            </div>
            <span className={s.decoLabel}>Map Markers</span>
            <code className={s.decoCode}>group (accent), small (ink), avatar</code>
          </div>
        </div>
      </div>
    </>
  )
}
