import s from './topographic.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'
import type { VariantMeta } from '~/variants/types'

export default function Topographic() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>

      <div className={s.mapArea}>
        {/* Contour lines SVG */}
        <div className={s.contourLines}>
          <svg viewBox="0 0 390 400" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M-20 320 Q80 280 160 300 Q240 320 320 270 Q400 220 430 240" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.5"/>
            <path d="M-20 290 Q90 240 170 265 Q250 290 330 235 Q410 180 430 200" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.4"/>
            <path d="M-20 255 Q100 200 180 230 Q260 260 340 200 Q420 140 430 160" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.35"/>
            <path d="M-20 220 Q110 160 190 195 Q270 230 350 165 Q430 100 430 120" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.3"/>
            <path d="M-20 185 Q120 120 200 160 Q280 200 360 130 Q430 60 430 80" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.25"/>
            <path d="M-20 150 Q130 80 210 125 Q290 170 370 95 Q430 20 430 40" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.2"/>
            <path d="M-20 115 Q140 40 220 90 Q300 140 380 60 Q430 -20 430 0" stroke="#C9BFA8" strokeWidth="1" fill="none" opacity="0.15"/>
            {/* Highlight contour */}
            <path d="M-20 255 Q100 200 180 230 Q260 260 340 200 Q420 140 430 160" stroke="#2D6A4F" strokeWidth="1.5" fill="none" opacity="0.2"/>
          </svg>
        </div>

        <div className={`${s.mapGreen} ${s.green1}`}></div>
        <div className={`${s.mapGreen} ${s.green2}`}></div>
        <div className={s.mapWater}></div>
        <div className={`${s.mapRoad} ${s.roadH}`}></div>
        <div className={`${s.mapRoad} ${s.roadV}`}></div>

        <span className={`${s.elevLabel} ${s.elev1}`}>142m n.p.m.</span>
        <span className={`${s.elevLabel} ${s.elev2}`}>118m</span>

        <div className={s.radiusBadge}>
          <div className={s.dot}></div>
          2 km
        </div>

        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/96?img=12" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>

      <div className={s.sheet}>
        <div className={s.sheetHandleRow}><div className={s.sheetHandle}></div></div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}><strong>8</strong> OSOB W POBLIZU</div>
          <button className={s.sheetAction}>FILTRUJ</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/84?img=33" alt="" loading="lazy" /></div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Adam, 28</span>
                <span className="dist">~800m</span>
              </div>
              <div className="tags">
                <span className={`tag ${s.match}`}>pies</span>
                <span className={`tag ${s.match}`}>kregle</span>
                <span className="tag">bieganie</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" style={{ color: '#fff' }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/84?img=47" alt="" loading="lazy" /></div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Maja, 25</span>
                <span className="dist">~1.2 km</span>
              </div>
              <div className="tags">
                <span className={`tag ${s.match}`}>bieganie</span>
                <span className="tag">kawa</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" style={{ color: '#fff' }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/84?img=59" alt="" loading="lazy" /></div>
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
              <Icon name="wave" style={{ color: '#fff' }} />
            </div>
          </div>
        </div>
      </div>

      <div className={s.tabs}>
        <div className={`${s.tab} ${s.active}`}>
          <Icon name="pin" className={s.tabIcon} />
          <span>W okolicy</span>
        </div>
        <div className={s.tab}>
          <Icon name="wave" className={s.tabIcon} />
          <span>Zaczepki</span>
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

export const meta: VariantMeta = {
  id: 2,
  name: 'Topographic / Field Notes',
  tagline: 'Kontury terenu, notatki terenowe, mapa jako marka',
  inspiration: 'USGS maps, Field Notes brand, surveyors notebooks',
  features: [
    'Contour lines jako signature element, earthy palette (sand, green, brown)',
    'Space Mono monospace accents, dashed separators, notebook ruled lines',
    'Hashtag-prefixed tagi, okrągłe markery z ring shadows',
  ],
  uxAnalysis: [
    'Mapa IS marka — contour lines = tożsamość wizualna apki',
    'Field-notes aesthetic dodaje autentyczności odkrywaniu okolicy',
  ],
  uxPattern: 'Field-journal — odkrywanie ludzi to wpisy w dzienniku terenowym.',
}
