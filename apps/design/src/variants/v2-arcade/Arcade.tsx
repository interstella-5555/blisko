import { PhoneFrame } from '~/components/PhoneFrame';
import { Icon } from '~/components/Icons';
import type { VariantMeta } from '~/variants/types';
import s from './arcade.module.css';

export default function Arcade() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className={s.xpBadge}>LVL 7 · 1240 XP</div>
      </div>
      <div className={s.mapArea}>
        <div className={s.rpgGrid}></div>
        <div className={`${s.terrain} ${s.terrain1}`}></div>
        <div className={`${s.terrain} ${s.terrain2}`}></div>
        <div className={`${s.terrain} ${s.terrain3}`}></div>
        <div className={s.radiusBadge}>2 km</div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/96?img=41" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>
            <strong>8</strong> encounters
          </div>
          <button className={s.sheetAction}>FILTR</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=33" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className={s.encounterTitle}>Dziki Adam pojawil sie!</div>
              <div className="nameRow">
                <span className="name">Adam, 28</span>
                <span className="dist">~800m</span>
              </div>
              <div className={s.compatBar}>
                <div className={`${s.compatFill} ${s.compatHigh}`} style={{ width: '85%' }}></div>
              </div>
              <div className="tags">
                <span className="tag match">pies</span>
                <span className="tag match">kregle</span>
                <span className="tag">bieganie</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="zap" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className={s.encounterTitle}>Dzika Maja pojawila sie!</div>
              <div className="nameRow">
                <span className="name">Maja, 25</span>
                <span className="dist">~1.2 km</span>
              </div>
              <div className={s.compatBar}>
                <div className={`${s.compatFill} ${s.compatMid}`} style={{ width: '60%' }}></div>
              </div>
              <div className="tags">
                <span className="tag match">bieganie</span>
                <span className="tag">kawa</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="zap" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className="avatar">
              <img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" />
            </div>
            <div className="info">
              <div className={s.encounterTitle}>Dziki Tomek pojawil sie!</div>
              <div className="nameRow">
                <span className="name">Tomek, 32</span>
                <span className="dist">~2.1 km</span>
              </div>
              <div className={s.compatBar}>
                <div className={`${s.compatFill} ${s.compatLow}`} style={{ width: '30%' }}></div>
              </div>
              <div className="tags">
                <span className="tag">sci-fi</span>
                <span className="tag">gry</span>
              </div>
            </div>
            <div className="waveBtn">
              <Icon name="zap" style={{ width: 18, height: 18 }} />
            </div>
          </div>
        </div>
      </div>
      <div className={s.tabs}>
        <div className={`${s.tab} ${s.active}`}>
          <Icon name="compass" className={s.tabIcon} />
          <span>Mapa</span>
        </div>
        <div className={s.tab}>
          <Icon name="zap" className={s.tabIcon} />
          <span>Fale</span>
        </div>
        <div className={s.tab}>
          <Icon name="chat" className={s.tabIcon} />
          <span>Czaty</span>
        </div>
        <div className={s.tab}>
          <Icon name="sword" className={s.tabIcon} />
          <span>Profil</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

export const meta: VariantMeta = {
  id: 13,
  name: 'Arcade / RPG Encounter',
  tagline: 'Gamifikacja bez tandetnosci — encounters z barem kompatybilnosci',
  inspiration: 'Pokemon encounters, Undertale, Strava badges',
  features: [
    'Chunky UI, neonowe kolory na ciemnym tle (green/orange/purple)',
    '"Encounter" karty z compatibility bar i XP badge',
    'Grid-based mapa z terrain patches, RPG-style markers',
  ],
  uxAnalysis: [
    'Achievement system motywuje — LVL + XP widoczne globalnie',
    'Compatibility bar daje wizualna informacje o dopasowaniu',
  ],
  uxPattern: 'Encounter mechanic — nowa osoba = RPG encounter z barem kompatybilnosci.',
};
