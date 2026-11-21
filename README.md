# Doomsday Ready

A small full-stack app that helps MCU fans plan their rewatch before *Avengers: Doomsday* and book an opening-night watch party.

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Node.js + Express (`backend/`)
- **Database:** PostgreSQL (tables are created automatically on start)

## Run it

### Docker (one command)

```bash
docker compose up --build
```

- App: http://localhost:8080
- API: http://localhost:4000/api
- PostgreSQL: localhost:5432 (user `postgres`, password `postgres`, database `doomsday`)

The sample data from the assignment (8 movies, 4 cinemas) is loaded the first time, when the database is empty. Data stays in the `pg-data` Docker volume. Remove it with `docker compose down -v`.

### Without Docker for the apps

```bash
# 1. database only
docker compose up db

# 2. backend (new terminal)
cd backend && npm install
SEED_EXAMPLE_DATA=true npm start        # Windows PowerShell: $env:SEED_EXAMPLE_DATA="true"; npm start

# 3. frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 (Vite forwards `/api` to port 4000).

Backend settings (environment variables):

| Variable | Default |
| --- | --- |
| `PORT` | `4000` |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/doomsday` |
| `SEED_EXAMPLE_DATA` | unset (set to `true` to load the sample data into an empty database) |

### Tests

```bash
cd backend && npm install && npm test
```

The tests use an in-memory repository, so no database is needed. They cover every example in the brief, cycle detection (self, direct, indirect, and two simultaneous updates), validation rules, and an end-to-end HTTP flow.

## API

All errors use one shape: `{ "error": { "code": "...", "message": "...", "details": [...] } }`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/movies` | Create a movie |
| `GET /api/movies` | List movies |
| `GET /api/movies/:id` | One movie (extra) |
| `PATCH /api/movies/:id` | Update title, releaseYear, runtime, prerequisites, watched |
| `GET /api/movies/:id/rewatch-order` | Rewatch order for a target movie |
| `POST /api/cinemas` | Create a cinema |
| `GET /api/cinemas` | List cinemas |
| `GET /api/cinemas/:id/booking?groupSize=6` | Booking quote |
| `GET /api/health` | Health check (extra) |

Movie: `{ id, title, releaseYear, runtime, prerequisites: [movieId], watched }`
Cinema: `{ id, name, bundleSizes: [seats] }`

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad field, unknown prerequisite id, bad `groupSize` |
| 404 | `NOT_FOUND` | Unknown movie or cinema id |
| 409 | `CIRCULAR_DEPENDENCY` | A create or update would make a movie depend on itself, directly or indirectly |
| 409 | `DUPLICATE_TITLE` / `DUPLICATE_NAME` | Title or cinema name already used (case-insensitive) |

Examples:

```bash
curl localhost:4000/api/movies/<id>/rewatch-order
# {"target":{...},"order":[...],"totalCount":7,"watchedCount":0,"remainingRuntime":1000}

curl "localhost:4000/api/cinemas/<id>/booking?groupSize=44"
# {"possible":true,"totalBundles":4,"bundles":[{"size":20,"count":1},{"size":9,"count":2},{"size":6,"count":1}],...}
# no exact combination: {"possible":false,"totalBundles":null,"bundles":[],"message":"..."}
```

## How the two core features work

Both are written by hand, with no graph, toposort or coin-change libraries (`backend/src/graph.js`, `backend/src/bundles.js`). The only runtime libraries are Express and the PostgreSQL driver `pg`.

**Rewatch order and cycle check.** Movies form a directed graph (movie to its prerequisites).
- *Cycle check:* when a movie's prerequisites change, I walk the prerequisite chains starting from the new prerequisites. If that walk reaches the movie being edited, the change would create a cycle, so the API answers `409 CIRCULAR_DEPENDENCY`. The stored graph is always acyclic and only this movie's edges change, so this is enough, and a direct self-dependency is caught the same way.
- *Order:* an iterative depth-first walk from the target that emits a movie only after all its prerequisites (post-order). A visited set guarantees each movie appears once, even when two paths share a prerequisite. The target is excluded. Cost is O(movies + links), and being iterative, very long chains cannot overflow the stack.

**Booking quote.** The fewest bundles that add up to exactly the group size is the unbounded coin-change problem. A greedy approach fails (sizes 1, 3, 4 and group 6: greedy picks 4+1+1, three bundles, but 3+3 is two). I use dynamic programming: `best[n]` is the fewest bundles to fill exactly `n` seats, and `choice[n]` remembers the last bundle used so the answer can be rebuilt. Cost is O(groupSize x sizes), at most 100,000 steps.

**Concurrency.** Every write runs in one database transaction that first takes a PostgreSQL advisory lock. Without it, two simultaneous updates (A needs B, B needs A) could each pass the cycle check and together create a cycle.

## Data model

```mermaid
erDiagram
    MOVIE {
        uuid id PK
        text title "unique, case-insensitive"
        int release_year
        int runtime "minutes, 1 to 300"
        boolean watched "default false"
    }
    MOVIE_PREREQUISITE {
        uuid movie_id PK, FK
        uuid prerequisite_id PK, FK
        int position "keeps the order given"
    }
    CINEMA {
        uuid id PK
        text name "unique, case-insensitive"
    }
    CINEMA_BUNDLE_SIZE {
        uuid cinema_id PK, FK
        int seats PK "1 to 500, at most 10 per cinema"
    }
    MOVIE ||--o{ MOVIE_PREREQUISITE : "needs (movie_id)"
    MOVIE ||--o{ MOVIE_PREREQUISITE : "is needed by (prerequisite_id)"
    CINEMA ||--|{ CINEMA_BUNDLE_SIZE : sells
```

The database stops a movie linking to itself (`CHECK movie_id <> prerequisite_id`). Longer cycles are blocked by the cycle check in the service, because SQL constraints cannot express them. The API returns a movie's prerequisites as an array of ids and a cinema's bundle sizes as an array of seat counts.

## Decisions and assumptions

- **Prerequisites are movie ids**, not titles. Unknown ids give `400`. Duplicate ids are removed.
- **Release year** must be a whole number from 1888 to 2100. The brief gave no range.
- **Cinema bundle sizes** must be 1 to 10 different whole numbers from 1 to 500. Repeated sizes are rejected, not merged, because the brief says "different". They are stored sorted.
- **Several optimal quotes:** when more than one combination uses the fewest bundles, any is valid. I return one, listed from the largest bundle to the smallest.
- **`groupSize`** must be a whole number from 1 to 10,000, otherwise `400`.
- **Rewatch order** lists watched movies too (the UI shows them ticked). The watched count and remaining runtime are computed from that list. "Remaining runtime" is the sum of runtimes of unwatched ones, in minutes.
- **Create and cycles:** a brand-new movie has nothing depending on it, so a create cannot form a cycle. The cycle check runs on every update that changes prerequisites.
- **Whole graph per request:** the API loads all movies for each request and works in memory. That is fine for a catalogue of this size and keeps the graph code simple.
- **No delete endpoints**, since the brief did not ask for them.
- The *Avengers: Doomsday* runtime in the sample data (150 min) is a placeholder.

## Use of AI tools

> DRAFT. Edit this so it matches what you actually did before you submit.

I used Claude (Anthropic) to help generate the first version of the code, tests and this README. Then I [describe what you did: read the code, ran it locally, ran the tests, checked the examples from the brief, changed X]. The logic for Feature 1 (cycle detection, rewatch order) and Feature 2 (minimum bundles) is hand-written, with no libraries, and I can explain how both work.

## Project layout

```
backend/
  src/graph.js       cycle check + rewatch order (hand-written)
  src/bundles.js     minimum-bundle dynamic programming (hand-written)
  src/service.js     validation and business rules
  src/repo/          PostgreSQL repository (production) and in-memory repository (tests)
  src/schema.js      table definitions
  test/              unit, service and HTTP tests
frontend/            React app with three views: Movies, Rewatch plan, Booking
docker-compose.yml   db + backend + frontend
```
#   d o o m s d a y - r e a d y  
 