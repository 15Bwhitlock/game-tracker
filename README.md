# Game Tracker

A personal web app to catalog board games and recommend what to play with friends based on player count, available time, and other criteria.

## Stack

- **Backend** — Java 17, Spring Boot 3.4, Maven, PostgreSQL 15, Flyway
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

- **Collection** (`/collection`) — table of owned games with title, player count, average play time, and personal rating. Client-side search filters by title, players, and time. Each row has Log Play, Edit, and Delete (with confirmation) actions.
- **Add / Edit game** (`/games/add`, `/games/:id/edit`) — full form with button-group selectors for player count (1–10+), play time (15m–4h+), personal rating (1–10), and complexity (1–5). Categories and mechanics use a toggle-chip grid (selected items float to the top) with hover tooltips and a reference dialog. Custom categories/mechanics can be typed in. Also has a Last Played date and a Notes field.
- **Log play** — "Log play" button on each collection row sets `lastPlayedAt` to today, feeding the variety bonus in suggestion scoring.
- **Suggestions** (`/suggest`) — criteria form (player count, max time, complexity range, categories, mechanics) → ranked results with a score badge and human-readable reasons. Scoring combines a variety bonus (months since last played, capped at 6) and personal rating.
- **Dictionary** (`/dictionary`) — searchable reference of all preset categories and mechanics with descriptions, so you know which tags apply to a game.
- **BGG lookup** — search and import metadata from BoardGameGeek (`/api/bgg/search`, `/api/bgg/{bggId}`), cached to absorb their aggressive rate limits.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/games` | list (filterable: `players`, `maxMinutes`, `category`) |
| GET | `/api/games/{id}` | detail |
| POST | `/api/games` | add |
| PUT | `/api/games/{id}` | edit / log play |
| DELETE | `/api/games/{id}` | remove |
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
      └─ shared/            # GameApi, SuggestionApi, game-categories, game-mechanics
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

Frontend tests are intentionally skipped until a recurring bug warrants them.

## Status

All planned phases are complete. The app is fully functional for personal use — add games manually, log plays, get suggestions, and look up category/mechanic definitions. See [PLAN.md](PLAN.md) for the full roadmap and decision history.
