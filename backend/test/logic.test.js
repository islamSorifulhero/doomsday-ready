const test = require('node:test');
const assert = require('node:assert/strict');
const { minBundles } = require('../src/bundles');
const { wouldCreateCycle, rewatchOrder } = require('../src/graph');

const lookup = (edges) => (id) => edges[id] || [];

test('minBundles: examples from the brief', () => {
  assert.deepEqual(minBundles([1, 3, 4], 6), [{ size: 3, count: 2 }]);
  assert.deepEqual(minBundles([2, 5], 11), [{ size: 5, count: 1 }, { size: 2, count: 3 }]);
  assert.deepEqual(minBundles([6, 9, 20], 44), [
    { size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 },
  ]);
  assert.equal(minBundles([4, 6], 7), null);
});

test('minBundles: result always sums to the group size', () => {
  const result = minBundles([7, 499, 500], 10000);
  const seats = result.reduce((sum, b) => sum + b.size * b.count, 0);
  assert.equal(seats, 10000);
});

test('minBundles: bundle of 1 means every group size works', () => {
  assert.deepEqual(minBundles([1], 5), [{ size: 1, count: 5 }]);
});

test('wouldCreateCycle: self, direct and indirect', () => {
  const edges = { b: ['a'], c: ['b'] }; // c -> b -> a
  assert.equal(wouldCreateCycle('a', ['a'], lookup(edges)), true);
  assert.equal(wouldCreateCycle('a', ['c'], lookup(edges)), true);
  assert.equal(wouldCreateCycle('a', ['b'], lookup(edges)), true);
  assert.equal(wouldCreateCycle('c', ['a'], lookup(edges)), false);
});

test('rewatchOrder: diamond is listed once and in a valid order', () => {
  //   d needs b and c; b and c both need a
  const edges = { d: ['b', 'c'], b: ['a'], c: ['a'] };
  const order = rewatchOrder('d', lookup(edges));
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('rewatchOrder: handles a very long chain without overflowing the stack', () => {
  const edges = {};
  for (let i = 1; i <= 50000; i++) edges[i] = [i - 1];
  assert.equal(rewatchOrder(50000, lookup(edges)).length, 50000);
});
