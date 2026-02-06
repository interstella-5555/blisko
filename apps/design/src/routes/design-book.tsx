import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import s from './design-book.module.css'
import { ColorPalette } from '~/components/design-book/ColorPalette'
import { Typography } from '~/components/design-book/Typography'
import { Iconography } from '~/components/design-book/Iconography'
import { Patterns } from '~/components/design-book/Patterns'
import { FormElements } from '~/components/design-book/FormElements'
import { Components } from '~/components/design-book/Components'
import { Screens } from '~/components/design-book/Screens'
import { LayoutRules } from '~/components/design-book/LayoutRules'

export const Route = createFileRoute('/design-book')({
  component: DesignBookPage,
})

const SECTIONS = [
  { id: 'color', num: 'I', title: 'Color Palette' },
  { id: 'typography', num: 'II', title: 'Typography' },
  { id: 'icons', num: 'III', title: 'Iconography' },
  { id: 'patterns', num: 'IV', title: 'Patterns' },
  { id: 'forms', num: 'V', title: 'Form Elements' },
  { id: 'components', num: 'VI', title: 'Components' },
  { id: 'screens', num: 'VII', title: 'Screens' },
  { id: 'layout', num: 'VIII', title: 'Layout & Motion' },
]

function DesignBookPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)
  const isScreenshot = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('screenshot')

  useEffect(() => {
    if (isScreenshot) return
    const els = SECTIONS.map((sec) => document.getElementById(sec.id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [isScreenshot])

  if (isScreenshot) {
    return (
      <div style={{ background: '#fff', padding: '48px 64px', minHeight: '100vh' }}>
        <Screens onlyFirstRow />
      </div>
    )
  }

  return (
    <div className={s.page}>
      {/* Sidebar */}
      <nav className={s.sidebar}>
        <div className={s.sidebarTitle}>Contents</div>
        <ul className={s.navList}>
          {SECTIONS.map((sec) => (
            <li key={sec.id} className={s.navItem}>
              <a
                href={`#${sec.id}`}
                className={`${s.navLink} ${activeId === sec.id ? s.navLinkActive : ''}`}
              >
                <span className={s.navNumber}>{sec.num}</span>
                {sec.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content */}
      <main className={s.main}>
        {/* Masthead */}
        <header className={s.masthead}>
          <h1 className={s.mastheadTitle}>
            BLISKO <span className={s.mastheadDash}>&mdash;</span> Design Book
          </h1>
          <p className={s.mastheadEdition}>
            Newspaper / Editorial Variant &middot; Edition I &middot; February 2026
          </p>
        </header>

        {/* I. Color Palette */}
        <section id="color" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>I</span>
            <h2 className={s.sectionTitle}>Color Palette</h2>
          </div>
          <p className={s.sectionSubtitle}>
            A restrained palette drawn from ink, paper, and editorial red.
            Status colors are desaturated to maintain the calm, grown-up tone.
          </p>
          <ColorPalette />
        </section>

        {/* II. Typography */}
        <section id="typography" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>II</span>
            <h2 className={s.sectionTitle}>Typography</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Two typefaces: Instrument Serif for display and names, DM Sans for everything else.
            All specimens shown with Polish text matching the app.
          </p>
          <Typography />
        </section>

        {/* III. Iconography */}
        <section id="icons" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>III</span>
            <h2 className={s.sectionTitle}>Iconography</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Editorial stroke icons replacing emoji. Each shown at 16, 24, and 32px.
            Stroke weight 2px, round caps and joins.
          </p>
          <Iconography />
        </section>

        {/* IV. Patterns */}
        <section id="patterns" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>IV</span>
            <h2 className={s.sectionTitle}>Decorative Patterns</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Rules, the bullet-rose tag prefix, map grid treatment,
            and the editorial decorative vocabulary.
          </p>
          <Patterns />
        </section>

        {/* V. Form Elements */}
        <section id="forms" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>V</span>
            <h2 className={s.sectionTitle}>Form Elements</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Buttons, inputs, tags, and badges in the editorial design language.
            Bottom-border inputs, ink-on-cream buttons, uppercase DM Sans labels.
          </p>
          <FormElements />
        </section>

        {/* VI. Components */}
        <section id="components" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>VI</span>
            <h2 className={s.sectionTitle}>Components</h2>
          </div>
          <p className={s.sectionSubtitle}>
            User rows, wave cards, bottom sheet, and empty states &mdash;
            the building blocks of the app&apos;s editorial UI.
          </p>
          <Components />
        </section>

        {/* VII. Screens */}
        <section id="screens" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>VII</span>
            <h2 className={s.sectionTitle}>Screen Compositions</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Full screen mockups in phone frames showing the complete editorial experience
            across login, onboarding, waves, chats, and profile.
          </p>
          <Screens />
        </section>

        {/* VIII. Layout & Motion */}
        <section id="layout" className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNumber}>VIII</span>
            <h2 className={s.sectionTitle}>Layout Rules &amp; Motion</h2>
          </div>
          <p className={s.sectionSubtitle}>
            Spacing scale, layout principles, motion guidelines,
            and the do/don&apos;t reference for maintaining editorial consistency.
          </p>
          <LayoutRules />
        </section>
      </main>
    </div>
  )
}
