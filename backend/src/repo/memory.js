// Same interface as PostgresRepo, but in memory. Used by the tests (no database needed).
const copyMovie = (m) => ({ ...m, prerequisites: [...m.prerequisites] });
const copyCinema = (c) => ({ ...c, bundleSizes: [...c.bundleSizes] });

class MemoryRepo {
  constructor() {
    this.movies = [];
    this.cinemas = [];
    this.lock = Promise.resolve();
  }

  /** Runs fn one at a time, like the database write lock. */
  transaction(fn) {
    const run = this.lock.then(() => fn(this));
    this.lock = run.catch(() => {});
    return run;
  }

  async listMovies() {
    return this.movies.map(copyMovie);
  }

  async insertMovie(movie) {
    this.movies.push(copyMovie(movie));
  }

  async updateMovie(id, fields) {
    const movie = this.movies.find((m) => m.id === id);
    Object.assign(movie, fields, fields.prerequisites ? { prerequisites: [...fields.prerequisites] } : {});
  }

  async listCinemas() {
    return this.cinemas.map(copyCinema);
  }

  async insertCinema(cinema) {
    this.cinemas.push(copyCinema(cinema));
  }
}

module.exports = { MemoryRepo };
