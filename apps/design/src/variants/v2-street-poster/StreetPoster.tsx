import s from './street-poster.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'

export default function StreetPoster() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className="stamp">Live</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.concreteBg}></div>
        <div className={`${s.poster} ${s.poster1}`}></div>
        <div className={`${s.poster} ${s.poster2}`}></div>
        <div className={`${s.poster} ${s.poster3}`}></div>
        <div className={s.radiusBadge}>2 km</div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/96?img=31" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>8 obok</div>
          <button className={s.sheetAction}>FILTRUJ</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=33" alt="" loading="lazy" />
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
              <img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Maja, 25</span>
                <span className="dist">~1.2km</span>
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
              <img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Tomek, 32</span>
                <span className="dist">~2.1km</span>
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
          <Icon name="pin" className="tabIcon" />
          <span>Ulica</span>
        </div>
        <div className={s.tab}>
          <Icon name="wave" className="tabIcon" />
          <span>Fale</span>
        </div>
        <div className={s.tab}>
          <Icon name="chat" className="tabIcon" />
          <span>Czaty</span>
        </div>
        <div className={s.tab}>
          <Icon name="person" className="tabIcon" />
          <span>Profil</span>
        </div>
      </div>
    </PhoneFrame>
  )
}

export const meta: VariantMeta = {
  id: 10,
  name: 'Street Poster / Wheat-paste',
  tagline: 'Odkrywanie ludzi jak plakatow na murach',
  inspiration: 'Plakaty na murach, punk zine, Shepard Fairey',
  features: [
    'Tekstury betonu/papieru, bold condensed type (Archivo Black)',
    'Lekko obrocene karty — kolaz warstw, stempelki',
    'Kontrastowe zdjecia z obnizonym kolorem',
  ],
  uxAnalysis: [
    'Street-level odkrywanie = odkrywanie plakatow, czujesz miasto',
    'Anti-korporacja = autentycznosc, wyroznia sie na rynku',
  ],
  uxPattern: 'Layered discovery — nowe profile "naklejaja sie" jak plakaty na murze.',
}
