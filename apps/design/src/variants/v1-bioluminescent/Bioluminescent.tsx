import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'
import s from './bioluminescent.module.css'

export const meta: VariantMeta = {
  id: 3,
  name: 'Bioluminescent',
  tagline: 'Zywy mrok, swiecace akcenty, organiczne formy',
  inspiration: 'Deep sea creatures, Aurora Borealis, neon fungi',
  features: [
    'Dark base z luminous accents (cyan, purple, green) — glow effects',
    'Organic flowing shapes, wave-top sheet, pulsing location marker',
    'Backdrop-blur glass morphism, gradient wave buttons',
  ],
  uxAnalysis: [
    'Dark mode done right — glow creates depth and hierarchy',
    'Living/breathing feel — pulse animation shows active presence',
  ],
  uxPattern: 'Living-dark — interfejs oddycha i świeci, ludzie to bioluminescencyjne organizmy.',
}

export default function Bioluminescent() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>9:41</div>

      <div className={s.mapArea}>
        <div className={s.mapMesh}></div>
        <div className={s.mapLines}></div>
        <div className={s.glowZone}></div>

        <div className={s.radiusBadge}>
          <div className="dot"></div>
          2 km
        </div>

        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/100?img=12" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>

      <div className={s.sheet}>
        <svg
          className={s.sheetWave}
          viewBox="0 0 390 20"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 20 Q50 0 100 12 Q160 24 220 8 Q280 -4 340 14 Q370 22 390 16 L390 20 Z" fill="#0F1318" />
        </svg>
        <div className={s.sheetBody}>
          <div className={s.sheetHandleRow}>
            <div className={s.sheetHandle}></div>
          </div>
          <div className={s.sheetHead}>
            <div className={s.sheetCount}>
              <strong>8</strong> osob w poblizu
            </div>
            <button className={s.sheetAction}>Filtruj</button>
          </div>
          <div className={s.userList}>
            <div className={s.userCard}>
              <div className="avatar">
                <img src="https://i.pravatar.cc/88?img=33" alt="" loading="lazy" />
              </div>
              <div className="info">
                <div className="nameRow">
                  <span className="name">Adam, 28</span>
                  <span className="dist">~800m</span>
                </div>
                <div className="tags">
                  <span className={`tag ${s.tagCyan}`}>pies</span>
                  <span className={`tag ${s.tagPurple}`}>kregle</span>
                  <span className={`tag ${s.tagMatch}`}>3 wspolne</span>
                </div>
              </div>
              <div className="waveBtn">
                <Icon name="wave" style={{ color: 'var(--glow1)' }} />
              </div>
            </div>

            <div className={s.userCard}>
              <div className="avatar">
                <img src="https://i.pravatar.cc/88?img=47" alt="" loading="lazy" />
              </div>
              <div className="info">
                <div className="nameRow">
                  <span className="name">Maja, 25</span>
                  <span className="dist">~1.2 km</span>
                </div>
                <div className="tags">
                  <span className={`tag ${s.tagGreen}`}>bieganie</span>
                  <span className={`tag ${s.tagPurple}`}>kawa</span>
                </div>
              </div>
              <div className="waveBtn">
                <Icon name="wave" style={{ color: 'var(--glow1)' }} />
              </div>
            </div>

            <div className={s.userCard}>
              <div className="avatar">
                <img src="https://i.pravatar.cc/88?img=59" alt="" loading="lazy" />
              </div>
              <div className="info">
                <div className="nameRow">
                  <span className="name">Tomek, 32</span>
                  <span className="dist">~2.1 km</span>
                </div>
                <div className="tags">
                  <span className={`tag ${s.tagCyan}`}>sci-fi</span>
                  <span className={`tag ${s.tagGreen}`}>gry</span>
                </div>
              </div>
              <div className="waveBtn">
                <Icon name="wave" style={{ color: 'var(--glow1)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.tabs}>
        <div className={`${s.tab} ${s.active}`}>
          <Icon name="pin" className="tabIcon" />
          <span>W okolicy</span>
        </div>
        <div className={s.tab}>
          <Icon name="wave" className="tabIcon" />
          <span>Zaczepki</span>
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
