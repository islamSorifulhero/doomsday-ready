// Created on startup with IF NOT EXISTS, so no separate migration step is needed.
module.exports = `
CREATE TABLE IF NOT EXISTS movies (
  seq          BIGSERIAL UNIQUE,
  id           UUID PRIMARY KEY,
  title        TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  release_year INTEGER NOT NULL CHECK (release_year BETWEEN 1888 AND 2100),
  runtime      INTEGER NOT NULL CHECK (runtime BETWEEN 1 AND 300),
  watched      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS movies_title_unique ON movies (lower(title));

CREATE TABLE IF NOT EXISTS movie_prerequisites (
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  prerequisite_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  PRIMARY KEY (movie_id, prerequisite_id),
  CHECK (movie_id <> prerequisite_id)
);

CREATE TABLE IF NOT EXISTS cinemas (
  seq  BIGSERIAL UNIQUE,
  id   UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS cinemas_name_unique ON cinemas (lower(name));

CREATE TABLE IF NOT EXISTS cinema_bundle_sizes (
  cinema_id UUID NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  seats     INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 500),
  PRIMARY KEY (cinema_id, seats)
);
`;
