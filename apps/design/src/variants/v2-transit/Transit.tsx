import { PhoneFrame } from '~/components/PhoneFrame';
import { Icon } from '~/components/Icons';
import type { VariantMeta } from '~/variants/types';
import s from './transit.module.css';

export default function Transit() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className="lineLegend">
          <div className="lineDot" style={{ background: '#E53935' }}></div>
          <div className="lineDot" style={{ background: '#1E88E5' }}></div>
          <div className="lineDot" style={{ background: '#43A047' }}></div>
          <div className="lineDot" style={{ background: '#FDD835' }}></div>
        </div>
      </div>
      <div className={s.mapArea}>
        <div className={`${s.transitLine} ${s.tlRed}`}></div>
        <div className={`${s.transitLine} ${s.tlBlue}`}></div>
        <div className={`${s.transitLine} ${s.tlGreen}`}></div>
        <div className={`${s.transitLine} ${s.tlYellow}`}></div>
        <div className={`${s.stop} ${s.stopR1}`}></div>
        <div className={`${s.stop} ${s.stopR2}`}></div>
        <div className={`${s.stop} ${s.stopB1}`}></div>
        <div className={s.radiusBadge}>
          <div className="dot"></div> 2 km
        </div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/88?img=15" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>
            <strong>8</strong> w poblizu
          </div>
          <button className={s.sheetAction}>LINIE</button>
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
                <span className="tag matchRed">pies</span>
                <span className="tag matchRed">kregle</span>
                <span className="tag">bieganie</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Maja, 25</span>
                <span className="dist">~1.2 km</span>
              </div>
              <div className="tags">
                <span className="tag matchBlue">bieganie</span>
                <span className="tag">kawa</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className="nameRow">
                <span className="name">Tomek, 32</span>
                <span className="dist">~2.1 km</span>
              </div>
              <div className="tags">
                <span className="tag matchGreen">sci-fi</span>
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
          <Icon name="pin" className={s.tabIcon} />
          <span>Mapa</span>
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
  id: 5,
  name: 'Transit / Wayfinding',
  tagline: 'Nawiguj po liniach zainteresowań',
  inspiration: 'Vignelli NYC subway, japonskie stacje, Citymapper',
  features: [
    'Kolorowe linie metra — kazde zainteresowanie = inna linia',
    'Czarne UI z kolorowymi akcentami, strzalki kierunkowe',
    'Karty z kolorowym lewym paskiem (linia) i okraglymi przystankami',
  ],
  uxAnalysis: [
    'Lokalizacja to rdzen apki — wayfinding jest naturalny',
    'Wspolne zainteresowania = przesiadki — intuicyjna metafora',
  ],
  uxPattern: 'Interest-lines — jedziesz po liniach zainteresowań, wspolne linie = przesiadki.',
};
