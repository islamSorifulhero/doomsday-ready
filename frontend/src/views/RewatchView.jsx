import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api.js';
import { formatMinutes } from '../format.js';

export default function RewatchView() {
  const [movies, setMovies] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listMovies().then(setMovies).catch((err) => setError(err.message));
  }, []);

  const loadPlan = useCallback(async (id) => {
    if (!id) return setPlan(null);
    try {
      setPlan(await api.rewatchOrder(id));
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    loadPlan(targetId);
  }, [targetId, loadPlan]);

  async function toggle(movie) {
    try {
      await api.updateMovie(movie.id, { watched: !movie.watched });
      await loadPlan(targetId);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const percent = plan && plan.totalCount > 0 ? Math.round((plan.watchedCount / plan.totalCount) * 100) : 0;

  return (
    <section className="view">
      <h2 className="view-title">Rewatch plan</h2>
      <label className="field">
        Which movie are you getting ready for?
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Pick a movie…</option>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}

      {plan && plan.totalCount === 0 && (
        <p className="panel">Nothing to catch up on. You can watch {plan.target.title} right away.</p>
      )}

      {plan && plan.totalCount > 0 && (
        <div className="panel plan">
          <div className="progress-head">
            <strong>{plan.watchedCount} of {plan.totalCount} watched</strong>
            <span>
              {plan.remainingRuntime === 0
                ? 'All caught up'
                : `${formatMinutes(plan.remainingRuntime)} left to watch`}
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plan.totalCount}
            aria-valuenow={plan.watchedCount}
            aria-label="Watched movies"
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>

          <ol className="order">
            {plan.order.map((m) => (
              <li key={m.id} className={m.watched ? 'watched' : ''}>
                <label className="check big">
                  <input type="checkbox" checked={m.watched} onChange={() => toggle(m)} />
                  <span className="movie-title">{m.title}</span>
                </label>
                <span className="meta">{m.releaseYear}, {formatMinutes(m.runtime)}</span>
              </li>
            ))}
          </ol>
          <p className="muted">Then you are ready for {plan.target.title}.</p>
        </div>
      )}
    </section>
  );
}
