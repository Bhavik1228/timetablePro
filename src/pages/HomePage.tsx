import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  UsersRound,
} from "lucide-react";

const HEADLINE_PHRASES = [
  "a balanced week.",
  "every subject.",
  "what comes next.",
  "time to focus.",
];

function HomePage() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const intervalId = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % HEADLINE_PHRASES.length);
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main className="marketing-shell">
      <header className="marketing-nav">
        <a className="brand" href="/" aria-label="TimeTable Pro home">
          <span className="brand-mark">
            <CalendarDays size={20} strokeWidth={1.8} />
          </span>
          <span>
            timetable<span className="brand-light">pro</span>
          </span>
        </a>
        <nav className="marketing-nav-actions" aria-label="Main navigation">
          <a className="nav-signin" href="/signin">
            Sign in
          </a>
          <a className="button button-primary" href="/signup">
            Get started <ArrowRight size={15} />
          </a>
        </nav>
      </header>

      <div className="marketing-content">
        <section className="marketing-hero">
          <p className="eyebrow">A CLEARER WAY TO PLAN YOUR WEEK</p>
          <h1>
            Make room for
            <br />
            <span className="headline-phrase" aria-label="what matters">
              <span key={HEADLINE_PHRASES[phraseIndex]} aria-hidden="true">
                {HEADLINE_PHRASES[phraseIndex]}
              </span>
            </span>
          </h1>
          <p className="marketing-lede">
            TimeTable Pro turns a list of subjects into a school week that feels
            organised, balanced, and easy to share.
          </p>
          <div className="marketing-hero-actions">
            <a className="button button-primary" href="/signup">
              Create your timetable <ArrowRight size={16} />
            </a>
            <a className="text-link" href="/app">
              Explore the planner
            </a>
          </div>
          <div className="hero-preview" aria-label="Timetable preview">
            <div className="preview-heading">
              <div>
                <span className="preview-kicker">WEEKLY OVERVIEW</span>
                <strong>Year 10 · Week plan</strong>
              </div>
              <span className="preview-week">MON — FRI</span>
            </div>
            <div className="preview-grid">
              <div className="preview-periods">
                <span>09:00</span>
                <span>10:00</span>
                <span>11:30</span>
              </div>
              <div className="preview-day">
                <span>MON</span>
                <strong>Mathematics</strong>
                <small>Room 204</small>
                <strong className="preview-soft">English</strong>
              </div>
              <div className="preview-day">
                <span>TUE</span>
                <strong className="preview-soft">Biology</strong>
                <strong>Chemistry</strong>
                <small>Lab 2</small>
              </div>
              <div className="preview-day preview-extra">
                <span>WED</span>
                <strong>Physics</strong>
                <small>Room 118</small>
                <strong className="preview-soft">Art</strong>
              </div>
              <div className="preview-day preview-extra">
                <span>THU</span>
                <strong className="preview-soft">History</strong>
                <strong>Mathematics</strong>
                <small>Room 204</small>
              </div>
              <div className="preview-day preview-extra">
                <span>FRI</span>
                <strong>English</strong>
                <small>Room 116</small>
                <strong className="preview-soft">Computer sci.</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="use-cases">
          <div className="use-cases-heading">
            <p className="eyebrow">MADE FOR THE PEOPLE BEHIND THE WEEK</p>
            <h2>One clear plan. A lot less juggling.</h2>
          </div>
          <div className="use-case-grid">
            <article className="use-case-card">
              <span className="use-case-icon"><GraduationCap size={20} /></span>
              <h3>For students</h3>
              <p>See what is next, stay on top of subjects, and make space for study.</p>
            </article>
            <article className="use-case-card">
              <span className="use-case-icon"><BookOpen size={20} /></span>
              <h3>For teachers</h3>
              <p>Build a readable weekly schedule for a class or teaching group.</p>
            </article>
            <article className="use-case-card">
              <span className="use-case-icon"><UsersRound size={20} /></span>
              <h3>For families</h3>
              <p>Keep school days and learning routines easy to understand at home.</p>
            </article>
          </div>
        </section>

        <section className="marketing-cta">
          <div>
            <p className="eyebrow">START WITH A CLEAN SLATE</p>
            <h2>Your week, in better order.</h2>
          </div>
          <a className="button button-primary" href="/signup">
            Get started <ArrowRight size={15} />
          </a>
        </section>
      </div>

      <footer className="marketing-footer">
        <span>TimeTable Pro</span>
        <span>Thoughtful planning for the school week.</span>
      </footer>
    </main>
  );
}

export default HomePage;
