import s from './constellation.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'

export const meta: VariantMeta = {
  id: 11,
  name: 'Constellation / Star Chart',
  tagline: 'Gwiazdy ktorych nie zauwazyles',
  inspiration: 'Mapy astronomiczne, celestial navigation, planetarium',
  features: [
    'Indygo (#0C1445), ludzie=gwiazdy, polaczenia=linie konstelacji',
    'Dot-grid, cienki sans-serif (Sora 300), zloty akcent',
    'Jasnosc gwiazd = aktywnosc uzytkownikow',
  ],
  uxAnalysis: [
    'Poetycka metafora — Twoja siec to unikalna konstelacja',
    'Grupy zainteresowań jako konstelacje polaczone liniami',
  ],
  uxPattern: 'Connections-as-constellations — Twoja siec = unikalna konstelacja na niebie.',
}

export default function Constellation() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className={s.coord}>52°13'N 21°00'E</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.dotGrid}></div>
        <div className={s.stars}>
          <div className={s.star} style={{ top: '30px', left: '40px' }}></div>
          <div className={s.star} style={{ top: '60px', left: '120px' }}></div>
          <div className={`${s.star} ${s.bright}`} style={{ top: '45px', left: '200px' }}></div>
          <div className={s.star} style={{ top: '90px', left: '280px' }}></div>
          <div className={s.star} style={{ top: '120px', left: '60px' }}></div>
          <div className={`${s.star} ${s.bright}`} style={{ top: '160px', left: '300px' }}></div>
          <div className={s.star} style={{ top: '190px', left: '30px' }}></div>
          <div className={s.star} style={{ top: '220px', left: '180px' }}></div>
          <div className={`${s.star} ${s.bright}`} style={{ top: '250px', left: '100px' }}></div>
          <div className={s.star} style={{ top: '270px', left: '240px' }}></div>
          <div className={s.star} style={{ top: '80px', left: '320px' }}></div>
          <div className={s.star} style={{ top: '240px', left: '320px' }}></div>
        </div>
        <div className={s.constellationLines}>
          <svg viewBox="0 0 360 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="175" y1="98" x2="265" y2="138" stroke="rgba(108,140,213,0.2)" strokeWidth="1"/>
            <line x1="175" y1="98" x2="85" y2="208" stroke="rgba(108,140,213,0.15)" strokeWidth="1"/>
            <line x1="265" y1="138" x2="305" y2="168" stroke="rgba(108,140,213,0.12)" strokeWidth="1"/>
          </svg>
        </div>
        <div className={s.radiusBadge}><div className={s.dot}></div> 2 km</div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/92?img=35" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}><strong>8</strong> gwiazd w poblizu</div>
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
        <div className={`${s.tab} active`}>
          <Icon name="star" className={s.tabIcon} />
          <span>Niebo</span>
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
