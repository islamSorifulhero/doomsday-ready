import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api.js';
import { formatMinutes } from '../format.js';
import PrereqPicker from '../components/PrereqPicker.jsx';

function AddMovieForm({ movies, onAdded }) {
  const [title, setTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [runtime, setRuntime] = useState('');
  const [prerequisites, setPrerequisites] = useState([]);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await api.createMovie({
        title,
        releaseYear: Number(releaseYear),
        runtime: Number(runtime),
        prerequisites,
      });
      setTitle('');
      setReleaseYear('');
      setRuntime('');
      setPrerequisites([]);
      setError('');
      onAdded();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Add a movie</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <div className="row">
        <label>
          Release year
          <input type="number" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} required />
        </label>
        <label>
          Runtime (minutes)
          <input type="number" min="1" max="300" value={runtime} onChange={(e) => setRuntime(e.target.value)} required />
        </label>
      </div>
      <PrereqPicker movies={movies} selected={prerequisites} onChange={setPrerequisites} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit">Add movie</button>
    </form>
  );
}

function MovieRow({ movie, movies, titleOf, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(movie.prerequisites);
  const [error, setError] = useState('');

  async function run(body, done) {
    try {
      await api.updateMovie(movie.id, body);
      setError('');
      done?.();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <li className={movie.watched ? 'movie watched' : 'movie'}>
      <label className="check big">
        <input
          type="checkbox"
          checked={movie.watched}
          onChange={() => run({ watched: !movie.watched })}
          aria-label={`Mark ${movie.title} as watched`}
        />
        <span className="movie-title">{movie.title}</span>
      </label>
      <p className="meta">
        {movie.releaseYear}, {formatMinutes(movie.runtime)}
      </p>

      {!editing && (
        <p className="prereqs">
          {movie.prerequisites.length === 0
            ? 'No prerequisites'
            : `Watch first: ${movie.prerequisites.map(titleOf).join(', ')}`}
        </p>
      )}

      {editing ? (
        <div className="edit">
          <PrereqPicker movies={movies} excludeId={movie.id} selected={draft} onChange={setDraft} />
          <div className="actions">
            <button className="primary" onClick={() => run({ prerequisites: draft }, () => setEditing(false))}>
              Save prerequisites
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(movie.prerequisites);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="link"
          onClick={() => {
            setDraft(movie.prerequisites);
            setEditing(true);
          }}
        >
          Edit prerequisites
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export default function MoviesView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setMovies(await api.listMovies());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const titleOf = (id) => movies.find((m) => m.id === id)?.title ?? 'Unknown movie';

  return (
    <section className="view">
      <h2 className="view-title">Movies</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="columns">
        <AddMovieForm movies={movies} onAdded={load} />
        <div>
          {loading ? (
            <p className="muted">Loading movies…</p>
          ) : movies.length === 0 ? (
            <p className="muted">No movies yet. Add the first one to start planning.</p>
          ) : (
            <ul className="movie-list">
              {movies.map((m) => (
                <MovieRow key={m.id} movie={m} movies={movies} titleOf={titleOf} onChanged={load} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
