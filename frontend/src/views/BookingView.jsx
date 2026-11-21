import { useEffect, useState } from 'react';
import { api, errorText } from '../api.js';

function AddCinemaForm({ onAdded }) {
  const [name, setName] = useState('');
  const [sizes, setSizes] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const bundleSizes = sizes.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    try {
      const cinema = await api.createCinema({ name, bundleSizes });
      setName('');
      setSizes('');
      setError('');
      onAdded(cinema);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h3>Add a cinema</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Bundle sizes (comma separated, 1 to 10 sizes, 1 to 500 seats each)
        <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="2, 5" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit">Add cinema</button>
    </form>
  );
}

export default function BookingView() {
  const [cinemas, setCinemas] = useState([]);
  const [cinemaId, setCinemaId] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCinemas().then((list) => {
      setCinemas(list);
      if (list.length > 0) setCinemaId(list[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  const selected = cinemas.find((c) => c.id === cinemaId);

  async function submit(e) {
    e.preventDefault();
    try {
      setQuote(await api.booking(cinemaId, groupSize));
      setError('');
    } catch (err) {
      setQuote(null);
      setError(errorText(err));
    }
  }

  return (
    <section className="view">
      <h2 className="view-title">Booking</h2>
      <div className="columns">
        <div>
          {cinemas.length === 0 ? (
            <p className="muted">No cinemas yet. Add one to get a quote.</p>
          ) : (
            <form className="panel form" onSubmit={submit}>
              <label>
                Cinema
                <select value={cinemaId} onChange={(e) => { setCinemaId(e.target.value); setQuote(null); }}>
                  {cinemas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {selected && <p className="muted">Sells bundles of {selected.bundleSizes.join(', ')} seats.</p>}
              <label>
                Group size (1 to 10,000)
                <input type="number" min="1" max="10000" value={groupSize} onChange={(e) => setGroupSize(e.target.value)} required />
              </label>
              <button className="primary" type="submit">Get quote</button>
            </form>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          {quote && quote.possible && (
            <div className="panel quote" aria-live="polite">
              <h3>{quote.totalBundles} {quote.totalBundles === 1 ? 'bundle' : 'bundles'} for {quote.groupSize} seats</h3>
              <ul>
                {quote.bundles.map((b) => (
                  <li key={b.size}>
                    <strong>{b.count} × {b.size}-seat</strong> <span className="meta">{b.count * b.size} seats</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quote && !quote.possible && (
            <div className="panel quote none" aria-live="polite">
              <h3>Not possible</h3>
              <p>{quote.message}. Try a different group size or cinema.</p>
            </div>
          )}
        </div>
        <AddCinemaForm onAdded={(c) => { setCinemas((list) => [...list, c]); setCinemaId(c.id); setQuote(null); }} />
      </div>
    </section>
  );
}
