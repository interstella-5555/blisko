import type { VariantMeta } from '~/variants/types'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import s from './haute-couture.module.css'

export default function HauteCouture() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
      </div>
      <div className={s.mapArea}>
        <div className={s.mapLines}></div>
        <div className={s.radiusBadge}>2 km</div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/112?img=38" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>8 osob w poblizu</div>
          <button className={s.sheetAction}>Filtruj</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/96?img=33" alt="" loading="lazy" />
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
              <img src="https://i.pravatar.cc/96?img=47" alt="" loading="lazy" />
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
              <img src="https://i.pravatar.cc/96?img=59" alt="" loading="lazy" />
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
          <Icon name="pin" className="tabIcon" />
          <span>Obok</span>
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
  id: 12,
  name: 'Haute Couture / Fashion Editorial',
  tagline: 'Premium bez paywalla — szacunek dla profilu',
  inspiration: 'Jil Sander, Celine, Acne Studios, Apartamento',
  features: [
    'Ekstremalny whitespace, cienki serif italic (Playfair Display)',
    'Monochromatyczny + zloty akcent, duze kwadratowe zdjecia',
    'Minimalistyczny lookbook layout — mniej to wiecej',
  ],
  uxAnalysis: [
    'Sygnal jakosci — "to nie dating app", premium feel',
    'Profil jak strona w magazynie, nie karta w feedzie',
  ],
  uxPattern: 'Portrait-first — profil uzytkownika to editorial page, nie miniaturka.',
}
