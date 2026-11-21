async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.code = data?.error?.code;
    err.status = res.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  listMovies: () => request('/movies'),
  createMovie: (body) => request('/movies', json('POST', body)),
  updateMovie: (id, body) => request(`/movies/${id}`, json('PATCH', body)),
  rewatchOrder: (id) => request(`/movies/${id}/rewatch-order`),
  listCinemas: () => request('/cinemas'),
  createCinema: (body) => request('/cinemas', json('POST', body)),
  booking: (id, groupSize) => request(`/cinemas/${id}/booking?groupSize=${encodeURIComponent(groupSize)}`),
};

/** First field-level message if the server sent any, otherwise the general message. */
export function errorText(err) {
  return err.details?.[0]?.message || err.message;
}
