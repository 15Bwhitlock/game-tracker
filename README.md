# Game Tracker

[![CI](https://github.com/15Bwhitlock/game-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/15Bwhitlock/game-tracker/actions/workflows/ci.yml)

A personal web app to catalog board games and recommend what to play with friends based on player count, available time, and other criteria.

## Stack

- **Backend** — Java 25, Spring Boot 3.5, Maven, PostgreSQL 15, Flyway
- **Frontend** — Angular 21 (standalone components, signals)
- **Integrations** — BoardGameGeek XML API2 (Caffeine-cached, 24h TTL)

## Architecture

```
[Angular SPA :4200]  ──HTTP──▶  [Spring Boot API :8080]  ──▶  [PostgreSQL :5432]
                                       │
                                       └──▶  [BoardGameGeek XML API2]
```

## Prerequisites

- Java 25
- Maven 3.9+
- Node 20.19+ (Angular CLI is pulled via `npx`, no global install needed)
- Docker (for Postgres via `docker-compose`)

## Getting started

### 1. Start Postgres

```bash
docker compose up -d
```

### 2. Run the backend

BGG's XML API2 has required a registered app's bearer token since Oct 2025 — without one, `/api/bgg/*` still works but always returns empty results. Register at [boardgamegeek.com/using_the_xml_api](https://boardgamegeek.com/using_the_xml_api) (requires a BGG account), then put the token in `backend/.env` (gitignored, never commit it):

```bash
# backend/.env
export BGG_API_TOKEN=your-token-here
```

Load it before starting the backend:

```bash
cd backend
source .env
./mvnw spring-boot:run
```

If the backend is already running and you edit code, Spring Boot devtools auto-restarts it — but that restart does *not* reload environment variables. If it was started without `source .env` (or the `.env` file changed), fully stop the process and relaunch with `source .env` again.

API is served at `http://localhost:8080`. Flyway runs migrations on startup (including seed data); JPA validates the schema against entities (`ddl-auto=validate`). Interactive API docs (springdoc-openapi) at `http://localhost:8080/swagger-ui/index.html`, raw spec at `/v3/api-docs`.

### 3. Run the frontend

```bash
cd frontend
npm install
npm start
```

App is served at `http://localhost:4200`. `/api/*` requests are proxied to the backend (see [frontend/proxy.conf.json](frontend/proxy.conf.json)).

## Features

- **Collection** (`/collection`) — grid (default) or list view of owned games, remembered across visits; grid shows each game's cover art, list shows title, player count, average play time, and personal rating in a table. A BGG-linked/not-linked filter combines with search and sort. Client-side search filters by title, categories, mechanics, notes, player count, play time, and rating. Each game has Log Play (with undo toast), Edit, and Delete (with confirmation) actions. Select multiple games (a checkbox per row/tile, plus "select all visible") to bulk-add a category/mechanic tag or bulk-delete them all at once.
- **Add / Edit game** (`/games/add`, `/games/:id/edit`) — full form with button-group selectors for player count (1–10+), play time (15m–4h+), personal rating (1–10), and complexity (1–5). Categories and mechanics use a toggle-chip grid (selected items float to the top) with hover tooltips, a reference dialog, and an autocomplete combobox that suggests presets and in-use tags. Also has series name (with similarity hint when a related game is detected), last played date, notes, and a removable play history list — each play can carry its own optional note, added or edited inline.
- **Suggestions** (`/suggest`) — criteria form with player count, time range, complexity range, favorites-only toggle, unplayed-only toggle, max play count, min rating, series, categories, and mechanics. Five preset buttons (Quick game, Game night, Party, New to me, Top picks) stamp sensible defaults in one click. Category/mechanic chips are dynamically filtered to only show options present in games matching the current hard criteria — stale selections are visually distinguished. Results show a score badge, notes blurb (when present), and category/mechanic chips so unfamiliar players can understand each game at a glance. Scoring combines a variety bonus (months since last played, capped at 6), personal rating, and a bonus when BGG's own "best with N players" poll data agrees with the requested player count — shown as a reason line under each result. List or grid view (own toggle, list is the default), paginated with "Show more."
- **Dictionary** (`/dictionary`) — searchable reference of all preset categories and mechanics with descriptions, so you know which tags apply to a game. Click any category or mechanic name to jump to the Collection page filtered to games with that tag.
- **BGG lookup** — an "Import from BoardGameGeek" search box on the Add Game form (`/api/bgg/search`, `/api/bgg/{bggId}`) lets you search by name, pick a result, and auto-fill title/players/time/complexity/categories/mechanics/thumbnail/cover image/year published/notes (BGG's description). A small thumbnail + year show next to the title in the collection table and suggestion results; the full-size cover image and year appear in both pages' detail modals. A lookup always overwrites these fields with the new game's data — including Notes, even over text you'd typed yourself — so **Undo** (next to the import confirmation) is a real undo: it restores every field to exactly what it was right before that lookup. Search results already in your collection are badged "owned," and importing one shows a dismissible warning linking to the existing entry — this check is by BGG id, not title text, so it still catches it even if you'd saved it under a different name. Cached to absorb BGG's aggressive rate limits; requires a `BGG_API_TOKEN` (see above) or it degrades to "No matches" instead of erroring. A game already linked to BGG also gets a **Refresh from BGG** button on its edit form — re-fetches that same game's data and re-applies it, for when a field was added after you first imported it or BGG's own listing has since been corrected; same overwrite-with-Undo behavior as the initial import.
- **Export / backup** — an "Export" button on the Collection page downloads the entire collection (independent of any active search/filter) as a timestamped JSON file, suitable as a manual backup.
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
| POST | `/api/games/{id}/plays` | log a play (optional notes) |
| PATCH | `/api/games/{id}/plays/{playId}` | set or clear a play's notes |
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
│     └─ config/            # CORS, caching, clock, SPA fallback, OpenAPI
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

Tests cover the collection, add/edit form, suggestions, dictionary, and app shell (theme/nav/404) pages end-to-end against the real dev backend — including suggestion scoring/ranking order, the series filter, and simulated HTTP-failure error banners — plus direct API checks for endpoints with no UI path. See [PLAN.md](PLAN.md)'s Testing strategy section for how it isolates itself from your actual collection data and why `workers: 1` is required.

Both suites run automatically in CI (`.github/workflows/ci.yml`) on every push/PR to `main` — see PLAN.md's CI section for how the e2e job stands up a throwaway Postgres and backend without needing a `BGG_API_TOKEN` secret.

## Status

All planned phases are complete. The app is fully functional for personal use — add games manually, log plays, get suggestions, and look up category/mechanic definitions. See [PLAN.md](PLAN.md) for the full roadmap and decision history.
