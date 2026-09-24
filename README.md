# Game Tracker

[![CI](https://github.com/15Bwhitlock/game-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/15Bwhitlock/game-tracker/actions/workflows/ci.yml)

A personal web app to catalog board games and recommend what to play with friends based on player count, available time, and other criteria.

## Stack

- **Backend** — Java 25, Spring Boot 3.5, Maven, PostgreSQL 15, Flyway
- **Frontend** — Angular 21 (standalone components, signals)
- **Integrations** — BoardGameGeek XML API2 (Caffeine-cached, 24h TTL; needs a `BGG_API_TOKEN`)

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
- **A BoardGameGeek API token** — free, but required for anything that talks to BGG (game search/import, Refresh from BGG, the Wishlist's trending list). BGG has required a registered app's token since Oct 2025. See [Run the backend](#2-run-the-backend) for how to get and set it. Without one the app still runs; those features just return nothing.

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
- **Suggestions** (`/suggest`) — criteria form with player count, time range, complexity range, favorites-only toggle, unplayed-only toggle, max play count, min rating, series, categories, and mechanics. Five preset buttons (Quick game, Game night, Party, New to me, Top picks) stamp sensible defaults in one click. Category/mechanic chips are dynamically filtered to only show options present in games matching the current hard criteria — stale selections are visually distinguished. Results show a score badge, notes blurb (when present), and category/mechanic chips so unfamiliar players can understand each game at a glance. Scoring combines a variety bonus (months since last played, capped at 6), personal rating, and a bonus when BGG's own "best with N players" poll data agrees with the requested player count — shown as a reason line under each result. List or grid view (own toggle, grid is the default), paginated with "Show more."
- **Wishlist** (`/wishlist`) — games you don't own yet, kept for future reference, with optional notes per item and an expansion badge that warns when an expansion's base game isn't in your collection. Two ways to find something: **Browse Trending** shows BGG's current hot list enriched with full details, filterable by category/mechanic; **Search by name** reuses the same BGG lookup the add-game form uses. Either way, "Add to Wishlist" saves it; from your wishlist you can filter by category/mechanic, remove an entry, or "Move to Collection" to turn it into an owned game (personal fields like rating start empty and can be filled in afterward, same as any BGG import).
- **Dictionary** (`/dictionary`) — searchable reference of every preset category and mechanic, a glossary of hobby jargon, and guides for complexity, player count, play time and personal ratings. Click a category or mechanic name to jump to the Collection filtered to that tag. **Everything curated is editable**: the pencil on any category, mechanic or glossary entry saves your own wording (an "edited" badge marks it, and ↩ restores the original); the shipped text stays in the code and your edit is stored as an override. Categories and mechanics that come in from BGG but aren't presets appear under **From Your Collection** as "Not yet described" for you to fill in (or remove), and entries added since your last visit carry a **New** badge. Search matches your edited text.
- **BGG lookup** — an "Import from BoardGameGeek" search box on the Add Game form (`/api/bgg/search`, `/api/bgg/{bggId}`) lets you search by name, pick a result, and auto-fill title/players/time/complexity/categories/mechanics/thumbnail/cover image/year published/notes (BGG's description). A small thumbnail + year show next to the title in the collection table and suggestion results; the full-size cover image and year appear in both pages' detail modals. A lookup always overwrites these fields with the new game's data — including Notes, even over text you'd typed yourself — so **Undo** (next to the import confirmation) is a real undo: it restores every field to exactly what it was right before that lookup. Search results already in your collection are badged "owned," and importing one shows a dismissible warning linking to the existing entry — this check is by BGG id, not title text, so it still catches it even if you'd saved it under a different name. Cached to absorb BGG's aggressive rate limits; requires a `BGG_API_TOKEN` (see above) or it degrades to "No matches" instead of erroring. A game already linked to BGG also gets a **Refresh from BGG** button on its edit form — re-fetches that same game's data and re-applies it, for when a field was added after you first imported it or BGG's own listing has since been corrected; same overwrite-with-Undo behavior as the initial import.
- **Export** — an "Export" button on the Collection page downloads the collection (independent of any active search/filter) as a timestamped JSON file.
- **Settings** (`/settings`) — everything that isn't a per-game task:
  - **Backup & restore** — download one JSON file with your collection, play history, wishlist and Dictionary edits, or restore from one. Restore *replaces* everything, is all-or-nothing (a bad file changes nothing), and asks for confirmation first.
  - **Refresh from BoardGameGeek** — re-fetches every BGG-linked game with progress and a Stop button (needs a `BGG_API_TOKEN`). BGG's values win where it has one and Notes are replaced with BGG's description; ratings, plays and other personal fields are kept.
  - **Preferences** (saved in this browser) — default Collection sort; what the Suggest page starts with (players, time, complexity); show/hide "New" badges.
  - **Dictionary housekeeping** — reset all your edits to the originals, or clear the "Not yet described" entries.
- **Dark / light mode** — header button, persisted to `localStorage`, defaults to `prefers-color-scheme`.

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
| GET | `/api/bgg/hot` | BGG's current hot list, enriched with full details |
| POST | `/api/suggestions` | scored list of owned games matching criteria |
| GET | `/api/wishlist` | list the wishlist |
| POST | `/api/wishlist` | add a game to the wishlist |
| DELETE | `/api/wishlist/{id}` | remove a wishlist entry |
| PATCH | `/api/wishlist/{id}/notes` | set or clear a wishlist entry's notes |
| POST | `/api/wishlist/{id}/move-to-collection` | convert a wishlist entry into an owned game |
| GET | `/api/tag-descriptions` | dictionary rows: "Not yet described" placeholders and your edits |
| PUT | `/api/tag-descriptions/override` | edit a curated category, mechanic or glossary entry (upsert) |
| PATCH | `/api/tag-descriptions/{id}` | write or correct a description |
| DELETE | `/api/tag-descriptions/{id}` | remove a row (reverts an edit to the shipped text) |
| DELETE | `/api/tag-descriptions/pending` | clear every "Not yet described" placeholder |
| DELETE | `/api/tag-descriptions/overrides` | reset all edits of curated entries |
| GET | `/api/settings` | app settings (when the Dictionary was last viewed) |
| POST | `/api/settings/dictionary-viewed` | stamp the Dictionary as viewed now (resets "New" badges) |
| GET | `/api/backup` | download everything as JSON |
| POST | `/api/backup/restore` | replace everything with a backup file |

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
│     ├─ wishlist/          # Wishlist entity, repo, controller, service
│     ├─ tagdescription/    # Dictionary rows: placeholders + edits of curated entries
│     ├─ settings/          # app settings (Dictionary last-viewed)
│     ├─ backup/            # full export / all-or-nothing restore
│     └─ config/            # CORS, caching, clock, SPA fallback, OpenAPI
└─ frontend/                # Angular
   └─ src/app/
      ├─ games/             # game-list, game-form
      ├─ suggestions/       # suggest-page
      ├─ wishlist/          # wishlist-page
      ├─ dictionary/        # dictionary-page
      ├─ settings/          # settings-page (backup, BGG refresh, preferences, housekeeping)
      └─ shared/
         ├─ models/         # game.ts, suggestion.ts, game-categories.ts, game-mechanics.ts, game-constants.ts, bgg.ts, wishlist.ts, tag-description.ts, app-settings.ts
         ├─ api/            # game-api.ts, suggestion-api.ts, bgg-api.ts, wishlist-api.ts, tag-description-api.ts, app-settings-api.ts, backup-api.ts
         └─ services/       # theme.service.ts, preferences.service.ts, toast.service.ts, http-error.ts, format-utils.ts, bgg-merge.ts
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
- Dictionary rows, settings and backup/restore — service and controller tests, including the concurrent-save race on new tags and restore's id remapping.

Angular unit tests are still skipped in favor of the e2e suite below. With Postgres + the backend running (steps 1–2 above):

```bash
cd frontend && npm run test:e2e        # headless
cd frontend && npm run test:e2e:ui     # Playwright's interactive UI mode
```

Tests cover the collection, add/edit form, suggestions, wishlist, dictionary, settings, and app shell (theme/nav/404) pages end-to-end against the real dev backend — including suggestion scoring/ranking order, the series filter, and simulated HTTP-failure error banners — plus direct API checks for endpoints with no UI path. See [PLAN.md](PLAN.md)'s Testing strategy section for how it isolates itself from your actual collection data and why `workers: 1` is required.

Tests for actions that would rewrite or delete real data (BGG refresh, restore, Dictionary housekeeping) mock the network so they never touch your collection.

Both suites run automatically in CI (`.github/workflows/ci.yml`) on every push/PR to `main` — see PLAN.md's CI section for how the e2e job stands up a throwaway Postgres and backend without needing a `BGG_API_TOKEN` secret.

## Status

All planned phases are complete. The app is fully functional for personal use — add games manually, log plays, get suggestions, look up and customize category/mechanic definitions, and back up or restore everything from Settings. See [PLAN.md](PLAN.md) for the full roadmap and decision history.
