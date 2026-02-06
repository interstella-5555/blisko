import { PhoneFrame } from '~/components/PhoneFrame';
import { Icon } from '~/components/Icons';
import type { VariantMeta } from '~/variants/types';
import s from './dithered.module.css';

export default function Dithered() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.menuBar}>
        <span>Meet</span>
        <span>Plik</span>
        <span>Widok</span>
        <span>Pomoc</span>
      </div>

      <div className={s.mapArea}>
        <div className={s.pixelGrid}></div>
        <div className={s.ditherOverlay}></div>
        <div className={`${s.mapBlock} ${s.mapBlock1}`}></div>
        <div className={`${s.mapBlock} ${s.mapBlock2}`}></div>
        <div className={`${s.mapBlock} ${s.mapBlock3}`}></div>
        <div className={`${s.mapRoad} ${s.roadH1}`}></div>
        <div className={`${s.mapRoad} ${s.roadV1}`}></div>

        <div className={s.radiusBadge}>
          <div className={s.dot}></div> 2km
        </div>

        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/88?img=22" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>

      <div className={s.sheet}>
        <div className={s.sheetHandleRow}>
          <div className={s.sheetHandle}></div>
        </div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>8 w poblizu</div>
          <button className={s.sheetAction}>[FILTRUJ]</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/72?img=33" alt="" loading="lazy" />
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
              <Icon name="wave" style={{ width: 16, height: 16 }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/72?img=47" alt="" loading="lazy" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Maja, 25</span>
                <span className={s.dist}>~1.2km</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>bieganie</span>
                <span className={s.tag}>kawa</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" style={{ width: 16, height: 16 }} />
            </div>
          </div>

          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/72?img=59" alt="" loading="lazy" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Tomek, 32</span>
                <span className={s.dist}>~2.1km</span>
              </div>
              <div className={s.tags}>
                <span className={s.tag}>sci-fi</span>
                <span className={s.tag}>gry</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" style={{ width: 16, height: 16 }} />
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
  id: 7,
  name: 'Dithered / 1-Bit Retro',
  tagline: 'Privacy-by-design — rozmyta tozsamosc z nostalgia',
  inspiration: 'Poolside FM, wczesny Mac, Obra Dinn',
  features: [
    '1-bit dithered zdjecia, pixel-grid ramki, System 7 menu bar',
    '2-3 kolory, monospace everywhere, ostre prostokatne ksztalty',
    'Zdjecia w grayscale z podwyzsonym kontrastem',
  ],
  uxAnalysis: [
    'Privacy-by-design — dithered = rozmyta tozsamosc, buduje ciekawosc',
    'Nostalgia = cieplo, nic takiego nie istnieje na rynku',
  ],
  uxPattern: 'Progressive reveal — zdjecia wyostrzaja sie w miare budowania polaczenia.',
};
