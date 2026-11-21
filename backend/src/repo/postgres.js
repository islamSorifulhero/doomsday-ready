// All SQL lives here. The service layer only sees plain movie/cinema objects.
const WRITE_LOCK_ID = 727001; // arbitrary number identifying "the app's write lock"

const MOVIE_SELECT = `
  SELECT m.id, m.title, m.release_year, m.runtime, m.watched,
         COALESCE(
           array_agg(p.prerequisite_id::text ORDER BY p.position)
             FILTER (WHERE p.prerequisite_id IS NOT NULL),
           '{}'::text[]
         ) AS prerequisites
  FROM movies m
  LEFT JOIN movie_prerequisites p ON p.movie_id = m.id
  GROUP BY m.id
  ORDER BY m.seq`;

const toMovie = (r) => ({
  id: r.id,
  title: r.title,
  releaseYear: r.release_year,
  runtime: r.runtime,
  prerequisites: r.prerequisites,
  watched: r.watched,
});

const MOVIE_COLUMNS = { title: 'title', releaseYear: 'release_year', runtime: 'runtime', watched: 'watched' };

class PostgresRepo {
  /** @param db anything with .query(text, params): a Pool, or a Client inside a transaction */
  constructor(db, pool = db) {
    this.db = db;
    this.pool = pool;
  }

  /**
   * Runs fn(txRepo) in one database transaction. A transaction-level advisory
   * lock serialises writers, so two simultaneous updates cannot each pass the
   * cycle check and then together create a cycle.
   */
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_ID]);
      const result = await fn(new PostgresRepo(client, this.pool));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback failed', rollbackErr);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listMovies() {
    const { rows } = await this.db.query(MOVIE_SELECT);
    return rows.map(toMovie);
  }

  async insertMovie(movie) {
    await this.db.query(
      'INSERT INTO movies (id, title, release_year, runtime, watched) VALUES ($1, $2, $3, $4, $5)',
      [movie.id, movie.title, movie.releaseYear, movie.runtime, movie.watched],
    );
    await this.setPrerequisites(movie.id, movie.prerequisites);
  }

  /** `fields` may hold any of title, releaseYear, runtime, watched, prerequisites. */
  async updateMovie(id, fields) {
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(MOVIE_COLUMNS)) {
      if (fields[key] !== undefined) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await this.db.query(`UPDATE movies SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    if (fields.prerequisites !== undefined) await this.setPrerequisites(id, fields.prerequisites);
  }

  async setPrerequisites(movieId, prerequisiteIds) {
    await this.db.query('DELETE FROM movie_prerequisites WHERE movie_id = $1', [movieId]);
    if (prerequisiteIds.length === 0) return;
    await this.db.query(
      `INSERT INTO movie_prerequisites (movie_id, prerequisite_id, position)
       SELECT $1, x.id, x.ord - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, ord)`,
      [movieId, prerequisiteIds],
    );
  }

  async listCinemas() {
    const { rows } = await this.db.query(`
      SELECT c.id, c.name, array_agg(b.seats ORDER BY b.seats) AS bundle_sizes
      FROM cinemas c
      JOIN cinema_bundle_sizes b ON b.cinema_id = c.id
      GROUP BY c.id
      ORDER BY c.seq`);
    return rows.map((r) => ({ id: r.id, name: r.name, bundleSizes: r.bundle_sizes }));
  }

  async insertCinema(cinema) {
    await this.db.query('INSERT INTO cinemas (id, name) VALUES ($1, $2)', [cinema.id, cinema.name]);
    await this.db.query(
      'INSERT INTO cinema_bundle_sizes (cinema_id, seats) SELECT $1, unnest($2::int[])',
      [cinema.id, cinema.bundleSizes],
    );
  }
}

module.exports = { PostgresRepo };
