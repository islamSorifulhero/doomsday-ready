import { useState } from 'react';
import MoviesView from './views/MoviesView.jsx';
import RewatchView from './views/RewatchView.jsx';
import BookingView from './views/BookingView.jsx';

const TABS = [
  { id: 'movies', label: 'Movies' },
  { id: 'plan', label: 'Rewatch plan' },
  { id: 'booking', label: 'Booking' },
];

export default function App() {
  const [tab, setTab] = useState('movies');

  return (
    <div className="shell">
      <aside className="rail">
        <h1 className="brand">Doomsday Ready</h1>
        <p className="tagline">Catch up on the MCU, then take your crew to opening night.</p>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="stage">
        {tab === 'movies' && <MoviesView />}
        {tab === 'plan' && <RewatchView />}
        {tab === 'booking' && <BookingView />}
      </main>
    </div>
  );
}
