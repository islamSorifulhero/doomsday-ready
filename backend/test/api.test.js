// End-to-end HTTP test (in-memory repository, so no database is needed).
// Needs `npm install` first (uses express).
const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryRepo } = require('../src/repo/memory');
const { createApp } = require('../src/app');

test('HTTP: create, update, cycle rejection, rewatch order, booking', async (t) => {
  const server = createApp(new MemoryRepo()).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  const a = await call('POST', '/movies', { title: 'A', releaseYear: 2000, runtime: 100 });
  assert.equal(a.status, 201);
  const b = await call('POST', '/movies', { title: 'B', releaseYear: 2001, runtime: 90, prerequisites: [a.body.id] });
  assert.equal(b.status, 201);

  const cycle = await call('PATCH', `/movies/${a.body.id}`, { prerequisites: [b.body.id] });
  assert.equal(cycle.status, 409);
  assert.equal(cycle.body.error.code, 'CIRCULAR_DEPENDENCY');

  await call('PATCH', `/movies/${a.body.id}`, { watched: true });
  const plan = await call('GET', `/movies/${b.body.id}/rewatch-order`);
  assert.equal(plan.status, 200);
  assert.equal(plan.body.watchedCount, 1);
  assert.equal(plan.body.remainingRuntime, 0);

  const cinema = await call('POST', '/cinemas', { name: 'C', bundleSizes: [2, 5] });
  const quote = await call('GET', `/cinemas/${cinema.body.id}/booking?groupSize=11`);
  assert.equal(quote.body.totalBundles, 4);
  assert.equal((await call('GET', `/cinemas/${cinema.body.id}/booking?groupSize=0`)).status, 400);
  assert.equal((await call('GET', '/nothing')).status, 404);
});
