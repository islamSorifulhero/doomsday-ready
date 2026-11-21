/**
 * Graph helpers for movie prerequisites.
 * A movie points at the movies that must be watched before it (edges go
 * "movie -> prerequisite"). Everything is iterative, so a long chain of
 * prerequisites cannot overflow the call stack.
 *
 * getPrereqs(id) must return an array of prerequisite ids (empty if none).
 */

/**
 * Would giving `movieId` the prerequisites `newPrereqIds` create a cycle?
 *
 * The stored graph is always acyclic, and only movieId's outgoing edges change.
 * So a cycle appears exactly when movieId can be reached by walking
 * prerequisites starting from one of the new prerequisites
 * (this also covers a direct self-dependency).
 */
function wouldCreateCycle(movieId, newPrereqIds, getPrereqs) {
  const seen = new Set();
  const stack = [...newPrereqIds];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === movieId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of getPrereqs(current)) stack.push(next);
  }
  return false;
}

/**
 * Every movie that has to be watched before `targetId`, each exactly once,
 * ordered so that a movie always comes after its own prerequisites.
 * The target itself is not included.
 *
 * Depth-first post-order: a movie is emitted only after all of its
 * prerequisites have been emitted. `visited` guarantees "exactly once",
 * even when two paths share a prerequisite (a diamond).
 */
function rewatchOrder(targetId, getPrereqs) {
  const order = [];
  const visited = new Set([targetId]);
  const stack = [{ id: targetId, next: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const prereqs = getPrereqs(frame.id);

    if (frame.next < prereqs.length) {
      const child = prereqs[frame.next++];
      if (!visited.has(child)) {
        visited.add(child);
        stack.push({ id: child, next: 0 });
      }
    } else {
      stack.pop();
      if (frame.id !== targetId) order.push(frame.id);
    }
  }
  return order;
}

module.exports = { wouldCreateCycle, rewatchOrder };
