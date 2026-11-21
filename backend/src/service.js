const { randomUUID } = require('node:crypto');
const { ApiError } = require('./errors');
const { wouldCreateCycle, rewatchOrder } = require('./graph');
const { minBundles } = require('./bundles');

/*
 * Business rules. `repo` is a PostgresRepo (production) or MemoryRepo (tests).
 * Every write runs inside repo.transaction(), which also serialises writers.
 * The movie list is small, so each request loads all movies and works on them
 * in memory (the graph code needs the whole graph anyway).
 */

const LIMITS = {
  runtime: [1, 300],
  releaseYear: [1888, 2100],
  groupSize: [1, 10000],
  bundleSizes: [1, 10], // how many different sizes a cinema may sell
  bundleSeats: [1, 500], // seats in one bundle
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIntInRange = (v, [min, max]) => Number.isInteger(v) && v >= min && v <= max;
const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

const validationError = (details) =>
  new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
const notFound = (what) => new ApiError(404, 'NOT_FOUND', `${what} not found`);

/* ------------------------------ movies ------------------------------ */

function parseMovieFields(body, { partial }) {
  if (!isPlainObject(body)) {
    throw validationError([{ field: 'body', message: 'Request body must be a JSON object' }]);
  }
  const errors = [];
  const out = {};
  const give = (field, message) => errors.push({ field, message });
  const wanted = (field) => (partial ? body[field] !== undefined : true);

  if (wanted('title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) give('title', 'Title is required');
    else if (body.title.trim().length > 200) give('title', 'Title must be at most 200 characters');
    else out.title = body.title.trim();
  }
  if (wanted('releaseYear')) {
    if (!isIntInRange(body.releaseYear, LIMITS.releaseYear)) {
      give('releaseYear', `releaseYear must be a whole number between ${LIMITS.releaseYear.join(' and ')}`);
    } else out.releaseYear = body.releaseYear;
  }
  if (wanted('runtime')) {
    if (!isIntInRange(body.runtime, LIMITS.runtime)) {
      give('runtime', `runtime must be a whole number of minutes between ${LIMITS.runtime.join(' and ')}`);
    } else out.runtime = body.runtime;
  }
  if (body.prerequisites !== undefined) {
    if (!Array.isArray(body.prerequisites) || body.prerequisites.some((p) => typeof p !== 'string')) {
      give('prerequisites', 'prerequisites must be an array of movie ids');
    } else out.prerequisites = [...new Set(body.prerequisites)];
  }
  if (body.watched !== undefined) {
    if (typeof body.watched !== 'boolean') give('watched', 'watched must be true or false');
    else out.watched = body.watched;
  }

  if (partial && errors.length === 0 && Object.keys(out).length === 0) {
    give('body', 'Provide at least one of: title, releaseYear, runtime, prerequisites, watched');
  }
  if (errors.length > 0) throw validationError(errors);
  return out;
}

function assertUniqueTitle(movies, title, exceptId = null) {
  const clash = movies.find((m) => m.id !== exceptId && sameText(m.title, title));
  if (clash) throw new ApiError(409, 'DUPLICATE_TITLE', `A movie titled "${clash.title}" already exists`);
}

function assertPrerequisitesExist(movies, ids) {
  const known = new Set(movies.map((m) => m.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw validationError([
      { field: 'prerequisites', message: `Unknown movie id(s): ${missing.join(', ')}` },
    ]);
  }
}

function prereqLookup(movies) {
  const map = new Map(movies.map((m) => [m.id, m.prerequisites]));
  return (id) => map.get(id) || [];
}

async function createMovie(repo, body) {
  const fields = parseMovieFields(body, { partial: false });

  return repo.transaction(async (tx) => {
    const movies = await tx.listMovies();
    assertUniqueTitle(movies, fields.title);
    const prerequisites = fields.prerequisites ?? [];
    assertPrerequisitesExist(movies, prerequisites);

    // A brand-new movie has no dependants yet, so it cannot be part of a cycle:
    // no cycle check is needed here (updateMovie is where cycles can appear).
    const movie = {
      id: randomUUID(),
      title: fields.title,
      releaseYear: fields.releaseYear,
      runtime: fields.runtime,
      prerequisites,
      watched: fields.watched ?? false,
    };
    await tx.insertMovie(movie);
    return movie;
  });
}

async function updateMovie(repo, id, body) {
  return repo.transaction(async (tx) => {
    const movies = await tx.listMovies();
    const movie = movies.find((m) => m.id === id);
    if (!movie) throw notFound('Movie');
    const fields = parseMovieFields(body, { partial: true });

    if (fields.title !== undefined) assertUniqueTitle(movies, fields.title, id);
    if (fields.prerequisites !== undefined) {
      assertPrerequisitesExist(movies, fields.prerequisites);
      if (wouldCreateCycle(id, fields.prerequisites, prereqLookup(movies))) {
        throw new ApiError(
          409,
          'CIRCULAR_DEPENDENCY',
          'A movie cannot depend on itself, directly or through other movies',
        );
      }
    }

    await tx.updateMovie(id, fields);
    return { ...movie, ...fields };
  });
}

const listMovies = (repo) => repo.listMovies();

async function getMovie(repo, id) {
  const movie = (await repo.listMovies()).find((m) => m.id === id);
  if (!movie) throw notFound('Movie');
  return movie;
}

async function getRewatchOrder(repo, id) {
  const movies = await repo.listMovies();
  const target = movies.find((m) => m.id === id);
  if (!target) throw notFound('Movie');

  const byId = new Map(movies.map((m) => [m.id, m]));
  const order = rewatchOrder(id, prereqLookup(movies)).map((movieId) => byId.get(movieId));

  return {
    target: { id: target.id, title: target.title },
    order,
    totalCount: order.length,
    watchedCount: order.filter((m) => m.watched).length,
    remainingRuntime: order.filter((m) => !m.watched).reduce((sum, m) => sum + m.runtime, 0),
  };
}

/* ------------------------------ cinemas ------------------------------ */

function parseCinema(body) {
  if (!isPlainObject(body)) {
    throw validationError([{ field: 'body', message: 'Request body must be a JSON object' }]);
  }
  const errors = [];
  const out = {};

  if (typeof body.name !== 'string' || !body.name.trim()) errors.push({ field: 'name', message: 'Name is required' });
  else if (body.name.trim().length > 200) errors.push({ field: 'name', message: 'Name must be at most 200 characters' });
  else out.name = body.name.trim();

  const sizes = body.bundleSizes;
  const [minCount, maxCount] = LIMITS.bundleSizes;
  if (!Array.isArray(sizes) || sizes.length < minCount || sizes.length > maxCount) {
    errors.push({ field: 'bundleSizes', message: `bundleSizes must be an array of ${minCount} to ${maxCount} sizes` });
  } else if (!sizes.every((s) => isIntInRange(s, LIMITS.bundleSeats))) {
    errors.push({ field: 'bundleSizes', message: `Every bundle size must be a whole number between ${LIMITS.bundleSeats.join(' and ')}` });
  } else if (new Set(sizes).size !== sizes.length) {
    errors.push({ field: 'bundleSizes', message: 'Bundle sizes must all be different' });
  } else out.bundleSizes = [...sizes].sort((a, b) => a - b);

  if (errors.length > 0) throw validationError(errors);
  return out;
}

async function createCinema(repo, body) {
  const fields = parseCinema(body);

  return repo.transaction(async (tx) => {
    const cinemas = await tx.listCinemas();
    const clash = cinemas.find((c) => sameText(c.name, fields.name));
    if (clash) throw new ApiError(409, 'DUPLICATE_NAME', `A cinema named "${clash.name}" already exists`);

    const cinema = { id: randomUUID(), ...fields };
    await tx.insertCinema(cinema);
    return cinema;
  });
}

const listCinemas = (repo) => repo.listCinemas();

async function getBookingQuote(repo, id, rawGroupSize) {
  const cinema = (await repo.listCinemas()).find((c) => c.id === id);
  if (!cinema) throw notFound('Cinema');

  const [min, max] = LIMITS.groupSize;
  const groupSize = typeof rawGroupSize === 'string' && /^\d+$/.test(rawGroupSize) ? Number(rawGroupSize) : NaN;
  if (!isIntInRange(groupSize, LIMITS.groupSize)) {
    throw validationError([{ field: 'groupSize', message: `groupSize must be a whole number between ${min} and ${max}` }]);
  }

  const bundles = minBundles(cinema.bundleSizes, groupSize);
  const base = { cinemaId: cinema.id, cinemaName: cinema.name, groupSize };

  if (bundles === null) {
    return {
      ...base,
      possible: false,
      totalBundles: null,
      bundles: [],
      message: `No exact combination of ${cinema.bundleSizes.join(', ')}-seat bundles adds up to ${groupSize}`,
    };
  }
  return {
    ...base,
    possible: true,
    totalBundles: bundles.reduce((sum, b) => sum + b.count, 0),
    bundles,
  };
}

module.exports = {
  createMovie, updateMovie, listMovies, getMovie, getRewatchOrder,
  createCinema, listCinemas, getBookingQuote,
};
