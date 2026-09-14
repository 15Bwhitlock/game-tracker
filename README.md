# Game Tracker

A personal web app to catalog board games and recommend what to play with friends based on player count, available time, and other criteria.

## Stack

- **Backend** — Java 17, Spring Boot 3.5, Maven, PostgreSQL 15, Flyway
- **Frontend** — Angular 21 (standalone components, signals)
- **Integrations** — BoardGameGeek XML API2 (Caffeine-cached, 24h TTL)

## Architecture

```
[Angular SPA :4200]  ──HTTP──▶  [Spring Boot API :8080]  ──▶  [PostgreSQL :5432]
                                       │
                                       └──▶  [BoardGameGeek XML API2]
```

## Prerequisites

- Java 17
- Maven 3.9+
- Node 20.19+ (Angular CLI is pulled via `npx`, no global install needed)
- Docker (for Postgres via `docker-compose`)

## Getting started

### 1. Start Postgres

```bash
docker compose up -d
```

### 2. Run the backend

```bash
cd backend
./mvnw spring-boot:run
```

API is served at `http://localhost:8080`. Flyway runs migrations on startup (including seed data); JPA validates the schema against entities (`ddl-auto=validate`).

### 3. Run the frontend

```bash
cd frontend
npm install
npm start
```

App is served at `http://localhost:4200`. `/api/*` requests are proxied to the backend (see [frontend/proxy.conf.json](frontend/proxy.conf.json)).

## Features

- **Collection** (`/collection`) — table of owned games with title, player count, average play time, and personal rating. Client-side search filters by title, categories, mechanics, notes, player count, play time, and rating. Each row has Log Play (with undo toast), Edit, and Delete (with confirmation) actions.
- **Add / Edit game** (`/games/add`, `/games/:id/edit`) — full form with button-group selectors for player count (1–10+), play time (15m–4h+), personal rating (1–10), and complexity (1–5). Categories and mechanics use a toggle-chip grid (selected items float to the top) with hover tooltips, a reference dialog, and an autocomplete combobox that suggests presets and in-use tags. Also has series name (with similarity hint when a related game is detected), last played date, notes, and a removable play history list.
- **Suggestions** (`/suggest`) — criteria form with player count, time range, complexity range, favorites-only toggle, unplayed-only toggle, max play count, min rating, series, categories, and mechanics. Five preset buttons (Quick game, Game night, Party, New to me, Top picks) stamp sensible defaults in one click. Category/mechanic chips are dynamically filtered to only show options present in games matching the current hard criteria — stale selections are visually distinguished. Results show a score badge, notes blurb (when present), and category/mechanic chips so unfamiliar players can understand each game at a glance. Scoring combines a variety bonus (months since last played, capped at 6) and personal rating. Paginated with "Show more."
- **Dictionary** (`/dictionary`) — searchable reference of all preset categories and mechanics with descriptions, so you know which tags apply to a game.
- **BGG lookup** — search and import metadata from BoardGameGeek (`/api/bgg/search`, `/api/bgg/{bggId}`), cached to absorb their aggressive rate limits.
- **Dark / light mode** — theme toggle persisted to `localStorage`, defaults to `prefers-color-scheme`.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/games` | list (filterable: `players`, `maxMinutes`, `category`) |
| GET | `/api/games/{id}` | detail |
| POST | `/api/games` | add |
| PUT | `/api/games/{id}` | edit |
| PATCH | `/api/games/{id}/favorite` | toggle favorite flag |
| DELETE | `/api/games/{id}` | remove |
| POST | `/api/games/{id}/plays` | log a play |
| DELETE | `/api/games/{id}/plays/{playId}` | undo a logged play |
| GET | `/api/games/{id}/plays` | play history for a game |
| PATCH | `/api/games/{id}/series` | update series name without a full PUT |
| GET | `/api/bgg/search?q=...` | proxy a BGG search |
| GET | `/api/bgg/{bggId}` | fetch full metadata from BGG |
| POST | `/api/suggestions` | scored list of owned games matching criteria |

## Project layout

```
game-tracker/
├─ PLAN.md                  # living design doc + decisions log
├─ docker-compose.yml       # postgres
├─ backend/                 # Spring Boot
│  └─ src/main/java/.../
│     ├─ game/              # entity, repo, controller, service
│     ├─ bgg/               # BggClient, DTOs, XML mapping
│     ├─ suggestion/        # SuggestionService, criteria, scoring
│     └─ config/            # CORS, caching, clock, SPA fallback
└─ frontend/                # Angular
   └─ src/app/
      ├─ games/             # game-list, game-form
      ├─ suggestions/       # suggest-page
      ├─ dictionary/        # dictionary-page
      └─ shared/
         ├─ models/         # game.ts, suggestion.ts, game-categories.ts, game-mechanics.ts, game-constants.ts, bgg.ts
         ├─ api/            # game-api.ts, suggestion-api.ts, bgg-api.ts
         └─ services/       # theme.service.ts, toast.service.ts, http-error.ts, format-utils.ts
```

## Production build

`mvn package` from the `backend/` directory builds the Angular app and bundles it into the Spring Boot jar's `static/` folder. The result is a single deployable jar that serves both the API and the SPA.

```bash
cd backend
./mvnw package
java -jar target/game-tracker-0.0.1-SNAPSHOT.jar
```

## Testing

```bash
cd backend && ./mvnw test
```

- `SuggestionService` — unit tests for hard filters, scoring, tie-breaking, limit clamping.
- BGG XML parsing — tests against saved fixtures in `src/test/resources/bgg/`.
- Repository tests — Testcontainers with real Postgres 15.

Angular unit tests are still skipped in favor of the e2e suite below. With Postgres + the backend running (steps 1–2 above):

```bash
cd frontend && npm run test:e2e        # headless
cd frontend && npm run test:e2e:ui     # Playwright's interactive UI mode
```

Covers the collection, add/edit form, suggestions, and dictionary pages end-to-end against the real dev backend — see [PLAN.md](PLAN.md)'s Testing strategy section for how it isolates itself from your actual collection data and why `workers: 1` is required.

## Status

All planned phases are complete. The app is fully functional for personal use — add games manually, log plays, get suggestions, and look up category/mechanic definitions. See [PLAN.md](PLAN.md) for the full roadmap and decision history.
