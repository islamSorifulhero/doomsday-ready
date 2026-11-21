const service = require('./service');

// Sample data from the assignment (not an official watch guide).
// Doomsday's runtime is a placeholder because the film is unreleased.
const MOVIES = [
  ['Iron Man', 2008, 126, []],
  ['Captain America: The First Avenger', 2011, 124, []],
  ['The Avengers', 2012, 143, ['Iron Man', 'Captain America: The First Avenger']],
  ['Captain America: Civil War', 2016, 147, ['The Avengers']],
  ['Thor: Ragnarok', 2017, 130, []],
  ['Avengers: Infinity War', 2018, 149, ['Captain America: Civil War', 'Thor: Ragnarok']],
  ['Avengers: Endgame', 2019, 181, ['Avengers: Infinity War']],
  ['Avengers: Doomsday', 2026, 150, ['Avengers: Endgame']],
];

const CINEMAS = [
  ['Grand Cinema', [1, 3, 4]],
  ['Skyline Multiplex', [2, 5]],
  ['Metro Cinemas', [6, 9, 20]],
  ['Odeon Plaza', [4, 6]],
];

/** Fills an empty database with the example data. Returns false if there was already data. */
async function seedExampleData(repo) {
  const hasMovies = (await repo.listMovies()).length > 0;
  const hasCinemas = (await repo.listCinemas()).length > 0;
  if (hasMovies || hasCinemas) return false;

  const ids = new Map();
  for (const [title, releaseYear, runtime, prereqTitles] of MOVIES) {
    const movie = await service.createMovie(repo, {
      title, releaseYear, runtime, prerequisites: prereqTitles.map((t) => ids.get(t)),
    });
    ids.set(title, movie.id);
  }
  for (const [name, bundleSizes] of CINEMAS) await service.createCinema(repo, { name, bundleSizes });
  return true;
}

module.exports = { seedExampleData };
