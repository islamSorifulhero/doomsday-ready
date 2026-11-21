const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryRepo } = require('../src/repo/memory');
const service = require('../src/service');
const { seedExampleData } = require('../src/seed');
const { ApiError } = require('../src/errors');

async function setup() {
  const repo = new MemoryRepo();
  await seedExampleData(repo);
  const movie = (title) => repo.movies.find((m) => m.title === title);
  const cinema = (name) => repo.cinemas.find((c) => c.name === name);
  return { repo, movie, cinema };
}

const titlesOf = (order) => order.map((m) => m.title);
const assertApiError = (promise, status, code) =>
  assert.rejects(promise, (e) => e instanceof ApiError && e.status === status && e.code === code);

function assertValidOrder(order) {
  const position = new Map(order.map((m, i) => [m.id, i]));
  assert.equal(position.size, order.length, 'each movie appears once');
  for (const m of order) {
    for (const p of m.prerequisites) assert.ok(position.get(p) < position.get(m.id), `${m.title} after its prerequisites`);
  }
}

test('rewatch order for Avengers: Doomsday has the 7 other movies', async () => {
  const { repo, movie } = await setup();
  const result = await service.getRewatchOrder(repo, movie('Avengers: Doomsday').id);
  assert.equal(result.order.length, 7);
  assertValidOrder(result.order);
  assert.ok(!titlesOf(result.order).includes('Avengers: Doomsday'));
});

test('rewatch order for Civil War: Iron Man + First Avenger, then The Avengers', async () => {
  const { repo, movie } = await setup();
  const titles = titlesOf((await service.getRewatchOrder(repo, movie('Captain America: Civil War').id)).order);
  assert.equal(titles[2], 'The Avengers');
  assert.deepEqual(titles.slice(0, 2).sort(), ['Captain America: The First Avenger', 'Iron Man']);
});

test('rewatch order for Thor: Ragnarok is empty', async () => {
  const { repo, movie } = await setup();
  const result = await service.getRewatchOrder(repo, movie('Thor: Ragnarok').id);
  assert.deepEqual(result.order, []);
  assert.equal(result.remainingRuntime, 0);
});

test('watched count and remaining runtime only count unwatched movies', async () => {
  const { repo, movie } = await setup();
  await service.updateMovie(repo, movie('Iron Man').id, { watched: true }); // 126 min
  const result = await service.getRewatchOrder(repo, movie('Captain America: Civil War').id);
  assert.equal(result.totalCount, 3);
  assert.equal(result.watchedCount, 1);
  assert.equal(result.remainingRuntime, 124 + 143); // First Avenger + The Avengers
});

test('Endgame as a prerequisite of Iron Man -> 409 CIRCULAR_DEPENDENCY', async () => {
  const { repo, movie } = await setup();
  await assertApiError(
    service.updateMovie(repo, movie('Iron Man').id, { prerequisites: [movie('Avengers: Endgame').id] }),
    409, 'CIRCULAR_DEPENDENCY',
  );
  assert.deepEqual(movie('Iron Man').prerequisites, [], 'rejected update changes nothing');
});

test('a movie cannot be its own prerequisite', async () => {
  const { repo, movie } = await setup();
  const id = movie('Iron Man').id;
  await assertApiError(service.updateMovie(repo, id, { prerequisites: [id] }), 409, 'CIRCULAR_DEPENDENCY');
});

test('prerequisites can be changed later (valid change succeeds)', async () => {
  const { repo, movie } = await setup();
  const updated = await service.updateMovie(repo, movie('Thor: Ragnarok').id, { prerequisites: [movie('Iron Man').id] });
  assert.deepEqual(updated.prerequisites, [movie('Iron Man').id]);
  assert.deepEqual(movie('Thor: Ragnarok').prerequisites, [movie('Iron Man').id]);
});

test('validation: duplicate title, runtime range, unknown prerequisite, unknown id', async () => {
  const { repo } = await setup();
  await assertApiError(service.createMovie(repo, { title: 'iron man', releaseYear: 2008, runtime: 100 }), 409, 'DUPLICATE_TITLE');
  await assertApiError(service.createMovie(repo, { title: 'X', releaseYear: 2020, runtime: 0 }), 400, 'VALIDATION_ERROR');
  await assertApiError(service.createMovie(repo, { title: 'X', releaseYear: 2020, runtime: 301 }), 400, 'VALIDATION_ERROR');
  await assertApiError(service.createMovie(repo, { title: 'X', releaseYear: 2020, runtime: 90, prerequisites: ['nope'] }), 400, 'VALIDATION_ERROR');
  await assertApiError(service.updateMovie(repo, 'nope', { watched: true }), 404, 'NOT_FOUND');
  await assertApiError(service.updateMovie(repo, 'nope', {}), 404, 'NOT_FOUND');
});

test('new movies default to unwatched', async () => {
  const { repo } = await setup();
  const created = await service.createMovie(repo, { title: 'Brand New', releaseYear: 2025, runtime: 100 });
  assert.equal(created.watched, false);
});

test('booking quotes match the brief', async () => {
  const { repo, cinema } = await setup();
  const quote = (name, n) => service.getBookingQuote(repo, cinema(name).id, String(n));

  assert.deepEqual((await quote('Grand Cinema', 6)).bundles, [{ size: 3, count: 2 }]);
  assert.equal((await quote('Skyline Multiplex', 11)).totalBundles, 4);
  assert.deepEqual((await quote('Metro Cinemas', 44)).bundles, [
    { size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 },
  ]);
  const impossible = await quote('Odeon Plaza', 7);
  assert.equal(impossible.possible, false);
  assert.deepEqual(impossible.bundles, []);
});

test('booking and cinema validation', async () => {
  const { repo, cinema } = await setup();
  const id = cinema('Grand Cinema').id;
  for (const bad of ['0', '10001', '-1', 'abc', '2.5', undefined]) {
    await assertApiError(service.getBookingQuote(repo, id, bad), 400, 'VALIDATION_ERROR');
  }
  await assertApiError(service.getBookingQuote(repo, 'nope', '5'), 404, 'NOT_FOUND');
  await assertApiError(service.createCinema(repo, { name: 'grand cinema', bundleSizes: [2] }), 409, 'DUPLICATE_NAME');
  await assertApiError(service.createCinema(repo, { name: 'A', bundleSizes: [] }), 400, 'VALIDATION_ERROR');
  await assertApiError(service.createCinema(repo, { name: 'A', bundleSizes: [501] }), 400, 'VALIDATION_ERROR');
  await assertApiError(service.createCinema(repo, { name: 'A', bundleSizes: [2, 2] }), 400, 'VALIDATION_ERROR');
  await assertApiError(
    service.createCinema(repo, { name: 'A', bundleSizes: Array.from({ length: 11 }, (_, i) => i + 1) }),
    400, 'VALIDATION_ERROR',
  );
});

test('two simultaneous updates cannot together create a cycle', async () => {
  const repo = new MemoryRepo();
  const a = await service.createMovie(repo, { title: 'A', releaseYear: 2000, runtime: 100 });
  const b = await service.createMovie(repo, { title: 'B', releaseYear: 2001, runtime: 100 });
  const results = await Promise.allSettled([
    service.updateMovie(repo, a.id, { prerequisites: [b.id] }),
    service.updateMovie(repo, b.id, { prerequisites: [a.id] }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
});
