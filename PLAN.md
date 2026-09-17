# Game Tracker — Project Plan

A personal web app to catalog board games and recommend what to play with friends based on player count, available time, and other criteria.

> This is a living document. Update it as decisions change or new requirements appear. Keep the **Decisions log** at the bottom in sync.

---

## Decisions so far

| Area | Choice |
|---|---|
| Game type | Board games |
| Data entry | Manual + BoardGameGeek (BGG) API lookup |
| Users | Single-user, no login |
| Database | PostgreSQL |
| Backend | Java + Spring Boot + Maven |
| Frontend | Angular + TypeScript |

---

## High-level architecture

```
[Angular SPA :4200]  ──HTTP──▶  [Spring Boot API :8080]  ──▶  [PostgreSQL]
                                       │
                                       └──▶  [BoardGameGeek XML API2]
```

Single Maven project for the backend, separate Angular project for the frontend (sibling folders: `backend/` and `frontend/`). Later the built Angular `dist/` can be bundled into the Spring Boot jar's `static/` folder for one-binary deployment.

---

## Phase 1 — Backend skeleton

### Project setup
- Java 25, Maven, Spring Boot 3.5.x.
- Dependencies: `Spring Web`, `Spring Data JPA`, `PostgreSQL Driver`, `Validation`, `Flyway` (`flyway-core` + `flyway-database-postgresql`), `Spring Boot DevTools`. Lombok skipped for now (avoid IDE plugin requirement; explicit getters/setters are fine for this size).

### Database
- `docker-compose.yml` at repo root with one Postgres service (`docker compose up -d`).
- **Postgres 15**, not 16. Older Docker Desktop (20.10) seccomp profile blocks syscalls Postgres 16 needs (`popen failure: Operation not permitted` from `initdb`). Compose service has `security_opt: [seccomp:unconfined]` — needed in addition to the version drop; one alone wasn't enough on this machine. Reconsider when Docker Desktop is upgraded.
- `application.yml` uses `spring.jpa.hibernate.ddl-auto=validate` with **Flyway from day 1** (`V1__init_schema.sql`). Schema is version-controlled; JPA only validates that the entity matches the DB. (Original plan said start with `ddl-auto=update` and migrate to Flyway later — flipped to avoid the awkward Flyway-cutover where Flyway expects to own the schema from the first migration.)

### Domain model

Start with one rich entity, add joins only if needed.

```
Game
 ├─ id (Long, PK)
 ├─ bggId (Integer, nullable)        // link back to BGG
 ├─ title (String)
 ├─ minPlayers, maxPlayers (int)
 ├─ minPlayTimeMinutes, maxPlayTimeMinutes (int)
 ├─ complexityWeight (Double, 1.0–5.0, BGG's scale)
 ├─ categories (List<String>, @ElementCollection)  // e.g. "Strategy", "Party"
 ├─ mechanics (List<String>, @ElementCollection)   // e.g. "Deck Building"
 ├─ thumbnailUrl (String)
 ├─ ownedSince (LocalDate)
 ├─ personalRating (Integer, nullable, 1–10)
 ├─ notes (String)
 ├─ lastPlayedAt (LocalDate, nullable)             // feeds variety scoring
 ├─ favorite (boolean, default false)              // used by favoritesOnly suggestion filter
 ├─ seriesName (String, nullable)                  // groups related/variant games (e.g. "Fluxx")
 └─ playCount (int, @Formula, derived)             // COUNT(*) from game_plays; read-only
```

Keep `categories` and `mechanics` as `@ElementCollection<String>` to start — simple, no extra tables. Promote to entities only if querying/filtering on them gets heavy.

---

## Phase 2 — Backend API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/games` | list, with optional `?players=4&maxMinutes=60&category=Strategy` filters |
| GET | `/api/games/{id}` | detail |
| POST | `/api/games` | add |
| PUT | `/api/games/{id}` | edit |
| DELETE | `/api/games/{id}` | remove |
| GET | `/api/bgg/search?q=catan` | proxy a BGG search |
| GET | `/api/bgg/{bggId}` | fetch full metadata from BGG |
| POST | `/api/suggestions` | body = criteria → `SuggestionPage` (paginated scored list) |
| POST | `/api/games/{gameId}/plays` | log a play (optional `playedAt` date in body; defaults to today) |
| DELETE | `/api/games/{gameId}/plays/{playId}` | undo a logged play |
| GET | `/api/games/{gameId}/plays` | list full play history for a game |
| PATCH | `/api/games/{id}/favorite` | toggle favorite flag |

### Error handling
`GlobalExceptionHandler` (`@RestControllerAdvice`) handles:
- `GameNotFoundException` → 404 with `{"message": "..."}` body
- `MethodArgumentNotValidException` → 400 with first validation error message
- Any other `Exception` → 500 with generic message

### BGG integration notes
BGG returns XML, not JSON, and rate-limits aggressively.
- **Implemented**: `RestClient` + `jackson-dataformat-xml` (chose Jackson over JAXB to avoid extra runtime config; XmlMapper just works).
- `BggClient` exposes `search(query)` → `List<BggSearchHit>` and `getDetails(id)` → `Optional<BggGameDetails>`. Both are `@Cacheable` (Caffeine, 24h TTL, max 500 entries each, separate caches `bggSearch` / `bggThing` — see `config/CacheConfig`).
- XML parsers (`parseSearchXml` / `parseThingXml`) are package-private static methods so unit tests drive them with saved fixtures (`src/test/resources/bgg/*.xml`) — no Spring context, no network.
- Network errors (`RestClientResponseException`) degrade to empty result rather than 500 — keeps the UI responsive when BGG hiccups.
- BGG returns `0` for `averageweight` on unrated games; `BggClient` maps that to null `complexityWeight` so it isn't treated as "trivially light".

### Suggestion logic (`SuggestionService`)
1. **Hard filters** (implemented): player range `[minPlayers, maxPlayers]` must overlap game's `[minPlayers, maxPlayers]`; optional `minMinutes` (game's `minPlayTimeMinutes >= minMinutes`); optional `maxMinutes` (game's `maxPlayTimeMinutes <= maxMinutes`); optional `[minComplexity, maxComplexity]` range mapped to BGG weight bands (1→1.0–1.7, 2→1.7–2.5, 3→2.5–3.3, 4→3.3–4.0, 5→4.0–5.0; games with null weight excluded when complexity constrained); optional category/mechanic any-match (case-insensitive); optional `favoritesOnly` (only games with `favorite = true`); optional `unplayedOnly` (only games with `playCount = 0` and no `lastPlayedAt`); optional `maxPlayCount` (games with `playCount > maxPlayCount` excluded); optional `minRating` (games with `personalRating < minRating` or null rating excluded).
2. **Scoring** (implemented):
   - **Variety**: 1 point per full month since `lastPlayedAt`, capped at 6. Never-played games get the full 6.
   - **Rating**: `personalRating / 2` (range 0.5–5.0); 0 if null.
   - **Best player count**: deferred — needs a `bestPlayerCount` field on `Game` sourced from BGG poll data. TODO when BGG import is wired up.
3. **Tie-breaking** (implemented): score desc → `personalRating` desc (null treated as 0) → title (case-insensitive). Stable, predictable order.
4. **Pagination**: `PAGE_SIZE = 10`. `SuggestionCriteria.page` (0-based) selects the page; `SuggestionPage` returns `items`, `page`, `pageSize`, `totalCount`, and `hasMore()`. Replaced the old `limit` parameter (was clamped `[1, 50]`).
5. **Reasons**: human-readable strings for the UI ("Never played yet", "Haven't played in 3 months", "Highly rated (8/10)"). Returned alongside score in `ScoredGame`.

### CORS
`WebMvcConfigurer` allowing `http://localhost:4200` for development.

---

## Phase 3 — Frontend skeleton

### Project setup
- **Angular 21** (current latest as of bootstrap), standalone components, signal-based state, modern control flow (`@if`, `@for`).
- Bootstrapped with `npx -y -p @angular/cli@latest ng new frontend --style=scss --routing=true --ssr=false --skip-git=true --defaults` (the system-installed Angular CLI is 13.x — too old; using `npx` pulls a current CLI without touching the global install).
- **No UI library yet** — using plain SCSS. Plan originally offered Angular Material *or* Tailwind; deferred until forms/tables get more complex. Revisit when adding the BGG search autocomplete and suggestion page (Material gives a solid autocomplete out of the box).
- `proxy.conf.json` proxies `/api/*` → `http://localhost:8080`. Wired into `angular.json` `serve.options.proxyConfig`. CORS is also configured server-side (`WebConfig`) but the proxy means dev never needs it.

### Routes / components
- `/collection` → `GameList` — table of games with:
  - **Add game** button in the header → navigates to `/games/add`.
  - **Search input** above the table — client-side filter that matches against title, categories, mechanics, notes (substring), and numerically against player count, play time, and personal rating when the query parses as a number. Will likely move server-side once the BGG-imported collection grows.
  - **Log play** button on each row — sets `lastPlayedAt` to today via PUT.
  - **Delete** button with a confirmation `<dialog>` showing the game title before firing the DELETE call.
- `/games/add` → `GameForm` — standalone add page. Fields: title, players (btn-group 1–10+), play time (btn-group 15m–4h+), personal rating (btn-group 1–10), complexity (btn-group 1–5), last played (date), notes, categories (toggle grid + custom entry), mechanics (toggle grid + custom entry).
- `/games/:id/edit` → `GameForm` — same component as add; detects `:id` param via `ActivatedRoute`, loads game via GET, calls PUT on save.
- `/games/:id` → `GameDetail` — read-only view + "play now" / "edit" buttons (not yet built)
- `/suggest` → `SuggestPage` (file: `suggestions/suggest-page/`) — criteria form with: players (range btn-group), time (range btn-group), complexity (range btn-group), favorites-only toggle, unplayed-only toggle, max play count selector, min rating selector, and category/mechanic chip grids. Chips are dynamically filtered to only show options present in games that match the current hard criteria (player/time/complexity/rating) — stale chips (selected but no longer available) are visually distinguished. Five preset buttons ('Quick game', 'Game night', 'Party', 'New to me', 'Top picks') fill the draft with sensible defaults. Results show score badge, meta line (players · time · weight · rating), and backend reasons. Paginated with "Show more" appending to current results.
- `/dictionary` → `DictionaryPage` — searchable reference listing all preset categories and mechanics with descriptions. Searches both name and description fields.

### Services
- `GameApi` (file: `shared/api/game-api.ts`) — CRUD wrappers around `/api/games`.
- `BggApi` (file: `shared/api/bgg-api.ts`) — search and lookup wrappers around `/api/bgg/*`.
- `SuggestionApi` (file: `shared/api/suggestion-api.ts`) — POSTs criteria to `/api/suggestions`. Strips null/empty fields client-side so the backend's `@Min(1)` on `maxMinutes` doesn't trip on optional inputs.
- `ThemeService` (file: `shared/services/theme.service.ts`) — dark/light mode toggle. Persists to `localStorage`, defaults to `prefers-color-scheme`. Exposes `isDark` signal and `toggle()`.
- `ToastService` (file: `shared/services/toast.service.ts`) — signal-based toast queue. `show(message, actionLabel, onAction, duration?)` auto-dismisses after `duration` ms (default 5000). `dismiss(id)` for manual close. `toast.component.ts` renders the queue.
- `describeHttpError` (file: `shared/services/http-error.ts`) — shared error-description utility. Extracts `error.message` from the JSON body first (relies on `GlobalExceptionHandler` always returning `{"message": "..."}`), then falls back to status-specific strings (404, 400, 0). Replaces the three duplicate `describe()` helpers that were copy-pasted across components and leaked Angular's internal HTTP error message to users.

---

## Phase 4 — Wire it up & polish
- End-to-end smoke: add a game via BGG search, verify it persists, run a suggestion query.
- Seed a few games so the suggestion screen isn't empty in development.
- Replace `ddl-auto=update` with **Flyway** migrations once the schema stabilizes (`V1__init.sql`).
- Optional: a "log a play" button that updates `lastPlayedAt` — feeds variety scoring.

---

## Suggested folder layout

```
game-tracker/
├─ PLAN.md                     # this file
├─ docker-compose.yml          # postgres
├─ backend/
│  ├─ pom.xml
│  └─ src/main/java/com/braydenwhitlock/gametracker/
│     ├─ game/        # entity, repo, controller, service
│     ├─ bgg/         # BggClient, DTOs, XML mapping
│     ├─ suggestion/  # SuggestionService, criteria DTO, scoring
│     └─ config/      # CORS, caching, GlobalExceptionHandler
└─ frontend/
   ├─ angular.json
   ├─ tsconfig.json   # path aliases: @shared/models, @shared/api, @shared/services
   └─ src/app/
      ├─ games/
      ├─ suggestions/
      ├─ dictionary/
      ├─ shared/
      │  ├─ models/   # game.ts, suggestion.ts, game-categories.ts, game-mechanics.ts, game-constants.ts, bgg.ts + index.ts
      │  ├─ api/      # game-api.ts, suggestion-api.ts, bgg-api.ts + index.ts
      │  └─ services/ # theme.service.ts, toast.service.ts, toast.component.ts, http-error.ts, format-utils.ts + index.ts
      └─ app.routes.ts
```

---

## Build order

1. **Vertical slice first**: Postgres up, `Game` entity, `GET/POST /api/games`, Angular `/collection` page calling it. Nothing else — prove the stack works end-to-end.
2. Add BGG lookup so adding a game is pleasant.
3. Build the suggestion endpoint + page.
4. Flyway, UI polish, deployment.

---

## Testing strategy

Be selective. Chasing coverage on a personal project burns time without payoff. Write tests where a silent break would actually hurt — and skip the rest.

### High-value targets (write tests here)
- **`SuggestionService` scoring** — pure logic, no I/O, easy to refactor wrong. Cover: hard-filter cases (player count out of range, time exceeds max), tie-breaking, variety bonus when `lastPlayedAt` is old, rating bonus.
- **BGG XML parsing** — external format you don't control. Use saved XML samples as fixtures (`src/test/resources/bgg/search-catan.xml`, `thing-13.xml`) and assert the mapper produces the right DTO. Catches breakage if BGG tweaks their schema.
- **Repository queries** that use custom JPQL or specifications — test against real Postgres via Testcontainers, not H2 (H2 quietly accepts SQL Postgres rejects).

### Lower-value (skip unless something feels fragile)
- Trivial CRUD controllers — `@WebMvcTest` is fine if you want a smoke test, but one e2e test usually covers the same ground.
- Getters/setters, DTO mappers — no logic, no test needed.
- Angular unit tests (component/service specs in isolation) — still skipped; the Playwright e2e suite below covers the actual user-facing behavior more cheaply than mocking Angular's DI graph would.

### Tooling
- **JUnit 5** + **AssertJ** for assertions (`assertThat(...)` reads better than JUnit's built-ins).
- **Mockito** for mocking the `BggClient` in `SuggestionService` tests.
- **Testcontainers** (`org.testcontainers:postgresql`) for integration tests — spins up a real Postgres in Docker per test class. Add a `@Testcontainers` base class to share the container across tests.
- **`@DataJpaTest`** + Testcontainers for repository tests; **`@SpringBootTest`** for one or two end-to-end happy-path tests against the full stack.
- **Playwright** (`frontend/e2e/`) for frontend e2e — see below.
- Run tests in CI later if you set one up; for now, `mvn test` locally before committing is enough.

### Rough target
- ~80–90% coverage on `SuggestionService` and BGG parsing.
- One end-to-end "add a game, query suggestions, get it back" integration test.
- Everything else: untested unless a bug shows up there.

### Frontend e2e (Playwright)

Reverses the earlier "skip frontend tests" call — see the 2026-09-11 decision log entry for why. Lives in `frontend/e2e/`, config at `frontend/playwright.config.ts`.

- **No isolated test database.** Tests run against whatever backend + Postgres `docker compose up -d` / `./mvnw spring-boot:run` are already serving — there's no separate test profile for a personal project this size. Every test seeds its own game(s) through the real `/api/games` via `e2e/support/api.ts`'s `seedGame`/`deleteGame`, and cleans up afterward, so the suite never depends on or permanently mutates the actual collection. Titles are prefixed (`e2eTitle()`) so a failed run's leftovers are easy to spot and sweep.
- **`workers: 1` is required, not a preference.** Different spec files sharing one real database means a game seeded by one file can be deleted by another file's cleanup mid-test if they run concurrently — hit this for real on the first run (`game-form.spec.ts`'s cleanup swept up a game `collection.spec.ts` had just seeded). Sequential execution is the fix; don't raise `workers` without re-solving that.
- Run with `npm run test:e2e` (headless) or `npm run test:e2e:ui` (Playwright's UI mode) from `frontend/`, backend + Postgres already running.
- Covers: collection list/search/log-play/delete, add/edit form including validation errors, suggestion criteria/presets/results including the "no player count" validation error, and the dictionary search. Deliberately does **not** cover `SuggestionCriteria`'s complexity-range validation (the `minComplexity`/`maxComplexity` bug fixed 2026-09-11) — the UI's button-group only ever submits 1–5, so that edge case is only reachable by calling the API directly and belongs in a backend unit/integration test instead, not e2e.

---

## Code documentation

Aim for comments that explain **why**, not **what**. Well-named methods and variables already say what the code does — a comment that just restates the code is noise, and noise rots fastest because nobody updates it.

### Where comments earn their keep
- **Javadoc on public API surfaces** — every controller endpoint, every service method called from another package, every DTO field whose meaning isn't obvious from its name. Include parameter constraints, return semantics, and what exceptions can fly out.
  ```java
  /**
   * Returns the top {@code limit} games matching the criteria, ordered by score (highest first).
   * Hard-filters by player count and max session time, then ranks by best-player-count fit,
   * recency (older lastPlayedAt scores higher), and personal rating.
   *
   * @param criteria filter and scoring inputs; must not be null
   * @param limit max results to return; clamped to [1, 50]
   */
  public List<ScoredGame> suggest(SuggestionCriteria criteria, int limit) { ... }
  ```
- **"Why" comments on non-obvious logic** — magic numbers, workarounds, surprising tradeoffs, scoring weights.
  ```java
  // BGG rate-limits at ~2 req/sec; cache for 24h so a flaky response doesn't break the UI
  // Variety bonus: +1 point per month since lastPlayedAt, capped at 6 — keeps fresh games surfacing
  ```
- **Class-level Javadoc** on services and key components — one paragraph on responsibility and collaborators.
- **TODOs with context** — `// TODO(brayden): switch to Flyway once schema stabilizes` is fine; `// TODO: fix this` is not.

### Where to skip
- Getters, setters, trivial constructors.
- Comments that restate the code (`// increment counter` above `counter++`).
- File headers with author/date — git already has that.
- Inline comments narrating what each line does — break the method up or rename instead.

### Frontend (TypeScript / Angular)
- **TSDoc** on exported services, public component inputs/outputs, and shared models. Same rule: explain the contract, not the implementation.
- Component templates: prefer descriptive variable names over HTML comments.

### Living rule
If a reviewer (or future-you) would ask "why does this do that?", write a comment. If they'd say "obviously," don't.

---

## Status

- [x] Phase 1 — Backend skeleton
  - [x] Spring Boot project generated (manually, equivalent to Spring Initializr)
  - [x] `docker-compose.yml` for Postgres (Postgres 15 + `seccomp:unconfined` — see Database section)
  - [x] `Game` entity + repository
  - [x] Basic CRUD controller (list / get / create / update / delete)
  - [x] Testcontainers set up + repository integration tests (persistence + cascade delete)
  - [x] **Flyway from day 1** — `V1__init_schema.sql` (moved from Phase 4)
- [x] Phase 2 — BGG + suggestions (backend)
  - [x] `BggClient` with caching (Caffeine, 24h TTL, separate caches for search & thing)
  - [x] Search + thing endpoints (`/api/bgg/search?q=...`, `/api/bgg/{bggId}`)
  - [x] BGG XML parsing tests with saved fixtures (search-catan.xml, thing-13.xml, thing-unknown.xml, thing-unrated.xml)
  - [x] `SuggestionService` with scoring (variety + rating + best-player-count, sourced from BGG's `suggested_numplayers` poll-summary)
  - [x] `SuggestionService` unit tests (13 tests covering hard filters, variety/rating scoring, tie-breaking, limit clamping)
  - [x] `POST /api/suggestions` endpoint
- [x] Phase 3 — Frontend skeleton
  - [x] Angular project generated (Angular 21 via `npx`)
  - [x] Collection page (`/collection`) — table, modal add-form, client-side search
  - [x] Add-game form: button groups for player count (1–10+), play time (15m–4h+), personal rating (1–10), complexity (1–5); categories + mechanics toggle grids with tooltips and info dialogs; notes textarea; last played date; autocomplete combobox for custom category/mechanic entry (suggests presets + collection-used tags, falls back to "+ Add" for new ones)
  - [x] Collection table: "Average Game Time" column with h/m formatting; single value when min=max players; "Personal Rating" column header; delete confirmation modal; Edit button; Log Play button
  - [x] Edit form — `/games/:id/edit` reuses `GameForm`, pre-populates draft from API, calls PUT on save
  - [x] ~~BGG autocomplete in add form~~ — removed; BGG XML API2 returns 401, no viable free API exists. Manual entry only.
  - [x] `BggApi` service (frontend) — wrappers around `/api/bgg/search` and `/api/bgg/{bggId}`
  - [x] Suggestion page (`/suggest`) — criteria form + paginated ranked results with score badge, notes blurb (when present), and category/mechanic chips (capped at 4, +N more pill)
  - [x] Dictionary page (`/dictionary`) — searchable reference for all categories and mechanics with descriptions
  - [x] `ThemeService` — dark/light mode toggle, persisted to localStorage, respects `prefers-color-scheme`
  - [x] `ToastService` + `toast.component.ts` — signal-based toast queue with action support and auto-dismiss
- [x] Phase 4 — Polish
  - [x] ~~Flyway migrations~~ (done in Phase 1)
  - [x] Seed data — V3 migration with 8 popular games (Catan, Pandemic, Wingspan, etc.) including categories and mechanics
  - [x] Play history — `game_plays` table (V4), `GamePlayController` (`POST/DELETE/GET /api/games/{id}/plays`), `LogPlayResponse` returning game + playId, `Game.playCount` @Formula; replaced the old "set lastPlayedAt via PUT" approach
  - [x] `favorite` field — V5 migration adds `favorite BOOLEAN` to `games`; exposed on `Game` entity; `SuggestionCriteria.favoritesOnly` filter uses it
  - [x] `seriesName` field — V6 migration adds `series_name VARCHAR(255)` to `games`; series suggestion on add form detects titles sharing a significant word and prompts the user to group both into a named series; `PATCH /api/games/{id}/series` updates an existing game's series without a full PUT
  - [x] `GlobalExceptionHandler` — `@RestControllerAdvice` mapping `GameNotFoundException` → 404, validation errors → 400, generic → 500
  - [x] `describeHttpError` shared utility — replaces three duplicate `describe()` helpers; extracts `error.message` from JSON body first, then status-specific fallbacks; removes Angular's internal HTTP message from user-facing errors
  - [x] Additional suggestion filters — `unplayedOnly`, `maxPlayCount`, `minRating` added to `SuggestionCriteria` (backend record + frontend interface + `SuggestionApi.clean()` + `passesHardFilters`)
  - [x] Suggestion page presets — five quick-select buttons ('Quick game', 'Game night', 'Party', 'New to me', 'Top picks') that stamp sensible defaults into the draft criteria
  - [x] Dynamic chip availability — category/mechanic chips filtered to only options present in games matching current hard criteria; stale chips (selected but out-of-range) visually distinguished
  - [x] Play history on edit form — `removePlay()` on `GameForm`, play history list with ✕ per entry, backed by existing `DELETE /api/games/{id}/plays/{playId}` endpoint
  - [x] Frontend folder restructure — `shared/` split into `models/`, `api/`, `services/`; TypeScript path aliases (`@shared/*`) in `tsconfig.json`; barrel `index.ts` in each subfolder; VS Code file nesting for `.ts`/`.html`/`.scss` groups
  - [ ] Javadoc/TSDoc pass on public APIs (optional for personal use)
  - [x] Playwright e2e suite (`frontend/e2e/`) — collection, add/edit form, suggestions, dictionary; see Testing strategy section
  - [x] Swagger/OpenAPI (`springdoc-openapi`) — `/swagger-ui/index.html`, `/v3/api-docs`; `@Operation`/`@Tag` on all controllers
  - [x] Production build — `frontend-maven-plugin` builds Angular and copies dist into Spring Boot `static/`; `WebConfig` forwards unknown routes to `index.html` for Angular router
  - [x] "Refresh from BGG" button on the edit form for already-linked games — re-fetches and re-applies BGG data (title/players/time/complexity/categories/mechanics/images/year/best-player-counts/notes) without a fresh search; shares the same apply/confirm/Undo machinery as the add-form import
  - [x] Export/backup — "Export" button on the Collection page downloads the whole collection as a timestamped JSON file, client-side, no new endpoint
  - [x] Bulk actions in the Collection page — multi-select checkboxes (list and grid view) plus a "select all visible" checkbox; bulk-add a category/mechanic tag or bulk-delete every selected game

---

## Open questions
- Hosting — local only, or eventually deploy somewhere (Fly.io, Render, a home server)? **If yes: BGG's terms require a "Powered by BGG" logo linking back to BGG on any "public facing" application using their XML API — not needed while this stays local/personal, but add it before hosting somewhere others can reach.**
- Mobile-friendly UI a priority, or desktop-first is fine?
- Multiple physical locations / shelves to track, or just one library?

---

## Decisions log

- **2026-09-16** — **Bulk actions in the Collection page (multi-select, bulk-delete, bulk-tag).** Fourth of the "do it all" batch. Added a checkbox to every row/tile (a new leftmost `<th>`/`<td>` in list view, an absolutely-positioned overlay in grid view) plus a "select all visible" checkbox in the table header — selection is a plain `Set<number>` of ids, not state on the `Game` objects themselves. A bulk-action bar appears once anything is selected: add one category or mechanic to every selected game at once (skipping games that already have it, via parallel `forkJoin` calls to the existing per-game `update()` endpoint — no new backend endpoint needed), or delete every selected game (its own confirmation dialog, separate from the single-game one). Caught a real regression while writing this: the new leftmost `<td>` shifted every column index by one, breaking two existing tests that located the Personal Rating cell by `td.nth(6)` — fixed both to `nth(7)` and left a comment naming the new column so the next index-based assertion doesn't repeat it. 70 backend + 74 e2e tests pass.

- **2026-09-16** — **Export/backup.** Third of the "do it all" batch. Added an "Export" button to the Collection page header that downloads the entire collection (ignoring any active search/filter, so a backup never silently drops games) as a timestamped JSON file (`game-tracker-export-YYYY-MM-DD.json`) via a client-side `Blob` + `URL.createObjectURL` — no new backend endpoint needed since the full game list is already loaded client-side. JSON over CSV to keep array fields (categories, mechanics, bestPlayerCounts) faithful without a flattening scheme, so the file could plausibly be used as a real restore source later. New e2e test seeds a game, clicks Export, and asserts on the downloaded file's name and contents (via Playwright's `download` event + reading the saved file). 70 backend + 71 e2e tests pass.

- **2026-09-16** — **"Refresh from BGG" button on the edit form.** Second of the "do it all" batch of proposed improvements. Games imported from BGG before a field like `bestPlayerCounts` existed (or before BGG itself corrected/expanded a listing) had no way to pick up new data short of deleting and re-adding the game. Extracted the field-merging logic `importBggGame()` already had into a shared `applyBggDetails()`, then added `refreshFromBgg()` which calls it against the game's existing `bggId` instead of a fresh search result. Reused the exact same confirmation banner, "missing personal fields" nudge, and snapshot-based Undo the add-form import already had — no new UI concepts, just a new entry point into the same machinery, shown only in edit mode and only once a game already carries a `bggId`. New e2e tests seed a Catan-linked game with stale metadata, confirm the refresh button corrects it, and confirm Undo restores the pre-refresh state (including personal notes) exactly. 70 backend + 70 e2e tests pass.

- **2026-09-16** — **Best-player-count weighting in suggestion scoring.** BGG's `/thing?stats=1` response includes a `<poll-summary name="suggested_numplayers">` with a precomputed `bestwith` result (e.g. "Best with 4 players" or "Best with 2–4 players") — cheaper to use than parsing the raw per-count vote breakdown, since BGG has already done that arithmetic. Parsed it into `BggGameDetails.bestPlayerCounts` (a new `BggThingResponse.PollSummary`/`PollSummaryResult` pair, plus a regex-based range expander — `expandPlayerCountRanges`, package-private for direct unit testing — that handles both a hyphen and an en dash since BGG isn't consistent about which it uses). Added a `game_best_player_counts` child table (V12 migration, same pattern as `game_categories`/`game_mechanics`) and a `Game.bestPlayerCounts` field; `importBggGame()` maps it in from a lookup like every other BGG field. `SuggestionService.score()` now adds a flat bonus when any of a game's best-player-counts falls inside the requested player-count range, with a reason string ("Best with 4 players") surfaced in the results list next to the existing variety/rating reasons — previously scoring reasons were computed but never rendered in the UI at all. Verified end-to-end with a real Catan lookup (`bestPlayerCounts: [3, 4]` reaches the saved game) and a new e2e test seeding two otherwise-identical games where only one is marked best for the requested count, asserting it ranks first. 70 backend + 68 e2e tests pass.

- **2026-09-16** — **Collection grid view (now the default), a BGG-linked/unlinked filter, and a post-import nudge for what BGG can't fill in.** Prompted by "I want to more easily see the pictures for each game." Added a list/grid view toggle to the collection page (`collectionViewMode`, persisted to localStorage like the theme toggle) — grid shows each game as a card with its cover image, falling back to a dice-emoji placeholder for games with none; made grid the default per follow-up request. Also added a `bggFilter` ('all' / 'linked' / 'unlinked') that composes with the existing search and sort rather than replacing them — useful now that 29 of 40 games carry real BGG data and 11 don't. Separately, since BGG can never know your personal rating/favorite/notes, the import confirmation banner now says "BGG doesn't know a personal rating" whenever the draft's rating is still empty right after an import, and says nothing once you've set one — computed once per import rather than a static message, so it's never wrong. Fixed a real regression this surfaced: several existing e2e tests asserted against `<tr>`/`<td>` table markup that only exists in list view, so switching the default broke them the moment grid became default — fixed by having those describe blocks force list view via `page.addInitScript` before navigating, since they're testing the table's own behavior, not the view switch itself. 68 backend + 67 e2e tests pass.
- **2026-09-16** — **Two more BGG fields put to use: full-size cover image and year published; the thumbnail is finally displayed too.** Audited `BggGameDetails` for fields fetched from BGG but never surfaced anywhere (the same exercise that found the description-into-Notes gap earlier): found the small thumbnail was already being saved to every game's row in the database but **never rendered anywhere in the app** — not the collection table, not any detail modal — and that BGG's larger cover image and publication year were fetched on every `/thing` lookup and discarded immediately, never even reaching the `Game` entity. Added `image_url`/`year_published` columns (V11 migration), `Game` entity fields, and wired `GameService.update()` to carry them through edits. `importBggGame()` now maps both from BGG. UI: a small thumbnail + `(year)` next to the title in both the collection table and suggestion results list; the full-size image (falling back to the thumbnail if a game predates this and only has that) plus the year in both pages' detail modal headers. Live-verified with a real Catan import + save, screenshotted in all four locations. `seedGame()`'s test helper gained `thumbnailUrl`/`imageUrl`/`yearPublished` options for deterministic (no-BGG-network) UI tests. 68 backend + 63 e2e tests pass. Hit an unrelated build hiccup mid-verification: running `mvn test` against the same `target/classes` a live devtools-managed backend was concurrently hot-recompiling into left the test-compiler output corrupted (`ClassNotFoundException: GamePlayRepository`) — a `mvn clean test` resolved it immediately; not a code regression, just a reminder not to run `mvn test` against a directory devtools has open.
- **2026-09-16** — **BGG import always overwrites Notes now, with a real Undo as the safety net.** First reported as a bug: looking up Catan, then looking up a different game (e.g. Fluxx) before saving, left Catan's description sitting in Notes — the "don't clobber personal notes" guard from the original Notes-prefill feature couldn't tell "text you typed" apart from "text the *previous* import left there," so it silently protected stale data instead of your own words. Fixed the immediate bug (notes now correctly follow whichever game was most recently looked up), then explicitly asked to go further: notes should update on lookup even if you typed something *before* ever searching, not just between two lookups. Implemented that directly — `importBggGame()` now always overwrites Notes with the new game's description, no conditions. The natural risk (a lookup could now clobber notes you actually wanted to keep) is covered by making **Undo do what it always should have**: it now snapshots the entire draft right before applying an import and restores it byte-for-byte on click — previously it only cleared the bgg id and confirmation banner, leaving every field's post-import value in place. Verified live both directions (overwrite happens even with pre-typed notes; Undo restores title/notes/players exactly). Rewrote three e2e tests that had encoded the old "protect existing notes" behavior as correct, and added a new one asserting Undo's full restore. 68 backend + 61 e2e tests pass (2 known debounce-timing-flaky tests confirmed passing in isolation).
- **2026-09-16** — **BGG import now detects when you already own a game, by bggId rather than title text.** Prompted by "how do I avoid accidentally re-adding a game I already have?" The existing title-based duplicate check (exact-normalized-match banner) and series-similarity hint (soft nudge on a shared significant word) both only compare title text, so a game re-imported from BGG under a slightly different title than what's already saved wouldn't be caught by either. BGG's numeric id is a far more reliable signal for "this is literally the same game" than any title comparison. Added: (1) a small "owned" badge on any BGG search result whose id matches a game already in the collection, visible *before* you even click it; (2) after importing, a warning banner (reusing the existing `.duplicate-warning` styling) if the imported bggId matches an existing game, naming that game and linking to it, dismissible like the title-based one. Verified live by seeding a game with Catan's real bggId (13) under a deliberately different title, then re-importing Catan via search — both the dropdown badge and the post-import warning triggered correctly. `seedGame()`'s test helper gained a `bggId` option to make this testable. 68 backend + 58 e2e tests pass.
- **2026-09-16** — **Real BGG_API_TOKEN obtained and verified end-to-end; BGG description now prefills Notes on import.** BGG approved the app registration; token lives in `backend/.env` (new, gitignored — `.gitignore` and README updated to document `source backend/.env` as the standard startup step, since Spring Boot devtools' auto-restart does *not* reload env vars). Live-verified a real import (Catan, bggId 13) fills in accurate title/players/time/complexity/categories/mechanics. While reviewing what `BggGameDetails` exposes, found the long-form `description` field was already fetched and parsed but never used anywhere — wired it into `GameForm.importBggGame()` to prefill Notes, but only when the field is still empty (same "don't clobber personal data" rule the rest of the import follows). BGG's description text is XML-escaped and sometimes contains a literal `<br/>` for line breaks; `decodeBggDescription()` converts `<br/>` to a real newline first, then uses the browser's own HTML-entity decoder (a `<textarea>.innerHTML` round-trip, read back as plain text — never re-inserted as HTML) rather than a hand-rolled entity table. This also retired an environment assumption baked into two e2e tests (`game-form.spec.ts`'s BGG-import test and `api.spec.ts`'s BGG lookup test) that assumed no token would ever be configured; both now detect the actual token status from a live search and assert the behavior that's actually correct for it — asserting real import data when a token is present rather than skipping that coverage. 68 backend + 56 e2e tests pass.
- **2026-09-14** — **e2e suite expanded again, from 48 to 54 tests, after a skeptical re-audit.** Rather than trust the prior audit's own coverage claim, re-read every spec against the app/backend from scratch. Found the suite's core CRUD/search/nav surface was solid but three areas were materially thin: (1) suggestion **scoring/ranking order** — the app's most complex business logic — was never actually verified (tests only checked set membership, never the order multiple results come back in); (2) the suggest page's **series filter** had zero coverage; (3) **no test anywhere triggered a real HTTP failure** and checked the resulting error banner, despite every page wiring one up via `describeHttpError`. Added tests for all three (ranking via two same-variety, different-rating games; series filter via `seriesName`; error banners via `page.route()` intercepting with a fulfilled 500). Also fixed two weak assertions flagged by the same audit: the nonexistent-game-edit test only checked "an alert is visible" rather than its text (now asserts the exact `GameNotFoundException` message), and two rating checks used bare substring matches against a whole `<tr>` (now scoped to the specific `<td>`). Added smaller gap-fills along the way: a second sort-order test (most-played + title Z-A), a PUT-path mirror of the create-path cross-field validation test (update() is a separate code path from create()), and rewrote the custom-tag test to actually exercise cancel-via-Escape and verify the renamed/removed tags round-trip through a real save rather than only asserting in-memory draft state. BGG-import-success remains explicitly untested (accepted risk — this dev environment has no `BGG_API_TOKEN`), called out in its own test's name rather than silently absent. 68 backend + 54 e2e tests pass.
- **2026-09-14** — **e2e suite expanded from 13 to 48 tests, and writing them surfaced a second real bug.** Following the audit above, added coverage for: favorite toggle, sort dropdown, the detail modal, undo-after-log-play, all search-filter variants (category/mechanic/notes/numeric ranges) plus the suggestions dropdown, edit-nav search-param round-trip (`collection.spec.ts`); all 5 suggest presets, favorites/unplayed toggles, max-play-count and min-rating filters, stale-chip narrowing, pagination, the empty-results state, and the result detail modal (`suggestions.spec.ts`); cross-field validation via direct API calls (since the button-group UI can't produce an invalid range to test through the screen), the series-suggestion accept flow, the duplicate-title warning, custom category tag add/rename/remove, the complexity info dialog, editing a nonexistent game, the BGG-import "no matches" degrade path, and edit-mode play-history remove/restore (`game-form.spec.ts`); definition-text search (`dictionary.spec.ts`); theme toggle persistence, nav highlighting, and the 404 page (new `app-shell.spec.ts`); and direct backend checks for endpoints with no UI path — favorite/series PATCH, a play-history 404, a cross-game play-delete 404, and invalid suggestion criteria (new `api.spec.ts`). Found a second real bug in the process: the suggestions results card was gated on `results().length > 0 || totalCount() > 0`, which is the exact negation of the condition needed to show the "Nothing in your collection fits" message — a genuinely empty search result rendered nothing at all, not even feedback that the search ran. Fixed by tracking a `hasSearched` signal instead of inferring "a search happened" from "a search returned something." Also cleaned up several stray leftover `E2e`-prefixed games in the dev DB from earlier interrupted test runs during this session (confirmed zero impact on the real 40-game collection by diffing full title lists before/after). All 68 backend + 48 e2e tests pass.
- **2026-09-14** — **e2e coverage audit found and fixed real bugs, plus built the missing BGG-import UI.** A full read-through of every frontend component/template against the existing 13 e2e tests (prompted by "make sure the tests have good coverage") surfaced: (1) `Game.java` had no cross-field validation — `POST`/`PUT /api/games` accepted `minPlayers > maxPlayers` or `minPlayTimeMinutes > maxPlayTimeMinutes` even though the frontend form already blocked it client-side; fixed with two `@AssertTrue` methods (`isPlayerRangeValid`, `isPlayTimeRangeValid`), `@Transient`/`@JsonIgnore`'d so they don't affect persistence or the JSON shape — confirmed live (`POST` with `minPlayers:6, maxPlayers:2` → 400 with a clear message). (2) `app.routes.ts` had no wildcard route — an unknown URL rendered a blank `<main>`; added a `**` route + `NotFoundPage` component. (3) `GameForm.save()`'s series-name-patch follow-up request could fail *after* the main create/update succeeded, and a retry would then POST a duplicate game; fixed by adopting the server-assigned id as soon as the main request succeeds, so a retry becomes a PUT. (4) `BggApi`/`BggController`/`BggClient` were fully implemented but **nothing in the frontend ever called them** — the add-game form had zero BGG UI despite `BggController`'s own javadoc claiming otherwise. Built the missing UI: a "Import from BoardGameGeek" search box on the add-game form (not shown when editing) that searches, lets you pick a result, fetches full details, and fills in title/players/time/complexity/categories/mechanics/thumbnail — snapping BGG's free-form numbers onto the app's discrete button-group options (`snapPlayerCount`/`snapPlayTime`/`snapComplexity`). Degrades gracefully to "No matches on BoardGameGeek" when unauthenticated (confirmed live, no token configured). 68 backend tests + 13 e2e tests still pass; full Angular build + `tsc --noEmit` both clean.
- **2026-09-14** — **`BggClient` hardened for real BGG API access ahead of app registration approval**: (1) request timeouts (5s connect / 10s read via `ClientHttpRequestFactoryBuilder`) — previously unset, risking an indefinite hang instead of falling into the existing graceful-degradation path; (2) a descriptive `User-Agent` header identifying the app, matching the "Powered by BGG" spirit of their terms and general API etiquette; (3) actual retry-on-202 handling for `/thing` lookups — the class javadoc already *mentioned* BGG's "queued" 202 response for cold lookups, but nothing retried it; now retries up to 3 times with a 2s delay before giving up. None of this required a real token to verify — 68 backend tests + 13 e2e tests pass, and live-confirmed the unauthenticated 401 path still degrades gracefully through the new code paths (`/api/bgg/search` → `200 []`, `/api/bgg/13` → `404`).
- **2026-09-14** — **BGG bearer token auth wired up** in `BggClient`. BGG made XML API2 registration-required in Oct 2025 — unauthenticated requests now get a flat 401 (confirmed live: `curl https://boardgamegeek.com/xmlapi2/search?query=catan` → 401 "See `boardgamegeek.com/using_the_xml_api`"). This is new information beyond the 2026-05-08 entry below, which only covers the frontend autocomplete UI. `BggClient` now sends `Authorization: Bearer <token>` on every request when `bgg.api-token` (sourced from the `BGG_API_TOKEN` env var, never committed) is set; unset, it logs a warning once at startup and behaves exactly as before (401 → caught → empty result, no crash). Registering for a token is an account-bound manual step on BGG's own site that can't be automated on the user's behalf — see `using_the_xml_api` (linked from the 401 response) once logged into a BGG account. Not yet verified against a real token; verified that the app still starts and degrades gracefully unconfigured (68 backend tests + 13 e2e tests still pass).
- **2026-09-14** — **Swagger/OpenAPI added** (`springdoc-openapi-starter-webmvc-ui`). UI at `/swagger-ui/index.html`, raw spec at `/v3/api-docs`. No profile/auth gating — the app already has neither (single-user, no login), so there's nothing extra to protect. Pinned to **2.8.6**, not the initially-tried 2.6.0: 2.6.0 is compiled against an older Spring Framework and throws `NoSuchMethodError: ControllerAdviceBean.<init>` against Spring 6.2.18 (Boot 3.5.14) — caught by actually hitting `/v3/api-docs` after wiring it up, not just by a successful compile. `@Operation`/`@Tag` annotations added across all four controllers; the suggestion endpoint's docs call out the `minComplexity`/`maxComplexity` 1.0–5.0 bound (see the validation fix above) since that constraint is otherwise invisible without reading `SuggestionCriteria.java`.
- **2026-09-11** — **Playwright e2e suite added** (`frontend/e2e/`), reversing the earlier "frontend tests skipped" call. Trigger: manually verifying the `SuggestionCriteria` validation fix (same date) via a real browser turned into confirming the whole `/suggest` flow worked, which made the case for locking that verification in as a repeatable test rather than a one-off. Covers collection (list/search/log-play/delete-with-confirmation), add/edit form (happy path + validation error), suggestions (rendering, presets, results, validation error), and dictionary search — 13 tests, all against the real dev backend/Postgres (no test-profile infrastructure exists yet for a project this size), seeding/cleaning up their own games via the API. Found and fixed a real cross-file test race on the first run (see Testing strategy section) by forcing `workers: 1`. See the Testing strategy section below for what it does and doesn't cover, and why.
- **2026-09-11** — **Docs sync**: corrected README's stated Spring Boot version (3.4 → **3.5.14**, per `pom.xml`) and added the previously-undocumented `PATCH /api/games/{id}/favorite` endpoint (toggles `Game.favorite`) to the API surface tables in both README and here. No code changes — the endpoint already existed, it was just missing from docs.
- **2026-05-22** — **Suggestion result cards now show game context for unfamiliar players**. Removed the reasons list from result cards. Added: (1) notes as an italic blurb beneath the meta line when the game has notes; (2) category/mechanic chips (up to 4, combined; a `+N more` pill handles overflow). Gives someone who hasn't played a game enough context to understand what it is without opening the detail modal.
- **2026-05-13** — **Duplicate game warning on add form**. When typing a title on the Add Game form, the existing 400ms debounced check now also runs a duplicate pass before the series-similarity check. `titlesDuplicate()` normalises both titles (lowercase, strip punctuation, collapse whitespace) and flags an exact match. If a duplicate is found, a red warning banner appears below the title field with the matching game's name and a "View it" link that opens the existing game's edit page in a new tab. Dismissing the banner or changing the title clears it. The duplicate check takes priority — if a duplicate is detected the series hint is suppressed for that title.
- **2026-05-13** — **Series name shown in collection page game detail popup** and suggestion page result detail modal.
- **2026-05-13** — **Series selection narrows category/mechanic chips** on the suggestion page. Added series filter to `gamesMatchingHardCriteria` so selecting a series chip updates available categories and mechanics to only those present in games belonging to that series — consistent with how other hard criteria affect chip availability.
- **2026-05-13** — **Series filter on suggestion page**. Added `series: List<String>` to `SuggestionCriteria` (backend record + frontend interface + `SuggestionApi.clean()`). `SuggestionService.passesHardFilters` now drops games whose `seriesName` isn't in the requested list when the list is non-empty. On the suggestion page, a "Series" chip grid appears automatically when at least one game in the collection has a series name — chips follow the same available/stale pattern as categories and mechanics (derived from `gamesMatchingHardCriteria`, stale if no games survive the current hard criteria). `criteriaWithoutStale()` and `reset()` updated to include the new field. Series name also shown in the result detail modal.
- **2026-05-13** — **Series name field + similarity suggestion**. Added `seriesName` (nullable `VARCHAR(255)`) via V6 Flyway migration. `Game` entity, `GameService.update()`, and a new `PATCH /api/games/{id}/series` endpoint all carry the field. On the Add Game form, the title input is debounced (400 ms); when the typed title shares a significant word (≥4 chars, not in a stoplist) with any existing game's title, a dismissible banner appears below the title field offering to add both to a named series — pre-filled with the matched game's existing series name or its title. Clicking Yes fills the series name field on the draft and queues a `PATCH /series` call for the existing game, which fires as part of the main save pipeline. Clicking Dismiss or changing the title hides the banner. A plain "Series name" text field is always visible below the title for manual entry. Detection runs client-side against the already-loaded game collection — no extra API call needed.
- **2026-05-13** — **Category/mechanic custom entry replaced with autocomplete combobox**. The plain text input + "Add" button was swapped for a combobox: as you type, a dropdown suggests matching preset names and any custom tags already in use across the collection (shown with an "in use" badge). If the typed value doesn't match anything exactly, a "+ Add" option appears at the bottom. Keyboard-navigable (↑/↓ to highlight, Enter to select, Escape to dismiss). Uses `mousedown` + `preventDefault` on list items to prevent input blur from closing the dropdown before the click registers. Removed `addCustomCategory()` and `addCustomMechanic()` methods; replaced with `selectCategorySuggestion()` / `selectMechanicSuggestion()` and updated keydown handlers. No backend changes required — purely a frontend UX improvement.
- **2026-05-12** — **Frontend code cleanup** (7 items). (1) `formatTime` and `formatDate` extracted to `shared/services/format-utils.ts` — were copy-pasted identically across `GameForm`, `GameList`, and `SuggestPage`. (2) Button-group constants (`PLAYER_OPTIONS`, `PLAYERS_UNLIMITED`, `TIME_OPTIONS`, `TIME_UNLIMITED`, `COMPLEXITY_OPTIONS`, `COMPLEXITY_LABELS`, `RATING_OPTIONS`) extracted to `shared/models/game-constants.ts` — same values were inlined in both `GameForm` and `SuggestPage`; `TIME_OPTIONS` in `SuggestPage` had an extra `150` step that `GameForm` was missing, now unified. (3) Nested subscribe in `GameForm.save()` flattened to a single `pipe(switchMap(...))` chain — forkJoin for pending play removals now runs in the same pipeline as the save. (4) `SuggestPage.logPlay()` refactored — extracted private `undoLogPlay()` and `applyGameUpdate()` helpers to eliminate the subscribe-inside-toast-callback nesting and de-duplicate the results/detail-sync logic that appeared in both the log and undo paths. (5) `SuggestPage.applyPreset()` deduplicated — now calls `reset()` then patches the preset fields instead of repeating the full blank-criteria object. (6) What-not-why comments removed from `GameForm` — stripped the multi-paragraph component docstring, all section-header comments, and every inline comment that restated the code; kept the single-line range-selection note above `isPlayerInRange` (non-obvious behaviour). (7) `onEditCategoryKeydown` / `onEditMechanicKeydown` merged into `onEditTagKeydown(event, 'category' | 'mechanic')` — identical branching logic; template updated to pass the type literal.
- **2026-05-12** — **Frontend folder restructure**. `shared/` split into `models/` (game, suggestion, categories, mechanics, bgg types), `api/` (GameApi, SuggestionApi, BggApi), and `services/` (ThemeService, ToastService, ToastComponent, describeHttpError). Each subfolder has a barrel `index.ts`. TypeScript path aliases (`@shared/models`, `@shared/api`, `@shared/services`) added to `tsconfig.json` with `baseUrl: ./src` — eliminates all `../../shared/...` import paths. VS Code file nesting added to `.vscode/settings.json` to collapse `.html`/`.scss`/`.spec.ts` siblings under their `.ts` file in the explorer.
- **2026-05-12** — **Additional suggestion filters**: `unplayedOnly` (games never played), `maxPlayCount` (cap on how many times a game has been played), and `minRating` (floor on personal rating) added to `SuggestionCriteria` — backend record, Java `passesHardFilters`, frontend interface, and `SuggestionApi.clean()`. No new migrations needed — all derive from existing `playCount`, `lastPlayedAt`, and `personalRating` fields.
- **2026-05-12** — **Suggestion page UX overhaul**: preset quick-select buttons stamp sensible draft defaults in one click. Category/mechanic chips are dynamically filtered — only options present in games that pass current hard criteria (players/time/complexity/rating) are shown, mirroring the backend's `passesHardFilters` on the client so users only see chips that will produce results. Stale chips (previously selected but now out of scope) are visually distinguished rather than silently dropped.
- **2026-05-11** — **`GlobalExceptionHandler` added** (`@RestControllerAdvice`). Maps `GameNotFoundException` → 404, `MethodArgumentNotValidException` → 400 (first error message), and any other `Exception` → 500 with a generic message. Paired with `GameNotFoundException` (dedicated runtime exception thrown by `GameService.findById`). Keeps error shapes consistent across all endpoints.
- **2026-05-11** — **`ThemeService` + `ToastService`** added to frontend. `ThemeService` toggles a `.dark` class on `<html>`, persists to localStorage, defaults to `prefers-color-scheme`. `ToastService` is a signal-based queue; `show()` auto-dismisses after a configurable duration and supports an action callback (used for undo flows).
- **2026-05-11** — **`favorite` boolean field** added to `Game` (V5 Flyway migration). `SuggestionCriteria` gained `favoritesOnly` — when true, hard-filter drops non-favourited games before scoring. Lets the suggestion page double as a "from my favourites" filter.
- **2026-05-11** — **Play history replaces single `lastPlayedAt` update**. `game_plays` table (V4 migration) records each play with a `played_at` date and cascades on game delete. `GamePlayController` exposes `POST /api/games/{id}/plays` (log, returns `LogPlayResponse` with updated `Game` + `playId`), `DELETE /api/games/{id}/plays/{playId}` (undo), and `GET /api/games/{id}/plays` (history). `Game.lastPlayedAt` is still updated on each log so the variety-scoring path in `SuggestionService` doesn't change. `Game.playCount` is a read-only `@Formula` backed by a COUNT query.
- **2026-05-11** — **Suggestion endpoint now returns `SuggestionPage`** (paginated). `SuggestionCriteria` gained `page` (0-based, null → 0) and `maxPlayers` / `minMinutes` / `favoritesOnly`. The old `limit` field is gone — replaced by server-side `PAGE_SIZE = 10`. `SuggestionPage` carries `items`, `page`, `pageSize`, `totalCount`, and `hasMore()`. `SuggestionCriteria` also gained `maxPlayers` (player range now overlaps rather than exact-matches) and `minMinutes` (lower bound on play time).
- **2026-05-11** — **Frontend build isolated to `prepare-package` phase**. `frontend-maven-plugin` executions were originally bound to `generate-resources`, which runs during `mvn spring-boot:run` (the lifecycle goes up to `test-compile`). Moved all three executions (`install-node-and-npm`, `npm-install`, `npm-build`) and the `maven-resources-plugin` copy step to `prepare-package` so `spring-boot:run` (dev mode) never triggers the Angular build. Also bumped Node version to `v20.19.0` (Angular 21 requires ≥20.19).
- **2026-05-11** — **Add-game modal replaced with dedicated `/games/add` route**. The original modal approach was lightweight but made it hard to share form logic with the edit flow. `GameForm` now lives at its own route and detects add-vs-edit by checking `ActivatedRoute` for an `:id` param. "Add game" in the collection header is now a `routerLink`.
- **2026-05-11** — **Dictionary page** (`/dictionary`) added. Searchable reference for all preset categories and mechanics with descriptions. Useful when deciding whether a game fits a category or uses a mechanic. Searches both name and description fields.
- **2026-05-11** — **Categories and mechanics use toggle-chip grids** in the add/edit form (not a dropdown or tag-input). All preset options are visible at once; selected chips float to the top via a `computed()` signal (`sortedCategories`, `sortedMechanics`). Custom entries still supported via a text input below the grid. Each chip has a `[title]` tooltip with the mechanic/category description. A `?` button opens a stacked `<dialog>` with the full descriptions list for reference.
- **2026-05-08** — **Delete confirmation modal** added to collection page. Clicking Delete on a row opens a native `<dialog>` showing the game title and "This cannot be undone." Cancel dismisses; only the confirm button fires the actual DELETE call.
- **2026-05-08** — **Add-game form UX overhaul**: replaced number inputs for player count, play time, and personal rating with segmented button groups. Players: 1–10 + "10+" (sentinel 99). Play time: 15 m–4 h in steps + "4h+" (sentinel 999). Personal rating: 1–10, single-select, click again to deselect (optional). Categories: tag/chip input — type a name, press Enter or Add, chips are individually removable.
- **2026-05-08** — **BGG autocomplete removed**. BGG XML API2 returns 401 on all public endpoints; Board Game Atlas shut down (503); no viable free unauthenticated board game search API found. Removed all autocomplete UI and signals from `game-list.ts`. Manual entry only for now.
- **2026-05-07** — **Migration V2 — `position` columns on `game_categories` / `game_mechanics`**. `Game` entity declared `@OrderColumn(name="position")` for both `@ElementCollection` lists, but V1 never created the column, so `ddl-auto: validate` failed app startup. V2 adds the column, backfills via `row_number() OVER (PARTITION BY game_id ORDER BY ctid)`, sets `NOT NULL`, and makes `(game_id, position)` the PK — required by `@OrderColumn` semantics.
- **2026-05-07** — **Suggestion page shipped** (`/suggest`): criteria form (players + maxMinutes + complexity range + comma-separated categories/mechanics + limit) → ranked results from `POST /api/suggestions`. Each result shows rank, title, a score badge, a meta line, and the backend's reasons list. "Suggest" added to the top nav. Categories/mechanics intentionally use a plain comma-separated text input rather than a tag widget — fast to type, zero deps, easy to swap for a multi-select once the BGG-imported collection grows enough to need one.
- **2026-05-07** — **`SuggestionApi.clean()` strips null/empty fields client-side** before POSTing. Reason: backend `SuggestionCriteria` uses `@Min(1)` on `maxMinutes` etc., which would 400 if a literal `null` were sent. Cleaner to omit the key entirely than to weaken validation.
- **2026-05-07** — **Phase 2 backend complete**: `BggClient` (Caffeine-cached, RestClient + Jackson XML), `BggController` (`/api/bgg/search`, `/api/bgg/{bggId}`), `SuggestionService` + `POST /api/suggestions`. 22 new tests (9 BGG XML parsing against saved fixtures, 13 SuggestionService unit tests for filters/scoring/tie-breaking) — all green.
- **2026-05-07** — **Best-player-count scoring deferred**. Plan called for "+points if players is within the game's best-with range," but `Game` has no `bestPlayerCount` field yet. Will source from BGG's poll data (`<poll name="suggested_numplayers">`) when BGG import is wired up; for now scoring runs on variety + rating only. SuggestionService scoring logic structured so this slots in additively without restructuring.
- **2026-05-07** — **Jackson XML over JAXB**. Plan offered either; picked `jackson-dataformat-xml` because it ships with Spring Boot's Jackson and needs zero runtime config. JAXB would have meant a separate dependency + module-info dance on Java 17.
- **2026-05-07** — **Caffeine via `spring-boot-starter-cache`**, not a hand-rolled cache. Two named caches (`bggSearch`, `bggThing`) so eviction/sizing can be tuned independently if needed. 24h TTL on both, max 500 entries each (BGG's catalogue is huge but a personal collection touches a tiny slice).
- **2026-05-07** — **`POST /api/suggestions`** with criteria as a JSON body, not GET with query params. Reason: criteria includes lists (categories/mechanics) and the request is tied to mutable user state, so HTTP-layer caching wouldn't help anyway. POST keeps the contract clean.
- **2026-05-07** — **Variety bonus capped at 6 months / never-played = full bonus**. Reason: avoids unbounded growth (a game played 3 years ago shouldn't beat one played 6 months ago by 30 points), and "never played" deserves attention but not infinity. Numbers are easy to tweak — they're constants on `SuggestionService`.
- **2026-05-07** — **`Clock` injected as a Spring bean** (in `GameTrackerApplication`) so `SuggestionServiceTest` can pin "today" with `Clock.fixed(...)` and write deterministic variety-bonus assertions.
- **2026-05-07** — Collection page got a **client-side search bar** above the table. Matches title / categories / mechanics / notes (substring), plus numeric matches against player count, play-time minutes, and personal rating. Will move server-side if the collection grows past ~hundreds.
- **2026-05-07** — **Add-game UX**: replaced inline form with a header **"Add game"** button. Initially opened a modal; later moved to a dedicated `/games/add` route (see 2026-05-11 entry) to share form logic with the edit flow.
- **2026-05-07** — **Phase 1 vertical slice end-to-end working**: Postgres → Spring Boot → Angular `/collection`. Add a game in the modal, see it persist, delete it, search filters live. Time spent: one session.
- **2026-05-07** — **Postgres 15** instead of 16, **with** `security_opt: [seccomp:unconfined]` in docker-compose. Reason: this Mac has Docker Desktop 20.10 (2021) whose seccomp profile blocks syscalls modern Postgres needs (`popen failure: Operation not permitted` from `initdb`). Postgres 15 alone wasn't enough; only the combo worked. Testcontainers test image bumped to match. Revisit when Docker Desktop is upgraded.
- **2026-05-07** — **Flyway from day 1** with `ddl-auto=validate`, instead of starting on `ddl-auto=update` and migrating later. Reason: Flyway expects to own the schema from the first migration; the cutover is fiddly. Cheaper to write `V1__init_schema.sql` upfront. Phase 1 status moved this from Phase 4.
- **2026-09-14** — **Java 25** runtime. Upgraded to the latest Java LTS release; Spring Boot 3.5 supports Java 25.
- **2026-05-07** — **No UI library yet** — plain SCSS rather than Angular Material or Tailwind. Reason: the `/collection` UI was simple enough that adding a library would be premature. Plan to revisit when building the BGG autocomplete (Material's autocomplete is the obvious choice there).
- **2026-05-07** — Added Code documentation section. Standard: Javadoc/TSDoc on public APIs, "why" comments on non-obvious logic, skip noise comments that restate code.
- **2026-05-07** — Added Testing strategy section. Selective approach: focus on `SuggestionService` scoring and BGG XML parsing; Testcontainers for repository tests; skip frontend tests until bugs warrant them.
- **2026-05-07** — Initial plan created. Stack: Spring Boot + Maven + Java + PostgreSQL backend, Angular + TypeScript frontend. Single-user, board games only, manual entry with BGG lookup.
