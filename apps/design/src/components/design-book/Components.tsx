import s from './components.module.css'
import { Icon } from '~/components/Icons'

export function Components() {
  return (
    <>
      {/* User Row */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>User Row (Nearby List Item)</h4>
        <div className={s.showcase}>
          {/* Default */}
          <div className={s.stateLabel}>Default</div>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=33" alt="" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Adam, 28</span>
                <span className={s.dist}>~800m</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>&#167; pies</span>
                <span className={`${s.tag} ${s.match}`}>&#167; kręgle</span>
                <span className={s.tag}>&#167; bieganie</span>
              </div>
            </div>
            <button className={s.waveBtn}>
              <Icon name="wave" style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* Waved */}
          <div className={s.stateLabel}>Waved</div>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=47" alt="" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Maja, 25</span>
                <span className={s.dist}>~1.2 km</span>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.match}`}>&#167; bieganie</span>
                <span className={s.tag}>&#167; kawa</span>
              </div>
            </div>
            <button className={`${s.waveBtn} ${s.waveBtnDone}`}>
              <Icon name="check" style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* Loading */}
          <div className={s.stateLabel}>Loading</div>
          <div className={s.userCard}>
            <div className={s.avatar}>
              <img src="https://i.pravatar.cc/80?img=59" alt="" />
            </div>
            <div className={s.info}>
              <div className={s.nameRow}>
                <span className={s.name}>Tomek, 32</span>
                <span className={s.dist}>~2.1 km</span>
              </div>
              <div className={s.tags}>
                <span className={s.tag}>&#167; sci-fi</span>
                <span className={s.tag}>&#167; gry</span>
              </div>
            </div>
            <button className={`${s.waveBtn} ${s.waveBtnLoading}`}>
              <span className={s.spinner} />
            </button>
          </div>
        </div>
      </div>

      {/* Wave Card */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Wave Card (Waves Tab)</h4>
        <div className={s.cardGrid}>
          {/* Received Pending */}
          <div className={s.cardWrapper}>
            <div className={s.stateLabel}>Received — Pending</div>
            <div className={s.waveCard}>
              <div className={s.waveHeader}>
                <div className={s.avatar}>
                  <img src="https://i.pravatar.cc/80?img=12" alt="" />
                </div>
                <div className={s.waveInfo}>
                  <span className={s.name}>Kasia, 24</span>
                  <span className={s.time}>2 godz. temu</span>
                </div>
              </div>
              <div className={s.waveMessage}>
                <em>Cześć! Też masz psa? Może kiedyś wybierzemy się na wspólny spacer?</em>
              </div>
              <div className={s.waveBio}>
                Studentka weterynarii, kocham zwierzęta i długie spacery.
              </div>
              <div className={s.waveActions}>
                <button className={s.actionDecline}>Odrzuć</button>
                <button className={s.actionAccept}>Zaakceptuj</button>
              </div>
            </div>
          </div>

          {/* Received Accepted */}
          <div className={s.cardWrapper}>
            <div className={s.stateLabel}>Received — Accepted</div>
            <div className={s.waveCard}>
              <div className={s.waveHeader}>
                <div className={s.avatar}>
                  <img src="https://i.pravatar.cc/80?img=45" alt="" />
                </div>
                <div className={s.waveInfo}>
                  <span className={s.name}>Piotr, 29</span>
                  <span className={s.time}>wczoraj</span>
                </div>
              </div>
              <div className={s.waveMessage}>
                <em>Hej, widzę że też grasz w kręgle!</em>
              </div>
              <div className={s.waveActions}>
                <button className={s.actionChat}>
                  <Icon name="chat" style={{ width: 14, height: 14 }} />
                  Napisz
                </button>
              </div>
            </div>
          </div>

          {/* Sent Pending */}
          <div className={s.cardWrapper}>
            <div className={s.stateLabel}>Sent — Pending</div>
            <div className={s.waveCard}>
              <div className={s.waveHeader}>
                <div className={s.avatar}>
                  <img src="https://i.pravatar.cc/80?img=22" alt="" />
                </div>
                <div className={s.waveInfo}>
                  <span className={s.name}>Ola, 26</span>
                  <span className={s.time}>5 min temu</span>
                </div>
                <span className={s.waveBadge} style={{ background: 'var(--db-warning-bg)', color: 'var(--db-warning)' }}>
                  Oczekuje
                </span>
              </div>
              <div className={s.waveMessage}>
                <em>Cześć! Lubię Twój profil</em>
              </div>
            </div>
          </div>

          {/* Sent Declined */}
          <div className={s.cardWrapper}>
            <div className={s.stateLabel}>Sent — Declined</div>
            <div className={s.waveCard}>
              <div className={s.waveHeader}>
                <div className={s.avatar}>
                  <img src="https://i.pravatar.cc/80?img=35" alt="" />
                </div>
                <div className={s.waveInfo}>
                  <span className={s.name}>Bartek, 31</span>
                  <span className={s.time}>2 dni temu</span>
                </div>
                <span className={s.waveBadge} style={{ background: 'var(--db-error-bg)', color: 'var(--db-error)' }}>
                  Odrzućono
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Bottom Sheet (Static Mockup)</h4>
        <div className={s.sheetDemo}>
          <div className={s.sheetHandle}><div className={s.handleBar} /></div>
          <div className={s.sheetHead}>
            <div className={s.sheetCount}>
              8 <span>osób w pobliżu</span>
            </div>
            <button className={s.sheetAction}>Filtruj</button>
          </div>
          <div className={s.sheetList}>
            {[
              { img: 33, name: 'Adam, 28', dist: '~800m', tags: ['pies', 'kręgle'], matches: [0, 1] },
              { img: 47, name: 'Maja, 25', dist: '~1.2 km', tags: ['bieganie', 'kawa'], matches: [0] },
            ].map((u, i) => (
              <div key={i} className={s.userCard}>
                <div className={s.avatar}>
                  <img src={`https://i.pravatar.cc/80?img=${u.img}`} alt="" />
                </div>
                <div className={s.info}>
                  <div className={s.nameRow}>
                    <span className={s.name}>{u.name}</span>
                    <span className={s.dist}>{u.dist}</span>
                  </div>
                  <div className={s.tags}>
                    {u.tags.map((t, ti) => (
                      <span key={t} className={`${s.tag} ${u.matches.includes(ti) ? s.match : ''}`}>
                        &#167; {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button className={s.waveBtn}>
                  <Icon name="wave" style={{ width: 18, height: 18 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Empty States */}
      <div className={s.group}>
        <h4 className={s.groupTitle}>Empty States</h4>
        <div className={s.emptyGrid}>
          <div className={s.emptyItem}>
            <div className={s.emptyIcon}>
              <Icon name="pin" style={{ width: 32, height: 32, color: 'var(--db-rule)' }} />
            </div>
            <h5 className={s.emptyTitle}>Nikt w pobliżu</h5>
            <p className={s.emptyText}>Nie znaleźliśmy nikogo w Twojej okolicy. Spróbuj ponownie później.</p>
          </div>
          <div className={s.emptyItem}>
            <div className={s.emptyIcon}>
              <Icon name="wave" style={{ width: 32, height: 32, color: 'var(--db-rule)' }} />
            </div>
            <h5 className={s.emptyTitle}>Brak zaczepień</h5>
            <p className={s.emptyText}>Gdy ktoś Cię zaczepi, zobaczysz to tutaj.</p>
          </div>
          <div className={s.emptyItem}>
            <div className={s.emptyIcon}>
              <Icon name="chat" style={{ width: 32, height: 32, color: 'var(--db-rule)' }} />
            </div>
            <h5 className={s.emptyTitle}>Brak czatów</h5>
            <p className={s.emptyText}>Zacznij rozmowę odpowiadając na zaczepienie.</p>
          </div>
        </div>
      </div>
    </>
  )
}
