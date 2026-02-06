import s from './newspaper.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'

export const meta: VariantMeta = {
  id: 4,
  name: 'Newspaper / Editorial',
  tagline: 'Content-first — ludzie czytaja, nie swajpuja',
  inspiration: 'Monocle, Kinfolk, NYT',
  features: [
    'Serif headings (Instrument Serif), cienkie rules, kolumnowy uklad',
    'Czerwony akcent na kremowym tle — notki prasowe zamiast kart',
    'Tagi jako rubryki ogloszeniowe z symbolem §',
  ],
  uxAnalysis: [
    'Powaznie i dorosle — odcina od dating-appow',
    'Ludzie CZYTAJA opisy zamiast scrollowac karty',
  ],
  uxPattern: 'Profil = artykul do przeczytania, nie karta do swajpniecia.',
}

export default function Newspaper() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.masthead}>
        <h1>MEET</h1>
        <div className={s.edition}>Wyd. poranne · 5 lut 2026 · Twoja okolica</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.mapGrid}></div>
        <div className={`${s.mapBlock} ${s.mapBlock1}`}></div>
        <div className={`${s.mapBlock} ${s.mapBlock2}`}></div>
        <div className={`${s.mapBlock} ${s.mapBlock3}`}></div>
        <div className={`${s.mapRoad} ${s.roadH1}`}></div>
        <div className={`${s.mapRoad} ${s.roadV1}`}></div>
        <div className={s.radiusBadge}>
          <div className={s.dot}></div> 2 km
        </div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/84?img=12" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>
            8 <span>osob w poblizu</span>
          </div>
          <button className={s.sheetAction}>Filtruj</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=33" alt="" loading="lazy" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Adam, 28</span>
                <span className={s.dist}>~800m</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>pies</span>
                <span className={`${s.tag} ${s.match}`}>kregle</span>
                <span className={s.tag}>bieganie</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" />
            </div>
          </div>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Maja, 25</span>
                <span className={s.dist}>~1.2 km</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>bieganie</span>
                <span className={s.tag}>kawa</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" />
            </div>
          </div>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Tomek, 32</span>
                <span className={s.dist}>~2.1 km</span>
              </div>
              <div className={s.tags}>
                <span className={s.tag}>sci-fi</span>
                <span className={s.tag}>gry</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" />
            </div>
          </div>
        </div>
      </div>
      <div className={s.tabs}>
        <div className={`${s.tab} ${s.active}`}>
          <Icon name="pin" className={s.tabIcon} />
          <span>Obok</span>
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
