import s from './screens.module.css'
import { PhoneFrame } from '~/components/PhoneFrame'
import { Icon } from '~/components/Icons'

function StatusBar() {
  return <div className={s.statusBar}>09:41</div>
}

function TabBar({ active = 0 }: { active?: number }) {
  const tabs = [
    { icon: 'pin', label: 'Blisko' },
    { icon: 'wave', label: 'Zaczepienia' },
    { icon: 'chat', label: 'Czaty' },
    { icon: 'person', label: 'Profil' },
  ]
  return (
    <div className={s.tabs}>
      {tabs.map((t, i) => (
        <div key={t.label} className={`${s.tab} ${i === active ? s.tabActive : ''}`}>
          <Icon name={t.icon} style={{ width: 20, height: 20 }} />
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

function ScreenLabel({ children }: { children: React.ReactNode }) {
  return <div className={s.screenLabel}>{children}</div>
}

function LoginScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Login</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.loginBody}>
          <div className={s.loginMasthead}>
            <h1 className={s.loginTitle}>BLISKO</h1>
            <div className={s.loginEdition}>Wyd. poranne &middot; Twoja okolica</div>
          </div>
          <div className={s.loginForm}>
            <label className={s.label}>Email</label>
            <div className={s.inputField}>adam@example.com</div>
            <button className={s.btnFull}>Wyślij link</button>
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}

function OtpScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>OTP Verification</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.otpBody}>
          <div className={s.otpIcon}>
            <Icon name="send" style={{ width: 32, height: 32, color: 'var(--db-rule)' }} />
          </div>
          <h2 className={s.otpTitle}>Wpisz kod</h2>
          <p className={s.otpText}>
            Wysłaliśmy 6-cyfrowy kod na
          </p>
          <p className={s.otpEmail}>adam@example.com</p>
          <div className={s.otpRow}>
            <div className={`${s.otpDigit} ${s.otpFilled}`}>4</div>
            <div className={`${s.otpDigit} ${s.otpFilled}`}>8</div>
            <div className={`${s.otpDigit} ${s.otpFilled}`}>2</div>
            <div className={s.otpDigit} />
            <div className={s.otpDigit} />
            <div className={s.otpDigit} />
          </div>
          <p className={s.otpResend}>Wyślij ponownie za 0:42</p>
          <button className={s.backBtn}>&larr; Powrót</button>
        </div>
      </PhoneFrame>
    </div>
  )
}

function OnboardingScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Onboarding (Step 1 of 3)</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.onboardBody}>
          <div className={s.stepIndicator}>1 / 3</div>
          <h2 className={s.onboardTitle}>Jak masz na imię?</h2>
          <p className={s.onboardSub}>Twoje imię będzie widoczne dla innych osób w pobliżu.</p>
          <label className={s.label}>Imię</label>
          <div className={s.inputField}>Adam</div>
          <div className={s.onboardSpacer} />
          <button className={s.btnFull}>Dalej</button>
        </div>
      </PhoneFrame>
    </div>
  )
}

function WavesReceivedScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Waves — Received</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.wavesHeader}>
          <h1 className={s.wavesTitle}>Zaczepienia</h1>
        </div>
        <div className={s.waveTabBar}>
          <div className={`${s.waveTab} ${s.waveTabActive}`}>
            Odebrane <span className={s.tabBadge}>3</span>
          </div>
          <div className={s.waveTab}>
            Wysłane <span className={s.tabBadgeMuted}>5</span>
          </div>
        </div>
        <div className={s.wavesList}>
          <div className={s.wCard}>
            <div className={s.wCardHead}>
              <div className={s.wAvatar}>
                <img src="https://i.pravatar.cc/80?img=12" alt="" />
              </div>
              <div className={s.wInfo}>
                <span className={s.wName}>Kasia, 24</span>
                <span className={s.wTime}>2 godz. temu</span>
              </div>
            </div>
            <div className={s.wMsg}><em>Cześć! Też masz psa?</em></div>
            <div className={s.wActions}>
              <button className={s.wDecline}>Odrzuć</button>
              <button className={s.wAccept}>Zaakceptuj</button>
            </div>
          </div>
          <div className={s.wCard}>
            <div className={s.wCardHead}>
              <div className={s.wAvatar}>
                <img src="https://i.pravatar.cc/80?img=45" alt="" />
              </div>
              <div className={s.wInfo}>
                <span className={s.wName}>Piotr, 29</span>
                <span className={s.wTime}>wczoraj</span>
              </div>
            </div>
            <div className={s.wMsg}><em>Gramy w kręgle?</em></div>
            <div className={s.wActions}>
              <button className={s.wDecline}>Odrzuć</button>
              <button className={s.wAccept}>Zaakceptuj</button>
            </div>
          </div>
        </div>
        <TabBar active={1} />
      </PhoneFrame>
    </div>
  )
}

function WavesSentScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Waves — Sent</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.wavesHeader}>
          <h1 className={s.wavesTitle}>Zaczepienia</h1>
        </div>
        <div className={s.waveTabBar}>
          <div className={s.waveTab}>
            Odebrane <span className={s.tabBadge}>3</span>
          </div>
          <div className={`${s.waveTab} ${s.waveTabActive}`}>
            Wysłane <span className={s.tabBadgeMuted}>5</span>
          </div>
        </div>
        <div className={s.wavesList}>
          <div className={s.wCard}>
            <div className={s.wCardHead}>
              <div className={s.wAvatar}>
                <img src="https://i.pravatar.cc/80?img=22" alt="" />
              </div>
              <div className={s.wInfo}>
                <span className={s.wName}>Ola, 26</span>
                <span className={s.wTime}>5 min temu</span>
              </div>
              <span className={s.wBadgePending}>Oczekuje</span>
            </div>
            <div className={s.wMsg}><em>Cześć! Lubię Twój profil</em></div>
          </div>
          <div className={s.wCard}>
            <div className={s.wCardHead}>
              <div className={s.wAvatar}>
                <img src="https://i.pravatar.cc/80?img=60" alt="" />
              </div>
              <div className={s.wInfo}>
                <span className={s.wName}>Zuza, 23</span>
                <span className={s.wTime}>1 godz. temu</span>
              </div>
              <span className={s.wBadgeAccepted}>Zaakceptowano</span>
            </div>
          </div>
          <div className={s.wCard}>
            <div className={s.wCardHead}>
              <div className={s.wAvatar}>
                <img src="https://i.pravatar.cc/80?img=35" alt="" />
              </div>
              <div className={s.wInfo}>
                <span className={s.wName}>Bartek, 31</span>
                <span className={s.wTime}>2 dni temu</span>
              </div>
              <span className={s.wBadgeDeclined}>Odrzućono</span>
            </div>
          </div>
        </div>
        <TabBar active={1} />
      </PhoneFrame>
    </div>
  )
}

function ChatListScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Chats — List</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.wavesHeader}>
          <h1 className={s.wavesTitle}>Czaty</h1>
        </div>
        <div className={s.chatList}>
          <div className={s.chatRow}>
            <div className={s.chatRowAvatar}>
              <img src="https://i.pravatar.cc/80?img=12" alt="" />
            </div>
            <div className={s.chatRowContent}>
              <div className={s.chatRowTop}>
                <span className={s.chatRowName}>Kasia, 24</span>
              </div>
              <div className={s.chatRowMsg}>Cześć! Też masz psa? 🐕</div>
            </div>
            <div className={s.chatRowMeta}>
              <span className={s.chatRowTime}>2 min</span>
              <span className={s.chatUnread}>2</span>
            </div>
          </div>
          <div className={s.chatRow}>
            <div className={s.chatRowAvatar}>
              <img src="https://i.pravatar.cc/80?img=60" alt="" />
            </div>
            <div className={s.chatRowContent}>
              <div className={s.chatRowTop}>
                <span className={s.chatRowName}>Zuza, 23</span>
              </div>
              <div className={s.chatRowMsg}>Super, to do zobaczenia!</div>
            </div>
            <div className={s.chatRowMeta}>
              <span className={s.chatRowTime}>1 godz.</span>
            </div>
          </div>
          <div className={s.chatRow}>
            <div className={s.chatRowAvatar}>
              <img src="https://i.pravatar.cc/80?img=45" alt="" />
            </div>
            <div className={s.chatRowContent}>
              <div className={s.chatRowTop}>
                <span className={s.chatRowName}>Piotr, 29</span>
              </div>
              <div className={s.chatRowMsg}>Udostępniona lokalizacja</div>
            </div>
            <div className={s.chatRowMeta}>
              <span className={s.chatRowTime}>wczoraj</span>
            </div>
          </div>
        </div>
        <TabBar active={2} />
      </PhoneFrame>
    </div>
  )
}

function ChatConversationScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Chat — Conversation</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <div className={s.chatConvLayout}>
          <StatusBar />
          <div className={s.chatConvHeader}>
            <Icon name="arrow-left" style={{ width: 16, height: 16 }} />
            <div className={s.chatConvHeaderAvatar}>
              <img src="https://i.pravatar.cc/80?img=12" alt="" />
            </div>
            <span className={s.chatConvName}>Kasia, 24</span>
            <Icon name="search" style={{ width: 16, height: 16, color: 'var(--db-muted)' }} />
          </div>
          <div className={s.chatMessages}>
            {/* Date separator */}
            <div className={s.dateSeparator}>Dzisiaj</div>

            {/* Kasia group 1 */}
            <div className={`${s.messageGroup} ${s.messageGroupTheirs}`}>
              <div className={s.messageRow}>
                <div className={s.avatarSpacer} />
                <div className={`${s.bubble} ${s.bubbleTheirs} ${s.bubbleFirst}`}>
                  Hej! Co tam? 👋
                </div>
              </div>
              <div className={s.messageRow}>
                <div className={s.chatConvAvatar}>
                  <img src="https://i.pravatar.cc/80?img=12" alt="" />
                </div>
                <div className={`${s.bubble} ${s.bubbleTheirs} ${s.bubbleLast}`}>
                  Widziałam że mieszkasz blisko
                </div>
              </div>
              <div className={`${s.groupTime} ${s.groupTimeTheirs}`}>14:22</div>
            </div>

            {/* My group 1 */}
            <div className={`${s.messageGroup} ${s.messageGroupMine} ${s.groupGap}`}>
              <div className={`${s.bubble} ${s.bubbleMine} ${s.bubbleFirst}`}>
                Cześć!
              </div>
              <div className={`${s.bubble} ${s.bubbleMine} ${s.bubbleMid}`}>
                Tak, jestem na Mokotowie
              </div>
              <div className={`${s.bubble} ${s.bubbleMine} ${s.bubbleLast}`}>
                A Ty?
              </div>
              <div className={`${s.groupTime} ${s.groupTimeMine}`}>
                14:24 <span className={`${s.bubbleCheck} ${s.bubbleCheckRead}`}>✓✓</span>
              </div>
            </div>

            {/* Kasia group 2 */}
            <div className={`${s.messageGroup} ${s.messageGroupTheirs} ${s.groupGap}`}>
              <div className={s.messageRow}>
                <div className={s.avatarSpacer} />
                <div className={`${s.bubble} ${s.bubbleTheirs} ${s.bubbleFirst}`}>
                  Ja też! Pole Mokotowskie to mój ulubiony park
                </div>
              </div>
              <div className={s.messageRow}>
                <div className={s.chatConvAvatar}>
                  <img src="https://i.pravatar.cc/80?img=12" alt="" />
                </div>
                <div className={`${s.bubble} ${s.bubbleTheirs} ${s.bubbleLast}`}>
                  Chodzisz tam ze swoim psem? 🐕
                </div>
              </div>
              <div className={`${s.groupTime} ${s.groupTimeTheirs}`}>14:30</div>
            </div>

            {/* My reply */}
            <div className={`${s.messageGroup} ${s.messageGroupMine} ${s.groupGap}`}>
              <div className={`${s.bubble} ${s.bubbleMine} ${s.bubbleSolo}`}>
                <div className={s.bubbleReply}>
                  <span className={s.bubbleReplyName}>Kasia</span>
                  <br />Chodzisz tam ze swoim psem? 🐕
                </div>
                Tak! Prawie codziennie ☀️
              </div>
              <div className={`${s.groupTime} ${s.groupTimeMine}`}>
                14:32 <span className={`${s.bubbleCheck} ${s.bubbleCheckRead}`}>✓✓</span>
              </div>
            </div>

            {/* Kasia solo with reaction */}
            <div className={`${s.messageGroup} ${s.messageGroupTheirs} ${s.groupGap}`}>
              <div className={s.messageRow}>
                <div className={s.chatConvAvatar}>
                  <img src="https://i.pravatar.cc/80?img=12" alt="" />
                </div>
                <div className={`${s.bubble} ${s.bubbleTheirs} ${s.bubbleSolo}`}>
                  Super! Może się kiedyś spotkamy na spacerze?
                  <div className={s.bubbleReactions}>
                    <span className={s.reactionChip}>❤️</span>
                  </div>
                </div>
              </div>
              <div className={s.reactionSpacer} />
              <div className={`${s.groupTime} ${s.groupTimeTheirs}`}>14:33</div>
            </div>

            {/* My response */}
            <div className={`${s.messageGroup} ${s.messageGroupMine} ${s.groupGap}`}>
              <div className={`${s.bubble} ${s.bubbleMine} ${s.bubbleSolo}`}>
                Chętnie! Może w weekend?
              </div>
              <div className={`${s.groupTime} ${s.groupTimeMine}`}>
                14:34 <span className={s.bubbleCheck}>✓</span>
              </div>
            </div>

            {/* Typing indicator */}
            <div className={`${s.typingIndicator} ${s.groupGap}`}>pisze...</div>
          </div>
          <div className={s.chatInputBar}>
            <div className={s.chatInputIcons}>
              <div className={s.chatInputIcon}>
                <Icon name="camera" style={{ width: 18, height: 18 }} />
              </div>
              <div className={s.chatInputIcon}>
                <Icon name="pin" style={{ width: 18, height: 18 }} />
              </div>
            </div>
            <div className={s.chatInputField}>Wpisz wiadomość...</div>
            <button className={s.chatInputSend}>Wyślij</button>
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}

function ChatEmptyScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Chats — Empty State</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.wavesHeader}>
          <h1 className={s.wavesTitle}>Czaty</h1>
        </div>
        <div className={s.emptyState}>
          <Icon name="chat" style={{ width: 32, height: 32, color: 'var(--db-rule)' }} />
          <h3 className={s.emptyTitle}>Brak czatów</h3>
          <p className={s.emptyText}>Zacznij rozmowę odpowiadając na zaczepienie.</p>
        </div>
        <TabBar active={2} />
      </PhoneFrame>
    </div>
  )
}

function ProfileScreen() {
  return (
    <div className={s.screenCol}>
      <ScreenLabel>Profile</ScreenLabel>
      <PhoneFrame className={s.phoneFrame}>
        <StatusBar />
        <div className={s.profileBody}>
          <div className={s.profileHead}>
            <div className={s.profileAvatar}>
              <img src="https://i.pravatar.cc/200?img=33" alt="" />
            </div>
            <h2 className={s.profileName}>Adam, 28</h2>
            <p className={s.profileEmail}>adam@example.com</p>
          </div>
          <div className={s.profileSection}>
            <h4 className={s.profileSectionTitle}>O mnie</h4>
            <p className={s.profileText}>
              Lubię długie spacery z psem po parku i kawę speciality
              w kameralnych miejscach. Fan sci-fi i planszówek.
            </p>
          </div>
          <div className={s.profileSection}>
            <h4 className={s.profileSectionTitle}>Kogo szukam</h4>
            <p className={s.profileText}>
              Szukam ludzi do wspólnych aktywności — spacery, kawa,
              a może wspólne granie w planszówki.
            </p>
          </div>
          <button className={s.logoutBtn}>Wyloguj się</button>
        </div>
        <TabBar active={3} />
      </PhoneFrame>
    </div>
  )
}

export function Screens({ onlyFirstRow }: { onlyFirstRow?: boolean }) {
  if (onlyFirstRow) {
    return (
      <div className={s.screenRow}>
        <LoginScreen />
        <OtpScreen />
        <ProfileScreen />
        <WavesReceivedScreen />
      </div>
    )
  }
  return (
    <>
      <div className={s.screenRow}>
        <LoginScreen />
        <OtpScreen />
        <OnboardingScreen />
      </div>
      <div className={s.screenRow}>
        <WavesReceivedScreen />
        <WavesSentScreen />
      </div>
      <div className={s.screenRow}>
        <ChatEmptyScreen />
        <ChatListScreen />
        <ChatConversationScreen />
      </div>
      <div className={s.screenRow}>
        <ProfileScreen />
      </div>
    </>
  )
}
