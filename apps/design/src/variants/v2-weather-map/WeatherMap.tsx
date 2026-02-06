import { PhoneFrame } from '~/components/PhoneFrame';
import { Icon } from '~/components/Icons';
import type { VariantMeta } from '~/variants/types';
import s from './weather-map.module.css';

export default function WeatherMap() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className="temp">HOT SPOTS · 23°</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.isobars}>
          <svg viewBox="0 0 360 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M-20 250 Q80 200 160 220 Q240 240 320 190 Q380 150 400 170" stroke="rgba(0,188,212,0.15)" strokeWidth="1" fill="none"/>
            <path d="M-20 210 Q90 160 170 185 Q250 210 330 155 Q400 110 420 130" stroke="rgba(0,188,212,0.12)" strokeWidth="1" fill="none"/>
            <path d="M-20 170 Q100 120 180 150 Q260 180 340 120 Q400 70 420 90" stroke="rgba(0,188,212,0.1)" strokeWidth="1" fill="none"/>
            <path d="M-20 130 Q110 80 190 115 Q270 150 350 85 Q400 30 420 50" stroke="rgba(0,188,212,0.08)" strokeWidth="1" fill="none"/>
            <path d="M-20 90 Q120 40 200 80 Q280 120 360 50" stroke="rgba(0,188,212,0.06)" strokeWidth="1" fill="none"/>
          </svg>
        </div>
        <div className={`${s.heatZone} ${s.heat1}`}></div>
        <div className={`${s.heatZone} ${s.heat2}`}></div>
        <div className={`${s.heatZone} ${s.heat3}`}></div>
        <div className={`${s.pressureMark} ${s.markH}`}>H</div>
        <div className={`${s.pressureMark} ${s.markL}`}>L</div>
        <div className={s.radiusBadge}>
          <div className="dot"></div> 2 km
        </div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/88?img=18" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}><div className={s.sheetHandle}></div></div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}><strong>8</strong> w poblizu</div>
          <button className={s.sheetAction}>FILTRUJ</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/80?img=33" alt="" loading="lazy" /></div>
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
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" /></div>
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
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className="avatar"><img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" /></div>
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
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
        </div>
      </div>

      <div className={s.tabs}>
        <div className={`${s.tab} ${s.active}`}>
          <Icon name="compass" className={s.tabIcon} />
          <span>Pogoda</span>
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
  );
}

export const meta: VariantMeta = {
  id: 6,
  name: 'Weather Map / Meteorological',
  tagline: 'Social weather — gestosc ludzi jako pogoda',
  inspiration: 'NOAA, mapy pogodowe TV, izobary',
  features: [
    'Izobary wokol skupisk ludzi, gradienty temperatury',
    'Navy + cyan + amber — weather-station aesthetic',
    'Markery H/L pokazuja gestosc aktywnosci',
  ],
  uxAnalysis: [
    'Hot spots = gorace miejsca, intuicyjne odczytywanie aktywnosci',
    'Mapa pogodowa to znany mental model — natychmiastowe zrozumienie',
  ],
  uxPattern: 'Density-as-weather — mapa pokazuje "klimat spoleczny" okolicy.',
};
