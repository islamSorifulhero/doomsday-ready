const express = require('express');
const service = require('./service');
const { ApiError } = require('./errors');

function createApp(repo) {
  const app = express();
  app.use(express.json());

  const api = express.Router();
  // Express 4 does not catch rejected promises, so forward them to the error handler.
  const handle = (fn) => (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

  api.get('/health', (req, res) => res.json({ status: 'ok' }));

  api.post('/movies', handle(async (req, res) => res.status(201).json(await service.createMovie(repo, req.body))));
  api.get('/movies', handle(async (req, res) => res.json(await service.listMovies(repo))));
  api.get('/movies/:id', handle(async (req, res) => res.json(await service.getMovie(repo, req.params.id))));
  api.patch('/movies/:id', handle(async (req, res) => res.json(await service.updateMovie(repo, req.params.id, req.body))));
  api.get('/movies/:id/rewatch-order', handle(async (req, res) =>
    res.json(await service.getRewatchOrder(repo, req.params.id))));

  api.post('/cinemas', handle(async (req, res) => res.status(201).json(await service.createCinema(repo, req.body))));
  api.get('/cinemas', handle(async (req, res) => res.json(await service.listCinemas(repo))));
  api.get('/cinemas/:id/booking', handle(async (req, res) =>
    res.json(await service.getBookingQuote(repo, req.params.id, req.query.groupSize))));

  api.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)));
  app.use('/api', api);

  // One error shape everywhere: { error: { code, message, details? } }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  return app;
}

module.exports = { createApp };
