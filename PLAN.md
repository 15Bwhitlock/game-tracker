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
- Java 17, Maven, Spring Boot 3.4.x. (Java 17 chosen to match the local install — Spring Boot 3.x works fine on 17. Bump to 21 later if a dependency needs it.)
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
- Angular components and services — skip until you're actually fixing recurring bugs in one. Personal app, you'll notice breakage immediately by using it.
- Getters/setters, DTO mappers — no logic, no test needed.

### Tooling
- **JUnit 5** + **AssertJ** for assertions (`assertThat(...)` reads better than JUnit's built-ins).
- **Mockito** for mocking the `BggClient` in `SuggestionService` tests.
- **Testcontainers** (`org.testcontainers:postgresql`) for integration tests — spins up a real Postgres in Docker per test class. Add a `@Testcontainers` base class to share the container across tests.
- **`@DataJpaTest`** + Testcontainers for repository tests; **`@SpringBootTest`** for one or two end-to-end happy-path tests against the full stack.
- Run tests in CI later if you set one up; for now, `mvn test` locally before committing is enough.

### Rough target
- ~80–90% coverage on `SuggestionService` and BGG parsing.
- One end-to-end "add a game, query suggestions, get it back" integration test.
- Everything else: untested unless a bug shows up there.

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
  - [x] `SuggestionService` with scoring (variety + rating; best-player-count deferred until BGG `bestPlayerCount` field lands)
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
  - [x] Suggestion page (`/suggest`) — criteria form + paginated ranked results with score badge and reasons
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
  - [x] Production build — `frontend-maven-plugin` builds Angular and copies dist into Spring Boot `static/`; `WebConfig` forwards unknown routes to `index.html` for Angular router

---

## Open questions
- Hosting — local only, or eventually deploy somewhere (Fly.io, Render, a home server)?
- Mobile-friendly UI a priority, or desktop-first is fine?
- Multiple physical locations / shelves to track, or just one library?

---

## Decisions log

Record changes here when scope, stack, or design shifts. Newest first.

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
- **2026-05-07** — **Java 17** instead of Java 21. Reason: matches the local install; Spring Boot 3.x supports 17+. No reason to force a JDK upgrade for a personal project.
- **2026-05-07** — **No UI library yet** — plain SCSS rather than Angular Material or Tailwind. Reason: the `/collection` UI was simple enough that adding a library would be premature. Plan to revisit when building the BGG autocomplete (Material's autocomplete is the obvious choice there).
- **2026-05-07** — Added Code documentation section. Standard: Javadoc/TSDoc on public APIs, "why" comments on non-obvious logic, skip noise comments that restate code.
- **2026-05-07** — Added Testing strategy section. Selective approach: focus on `SuggestionService` scoring and BGG XML parsing; Testcontainers for repository tests; skip frontend tests until bugs warrant them.
- **2026-05-07** — Initial plan created. Stack: Spring Boot + Maven + Java + PostgreSQL backend, Angular + TypeScript frontend. Single-user, board games only, manual entry with BGG lookup.
