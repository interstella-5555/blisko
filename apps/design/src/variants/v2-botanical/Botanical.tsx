import s from './botanical.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'

export const meta: VariantMeta = {
  id: 8,
  name: 'Botanical / Specimen Card',
  tagline: 'Odkrywanie ludzi = zbieranie okazow',
  inspiration: 'Naukowa ilustracja, karty gatunkow, Ernst Haeckel',
  features: [
    'Drobne rysunki linii, kremowe tlo, zielony tusz',
    'Uklad kart gatunkow z etykieta, sepia-filtr zdjec',
    'Tagi jako klasyfikacja taksonomiczna (italic + kursywa)',
  ],
  uxAnalysis: [
    'Eleganckie, unikalne karty — herbarium relacji',
    'Naukowy ton dodaje powagi odkrywaniu ludzi',
  ],
  uxPattern: 'Collection — kazde polaczenie to nowy gatunek w Twojej kolekcji.',
}

export default function Botanical() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className="subtitle">Herbarium</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.botanicalBg}>
          <svg viewBox="0 0 336 290" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M40 260 Q60 200 90 180 Q120 160 100 120 Q80 80 110 50" stroke="rgba(45,95,62,0.1)" strokeWidth="1" fill="none"/>
            <path d="M100 120 Q130 130 150 110" stroke="rgba(45,95,62,0.08)" strokeWidth="1" fill="none"/>
            <path d="M100 120 Q90 140 70 145" stroke="rgba(45,95,62,0.08)" strokeWidth="1" fill="none"/>
            <circle cx="110" cy="50" r="8" stroke="rgba(45,95,62,0.06)" fill="none"/>
            <path d="M250 270 Q240 220 260 180 Q280 140 250 100 Q220 60 240 30" stroke="rgba(45,95,62,0.1)" strokeWidth="1" fill="none"/>
            <path d="M260 180 Q290 175 300 190" stroke="rgba(45,95,62,0.08)" strokeWidth="1" fill="none"/>
            <path d="M250 100 Q220 90 215 75" stroke="rgba(45,95,62,0.08)" strokeWidth="1" fill="none"/>
          </svg>
        </div>
        <div className={`${s.mapBlock} ${s.mapBlock1}`}></div>
        <div className={`${s.mapBlock} ${s.mapBlock2}`}></div>
        <div className={s.radiusBadge}>
          <div className="dot"></div> 2 km
        </div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/88?img=25" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>
            <strong>8</strong> okazow w poblizu
          </div>
          <button className={s.sheetAction}>Filtruj</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/84?img=33" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Adam, 28</span>
                <span className="dist">~800m</span>
              </div>
              <div className="tags">
                <span className="tag match">pies</span>
                <span className="tag match">kregle</span>
                <span className="tag">bieganie</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/84?img=47" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Maja, 25</span>
                <span className="dist">~1.2 km</span>
              </div>
              <div className="tags">
                <span className="tag match">bieganie</span>
                <span className="tag">kawa</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/84?img=59" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Tomek, 32</span>
                <span className="dist">~2.1 km</span>
              </div>
              <div className="tags">
                <span className="tag">sci-fi</span>
                <span className="tag">gry</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" />
            </div>
          </div>
        </div>
      </div>
      <div className={s.tabs}>
        <div className={`${s.tab} active`}>
          <Icon name="leaf" className={s.tabIcon} />
          <span>Okolica</span>
        </div>
        <div className={s.tab}>
          <Icon name="wave" className={s.tabIcon} />
          <span>Fale</span>
        </div>
        <div className={s.tab}>
          <Icon name="chat" className={s.tabIcon} />
          <span>Czaty</span>
        </div>
        <div className={s.tab}>
          <Icon name="person" className={s.tabIcon} />
          <span>Profil</span>
        </div>
      </div>
    </PhoneFrame>
  )
}
