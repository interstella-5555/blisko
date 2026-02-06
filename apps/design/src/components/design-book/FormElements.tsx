import s from './form-elements.module.css'
import { Icon } from '~/components/Icons'

export function FormElements() {
  return (
    <>
      {/* Buttons */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Buttons</h4>
        <div className={s.buttonGrid}>
          <div className={s.buttonItem}>
            <div className={s.buttonLabel}>Primary (Wave)</div>
            <div className={s.buttonRow}>
              <button className={s.btnPrimary}>
                <Icon name="wave" style={{ width: 18, height: 18 }} />
              </button>
              <button className={`${s.btnPrimary} ${s.btnHover}`}>
                <Icon name="wave" style={{ width: 18, height: 18 }} />
              </button>
              <button className={`${s.btnPrimary} ${s.btnPressed}`}>
                <Icon name="wave" style={{ width: 18, height: 18 }} />
              </button>
              <button className={`${s.btnPrimary} ${s.btnDisabled}`}>
                <Icon name="wave" style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className={s.stateLabels}>
              <span>Default</span><span>Hover</span><span>Pressed</span><span>Disabled</span>
            </div>
          </div>

          <div className={s.buttonItem}>
            <div className={s.buttonLabel}>Accent Fill</div>
            <div className={s.buttonRow}>
              <button className={s.btnAccent}>Zaakceptuj</button>
              <button className={`${s.btnAccent} ${s.btnHover}`}>Zaakceptuj</button>
              <button className={`${s.btnAccent} ${s.btnPressed}`}>Zaakceptuj</button>
              <button className={`${s.btnAccent} ${s.btnDisabled}`}>Zaakceptuj</button>
            </div>
            <div className={s.stateLabels}>
              <span>Default</span><span>Hover</span><span>Pressed</span><span>Disabled</span>
            </div>
          </div>

          <div className={s.buttonItem}>
            <div className={s.buttonLabel}>Secondary (Ghost)</div>
            <div className={s.buttonRow}>
              <button className={s.btnSecondary}>Filtruj</button>
              <button className={`${s.btnSecondary} ${s.btnHover}`}>Filtruj</button>
              <button className={`${s.btnSecondary} ${s.btnPressed}`}>Filtruj</button>
              <button className={`${s.btnSecondary} ${s.btnDisabled}`}>Filtruj</button>
            </div>
            <div className={s.stateLabels}>
              <span>Default</span><span>Hover</span><span>Pressed</span><span>Disabled</span>
            </div>
          </div>

          <div className={s.buttonItem}>
            <div className={s.buttonLabel}>Destructive</div>
            <div className={s.buttonRow}>
              <button className={s.btnDestructive}>Odrzuć</button>
              <button className={`${s.btnDestructive} ${s.btnHover}`}>Odrzuć</button>
              <button className={`${s.btnDestructive} ${s.btnPressed}`}>Odrzuć</button>
              <button className={`${s.btnDestructive} ${s.btnDisabled}`}>Odrzuć</button>
            </div>
            <div className={s.stateLabels}>
              <span>Default</span><span>Hover</span><span>Pressed</span><span>Disabled</span>
            </div>
          </div>

          <div className={s.buttonItem}>
            <div className={s.buttonLabel}>Full Width</div>
            <div className={s.buttonRowFull}>
              <button className={s.btnFull}>Wyślij link</button>
              <button className={`${s.btnFull} ${s.btnDisabled}`}>Wyślij link</button>
            </div>
            <div className={s.stateLabels}>
              <span>Default</span><span>Disabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Input Fields */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Input Fields</h4>
        <div className={s.inputGrid}>
          <div className={s.inputItem}>
            <div className={s.inputLabel}>Text Input</div>
            <div className={s.inputDemo}>
              <label className={s.fieldLabel}>Imię</label>
              <div className={s.inputField}>Adam</div>
            </div>
            <div className={s.inputDemo}>
              <label className={s.fieldLabel}>Imię</label>
              <div className={`${s.inputField} ${s.inputEmpty}`}>Jak masz na imię?</div>
            </div>
          </div>

          <div className={s.inputItem}>
            <div className={s.inputLabel}>Email Input</div>
            <div className={s.inputDemo}>
              <label className={s.fieldLabel}>Email</label>
              <div className={s.inputField}>adam@example.com</div>
            </div>
          </div>

          <div className={s.inputItem}>
            <div className={s.inputLabel}>Textarea</div>
            <div className={s.inputDemo}>
              <label className={s.fieldLabel}>O mnie</label>
              <div className={s.textareaField}>
                Lubię długie spacery z psem po parku i kawę speciality w kameralnych miejscach.
                Szukam ludzi do wspólnych aktywności na świeże powietrze.
              </div>
              <div className={s.charCount}>142 / 500</div>
            </div>
          </div>

          <div className={s.inputItem}>
            <div className={s.inputLabel}>OTP Code</div>
            <div className={s.inputDemo}>
              <div className={s.otpRow}>
                <div className={`${s.otpDigit} ${s.otpFilled}`}>4</div>
                <div className={`${s.otpDigit} ${s.otpFilled}`}>8</div>
                <div className={`${s.otpDigit} ${s.otpFilled}`}>2</div>
                <div className={`${s.otpDigit} ${s.otpActive}`} />
                <div className={s.otpDigit} />
                <div className={s.otpDigit} />
              </div>
            </div>
            <div className={s.inputDemo}>
              <div className={s.otpRow}>
                <div className={`${s.otpDigit} ${s.otpError}`}>4</div>
                <div className={`${s.otpDigit} ${s.otpError}`}>8</div>
                <div className={`${s.otpDigit} ${s.otpError}`}>2</div>
                <div className={`${s.otpDigit} ${s.otpError}`}>9</div>
                <div className={`${s.otpDigit} ${s.otpError}`}>1</div>
                <div className={`${s.otpDigit} ${s.otpError}`}>0</div>
              </div>
              <p className={s.errorText}>Nieprawidłowy kod</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tags & Badges */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Tags &amp; Badges</h4>
        <div className={s.badgeGrid}>
          <div className={s.badgeItem}>
            <div className={s.badgeLabel}>Interest Tags</div>
            <div className={s.tagRow}>
              <span className={s.tag}>&#167; pies</span>
              <span className={`${s.tag} ${s.tagMatch}`}>&#167; kręgle</span>
              <span className={s.tag}>&#167; bieganie</span>
              <span className={`${s.tag} ${s.tagMatch}`}>&#167; kawa</span>
            </div>
            <p className={s.badgeNote}>Muted = no match, accent red + bold = match</p>
          </div>

          <div className={s.badgeItem}>
            <div className={s.badgeLabel}>Status Badges</div>
            <div className={s.tagRow}>
              <span className={s.statusBadge} style={{ background: 'var(--db-warning-bg)', color: 'var(--db-warning)' }}>Oczekuje</span>
              <span className={s.statusBadge} style={{ background: 'var(--db-success-bg)', color: 'var(--db-success)' }}>Zaakceptowano</span>
              <span className={s.statusBadge} style={{ background: 'var(--db-error-bg)', color: 'var(--db-error)' }}>Odrzućono</span>
            </div>
          </div>

          <div className={s.badgeItem}>
            <div className={s.badgeLabel}>Counter Badge</div>
            <div className={s.tagRow}>
              <span className={s.counterBadge}>3</span>
              <span className={`${s.counterBadge} ${s.counterMuted}`}>12</span>
            </div>
            <p className={s.badgeNote}>Accent for received, muted for sent</p>
          </div>

          <div className={s.badgeItem}>
            <div className={s.badgeLabel}>Distance Badge</div>
            <div className={s.tagRow}>
              <span className={s.distBadge}>~800m</span>
              <span className={s.distBadge}>~1.2 km</span>
              <span className={s.distBadge}>~2.1 km</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
