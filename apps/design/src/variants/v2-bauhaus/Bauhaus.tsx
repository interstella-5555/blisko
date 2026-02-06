import { PhoneFrame } from '~/components/PhoneFrame';
import { Icon } from '~/components/Icons';
import type { VariantMeta } from '~/variants/types';
import s from './bauhaus.module.css';

export default function Bauhaus() {
  return (
    <PhoneFrame className={s.phoneFrame}>
      <div className={s.statusBar}>09:41</div>
      <div className={s.headerBar}>
        <h1>Meet</h1>
        <div className={s.legend}>
          <div className={s.legendBlock} style={{ background: '#E53935' }}></div>
          <div className={s.legendBlock} style={{ background: '#1565C0' }}></div>
          <div className={s.legendBlock} style={{ background: '#FDD835' }}></div>
        </div>
      </div>
      <div className={s.mapArea}>
        <div className={`${s.mondrianCell} ${s.mc1}`}></div>
        <div className={`${s.mondrianCell} ${s.mc2}`}></div>
        <div className={`${s.mondrianCell} ${s.mc3}`}></div>
        <div className={`${s.mondrianCell} ${s.mc4}`}></div>
        <div className={`${s.mondrianCell} ${s.mc5}`}></div>
        <div className={`${s.mondrianCell} ${s.mc6}`}></div>
        <div className={s.radiusBadge}>2 km</div>
        <div className={`${s.marker} ${s.markerGroup}`}>5</div>
        <div className={`${s.marker} ${s.markerSmall}`}>2</div>
        <div className={`${s.marker} ${s.markerAvatar}`}>
          <img src="https://i.pravatar.cc/96?img=28" alt="" loading="lazy" />
        </div>
        <div className={s.myLoc}></div>
      </div>
      <div className={s.sheet}>
        <div className={s.sheetHandleRow}><div className={s.sheetHandle}></div></div>
        <div className={s.sheetHead}>
          <div className={s.sheetCount}>8 W POBLIZU</div>
          <button className={s.sheetAction}>FILTR</button>
        </div>
        <div className={s.userList}>
          <div className={s.userCard}>
            <div className={s.avatar}><img src="https://i.pravatar.cc/80?img=33" alt="" loading="lazy" /></div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Adam, 28</span>
                <span className={s.dist}>~800m</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>PIES</span>
                <span className={`${s.tag} ${s.match}`}>KREGLE</span>
                <span className={s.tag}>BIEGANIE</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className={s.avatar}><img src="https://i.pravatar.cc/80?img=47" alt="" loading="lazy" /></div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Maja, 25</span>
                <span className={s.dist}>~1.2 km</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>BIEGANIE</span>
                <span className={s.tag}>KAWA</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          <div className={s.userCard}>
            <div className={s.avatar}><img src="https://i.pravatar.cc/80?img=59" alt="" loading="lazy" /></div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Tomek, 32</span>
                <span className={s.dist}>~2.1 km</span>
              </div>
              <div className={s.tags}>
                <span className={s.tag}>SCI-FI</span>
                <span className={s.tag}>GRY</span>
              </div>
            </div>
            <div className={s.waveBtn}>
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </div>
          </div>
        </div>
      </div>
      <div className={s.tabs}>
        <div className={`${s.tab} active`}>
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
  id: 9,
  name: 'Bauhaus / De Stijl',
  tagline: '3 kolory, scisly grid, geometryczna rownowaga',
  inspiration: 'Mondrian, Kandinsky, Swiss Style',
  features: [
    '3 kolory primarne + czarny + bialy, Mondrian-grid mapa',
    'Grube linie, asymetryczna rownowaga, geometryczne ksztalty',
    'Prostokaty i kwadraty zamiast zaokraglonych rogow',
  ],
  uxAnalysis: [
    'Grid idealny dla mapy — 3 kolory = jasna hierarchia',
    'Art-movement nigdy nie widziany w social appach',
  ],
  uxPattern: 'Color=meaning — czerwony=blisko, zolty=zainteresowanie, niebieski=polaczenie.',
};
