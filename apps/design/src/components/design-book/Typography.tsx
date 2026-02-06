import s from './typography.module.css'

const SERIF_SPECIMENS = [
  {
    label: 'Display',
    size: '28px',
    weight: '400',
    tracking: '2px',
    leading: '1.2',
    sample: 'MEET',
    samplePl: '8 osób w pobliżu',
  },
  {
    label: 'Heading',
    size: '18px',
    weight: '400',
    tracking: '0',
    leading: '1.3',
    sample: 'Instrument Serif',
    samplePl: 'Osoby w Twojej okolicy',
  },
  {
    label: 'Name',
    size: '15px',
    weight: '400',
    tracking: '0',
    leading: '1.4',
    sample: 'Adam, 28',
    samplePl: 'Maja, 25',
  },
  {
    label: 'Name Italic',
    size: '15px',
    weight: '400',
    tracking: '0',
    leading: '1.4',
    italic: true,
    sample: 'Instrument Serif Italic',
    samplePl: 'Szukam kogoś do wspólnych rozmów',
  },
]

const SANS_SPECIMENS = [
  {
    label: 'Body',
    size: '14px',
    weight: '400',
    tracking: '0',
    leading: '1.6',
    sample: 'DM Sans Regular',
    samplePl: 'Lubię długie spacery z psem po parku i kawę speciality w kameralnych miejscach.',
  },
  {
    label: 'Body Medium',
    size: '14px',
    weight: '500',
    tracking: '0',
    leading: '1.6',
    sample: 'DM Sans Medium',
    samplePl: 'Cześć! Też masz psa? Może kiedyś wybierzemy się na wspólny spacer?',
  },
  {
    label: 'Label',
    size: '10px',
    weight: '600',
    tracking: '2px',
    leading: '1.2',
    transform: 'uppercase',
    sample: 'FILTRUJ',
    samplePl: 'WYD. PORANNE \u00b7 5 LUT 2026 \u00b7 TWOJA OKOLICA',
  },
  {
    label: 'Button',
    size: '10px',
    weight: '600',
    tracking: '1px',
    leading: '1.2',
    transform: 'uppercase',
    sample: 'WYŚLIJ',
    samplePl: 'ZAAKCEPTUJ \u00b7 ODRZUĆ \u00b7 WYLOGUJ',
  },
  {
    label: 'Caption',
    size: '9px',
    weight: '400',
    tracking: '0.5px',
    leading: '1.4',
    sample: 'DM Sans Caption',
    samplePl: '\u00a7 pies \u00a7 kręgle \u00a7 bieganie \u00a7 kawa',
  },
  {
    label: 'Tab Label',
    size: '8px',
    weight: '500',
    tracking: '1px',
    leading: '1.2',
    transform: 'uppercase',
    sample: 'OBOK  FALE  CZATY  PROFIL',
    samplePl: 'W OKOLICY \u00b7 ZACZEPIENIA \u00b7 CZATY \u00b7 PROFIL',
  },
]

export function Typography() {
  return (
    <>
      <div className={s.family}>
        <div className={s.familyHeader}>
          <h4 className={s.familyName}>Instrument Serif</h4>
          <span className={s.familyRole}>Display \u00b7 Headings \u00b7 Names</span>
        </div>
        <div className={s.specimens}>
          {SERIF_SPECIMENS.map((spec) => (
            <div key={spec.label} className={s.specimen}>
              <div className={s.specMeta}>
                <span className={s.specLabel}>{spec.label}</span>
                <span className={s.specDetails}>
                  {spec.size} / {spec.leading} / {spec.weight}
                  {spec.tracking !== '0' && ` / ls ${spec.tracking}`}
                </span>
              </div>
              <p
                className={s.specSample}
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: spec.size,
                  fontWeight: Number(spec.weight),
                  letterSpacing: spec.tracking,
                  lineHeight: spec.leading,
                  fontStyle: spec.italic ? 'italic' : 'normal',
                }}
              >
                {spec.samplePl}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={s.family}>
        <div className={s.familyHeader}>
          <h4 className={s.familyName}>DM Sans</h4>
          <span className={s.familyRole}>Body \u00b7 Labels \u00b7 Buttons \u00b7 UI</span>
        </div>
        <div className={s.specimens}>
          {SANS_SPECIMENS.map((spec) => (
            <div key={spec.label} className={s.specimen}>
              <div className={s.specMeta}>
                <span className={s.specLabel}>{spec.label}</span>
                <span className={s.specDetails}>
                  {spec.size} / {spec.leading} / {spec.weight}
                  {spec.tracking !== '0' && ` / ls ${spec.tracking}`}
                  {spec.transform && ` / ${spec.transform}`}
                </span>
              </div>
              <p
                className={s.specSample}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: spec.size,
                  fontWeight: Number(spec.weight),
                  letterSpacing: spec.tracking,
                  lineHeight: spec.leading,
                  textTransform: (spec.transform as React.CSSProperties['textTransform']) || 'none',
                }}
              >
                {spec.samplePl}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
