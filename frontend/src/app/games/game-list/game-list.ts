import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { GameApi, GamePlay } from '@shared/api';
import { Game, PLAYERS_UNLIMITED, TIME_UNLIMITED } from '@shared/models';
import { ToastService, describeHttpError, formatTime, formatDate, formatPlayers } from '@shared/services';

@Component({
  selector: 'app-game-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './game-list.html',
  styleUrl: './game-list.scss'
})
export class GameList implements OnInit {
  private readonly api = inject(GameApi);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  readonly detailDialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  readonly bulkDeleteDialog = viewChild<ElementRef<HTMLDialogElement>>('bulkDeleteDialog');

  readonly gameToDelete = signal<Game | null>(null);
  readonly selectedGame = signal<Game | null>(null);

  // Multi-select for bulk actions — a plain set of ids rather than tracking selection on
  // each Game object, since selection is transient UI state, not part of the game itself.
  readonly selectedIds = signal<Set<number>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredGames();
    return visible.length > 0 && visible.every(g => g.id != null && this.selectedIds().has(g.id));
  });
  readonly bulkTagInput = signal('');
  readonly bulkTagType = signal<'category' | 'mechanic'>('category');
  readonly bulkActionError = signal<string | null>(null);

  readonly games = signal<Game[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly ownedBggIds = computed(() =>
    new Set(this.games().map(g => g.bggId).filter((id): id is number => id != null))
  );

  isMissingBaseGame(game: Game): boolean {
    return game.basedOnBggId != null && !this.ownedBggIds().has(game.basedOnBggId);
  }

  readonly searchTerm = signal('');
  readonly searchFocused = signal(false);
  readonly suggestionHighlightIdx = signal(-1);
  readonly loggedIds = signal<Set<number>>(new Set());

  readonly playHistory = signal<GamePlay[]>([]);
  readonly historyLoading = signal(false);

  readonly PLAYERS_UNLIMITED = PLAYERS_UNLIMITED;
  readonly TIME_UNLIMITED = TIME_UNLIMITED;

  readonly sortOptions: { key: SortKey; label: string }[] = [
    { key: 'title-asc',      label: 'Title (A–Z)' },
    { key: 'title-desc',     label: 'Title (Z–A)' },
    { key: 'favorites',      label: 'Favorites first' },
    { key: 'plays-desc',     label: 'Most played' },
    { key: 'plays-asc',      label: 'Least played' },
    { key: 'last-played',    label: 'Recently played' },
    { key: 'rating-desc',    label: 'Highest rated' },
  ];

  readonly sortKey = signal<SortKey>('title-asc');
  readonly sortOpen = signal(false);

  // Persisted like ThemeService's dark-mode choice — a per-viewer display preference,
  // not data, so localStorage is the right home for it rather than the backend.
  private static readonly VIEW_MODE_KEY = 'collectionViewMode';
  readonly viewMode = signal<ViewMode>(
    (localStorage.getItem(GameList.VIEW_MODE_KEY) as ViewMode | null) ?? 'grid'
  );

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    localStorage.setItem(GameList.VIEW_MODE_KEY, mode);
  }

  // Independent of sort/search — combines with both. "linked"/"unlinked" refer to
  // whether a game has a bggId (was imported from BoardGameGeek at some point).
  readonly bggFilter = signal<BggFilter>('all');

  readonly bggFilterOptions: { key: BggFilter; label: string }[] = [
    { key: 'all',      label: 'All games' },
    { key: 'linked',   label: 'BGG-linked' },
    { key: 'unlinked', label: 'Not linked' },
  ];

  readonly filterOpen = signal(false);

  readonly bggFilterLabel = computed(() =>
    this.bggFilterOptions.find(o => o.key === this.bggFilter())?.label ?? 'All games'
  );

  setBggFilter(filter: BggFilter): void {
    this.bggFilter.set(filter);
    this.filterOpen.set(false);
  }

  readonly searchSuggestions = computed<{ label: string; items: string[] }[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [];
    const games = this.games();
    const titles = games.filter(g => g.title.toLowerCase().includes(term)).slice(0, 3).map(g => g.title);
    const allCats = [...new Set(games.flatMap(g => g.categories))].filter(Boolean);
    const categories = allCats.filter(c => c.toLowerCase().includes(term)).slice(0, 3);
    const allMechs = [...new Set(games.flatMap(g => g.mechanics))].filter(Boolean);
    const mechanics = allMechs.filter(m => m.toLowerCase().includes(term)).slice(0, 3);
    const groups: { label: string; items: string[] }[] = [];
    if (titles.length) groups.push({ label: 'Titles', items: titles });
    if (categories.length) groups.push({ label: 'Categories', items: categories });
    if (mechanics.length) groups.push({ label: 'Mechanics', items: mechanics });
    return groups;
  });

  readonly flatSuggestions = computed(() =>
    this.searchSuggestions().flatMap(g => g.items)
  );

  readonly searchSuggestionsOpen = computed(() =>
    this.searchFocused() && this.searchSuggestions().length > 0
  );

  readonly filteredGames = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const asNumber = Number(term);
    const numeric = Number.isFinite(asNumber);
    const bggFilter = this.bggFilter();

    const filtered = this.games().filter((g) => {
      if (bggFilter === 'linked' && g.bggId == null) return false;
      if (bggFilter === 'unlinked' && g.bggId != null) return false;

      if (!term) return true;
      if (g.title.toLowerCase().includes(term)) return true;
      if (g.categories.some((c) => c?.toLowerCase().includes(term))) return true;
      if (g.mechanics.some((m) => m?.toLowerCase().includes(term))) return true;
      if (g.notes && g.notes.toLowerCase().includes(term)) return true;
      if (numeric) {
        if (g.minPlayers != null && g.maxPlayers != null && asNumber >= g.minPlayers && asNumber <= g.maxPlayers) return true;
        if (g.minPlayTimeMinutes != null && g.maxPlayTimeMinutes != null && asNumber >= g.minPlayTimeMinutes && asNumber <= g.maxPlayTimeMinutes) return true;
        if (g.personalRating === asNumber) return true;
      }
      return false;
    });

    return [...filtered].sort(sortComparator(this.sortKey()));
  });

  ngOnInit(): void {
    this.refresh();
    const search = this.route.snapshot.queryParamMap.get('search');
    if (search) this.searchTerm.set(search);
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (games) => {
        this.games.set(games);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(describeHttpError(err));
        this.loading.set(false);
      }
    });
  }

  // Downloads the full collection (not just the current search/filter view — a backup
  // should never silently drop games because a filter happened to be active) as a JSON
  // file. Keeps every field, including arrays like categories/bestPlayerCounts, so the
  // file is a faithful enough snapshot to restore from if the database were ever lost.
  exportCollection(): void {
    const json = JSON.stringify(this.games(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `game-tracker-export-${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  readonly formatDate = formatDate;
  readonly formatTime = formatTime;
  readonly formatPlayers = formatPlayers;

  toggleFavorite(game: Game): void {
    if (!game.id) return;
    this.api.toggleFavorite(game.id).subscribe({
      next: (saved) => {
        this.games.update(list => list.map(g => g.id === saved.id ? saved : g));
        if (this.selectedGame()?.id === saved.id) this.selectedGame.set(saved);
      },
      error: (err) => this.error.set(describeHttpError(err))
    });
  }

  logPlay(game: Game): void {
    if (!game.id) return;
    this.api.logPlay(game.id).subscribe({
      next: ({ game: saved, playId }) => {
        this.applyGameUpdate(saved);
        this.loggedIds.update(ids => new Set([...ids, saved.id!]));
        this.toast.show('Play logged!', 'Undo', () => this.undoLogPlay(saved.id!, playId));
      },
      error: (err) => this.error.set(describeHttpError(err))
    });
  }

  private undoLogPlay(gameId: number, playId: number): void {
    this.api.undoPlay(gameId, playId).subscribe({
      next: (reverted) => {
        this.applyGameUpdate(reverted);
        this.loggedIds.update(ids => { const next = new Set(ids); next.delete(reverted.id!); return next; });
      },
      error: (err) => this.error.set(describeHttpError(err))
    });
  }

  private applyGameUpdate(game: Game): void {
    this.games.update(list => list.map(g => g.id === game.id ? game : g));
    if (this.selectedGame()?.id === game.id) {
      this.selectedGame.set(game);
      this.loadHistory(game.id!);
    }
  }

  openDetail(game: Game): void {
    this.selectedGame.set(game);
    this.detailDialog()?.nativeElement.showModal();
    this.loadHistory(game.id!);
  }

  closeDetail(): void {
    this.detailDialog()?.nativeElement.close();
    this.selectedGame.set(null);
    this.playHistory.set([]);
  }

  private loadHistory(gameId: number): void {
    this.historyLoading.set(true);
    this.api.getPlays(gameId).subscribe({
      next: (plays) => { this.playHistory.set(plays); this.historyLoading.set(false); },
      error: (err) => { this.historyLoading.set(false); this.error.set(describeHttpError(err)); }
    });
  }

  confirmDelete(game: Game): void {
    this.gameToDelete.set(game);
    this.deleteDialog()?.nativeElement.showModal();
  }

  cancelDelete(): void {
    this.deleteDialog()?.nativeElement.close();
    this.gameToDelete.set(null);
  }

  executeDelete(): void {
    const game = this.gameToDelete();
    if (!game?.id) return;
    this.deleteDialog()?.nativeElement.close();
    this.api.delete(game.id).subscribe({
      next: () => {
        this.games.update((list) => list.filter((g) => g.id !== game.id));
        this.selectedIds.update(ids => { const next = new Set(ids); next.delete(game.id!); return next; });
        this.gameToDelete.set(null);
      },
      error: (err) => {
        this.error.set(describeHttpError(err));
        this.gameToDelete.set(null);
      }
    });
  }

  toggleSelect(game: Game): void {
    if (game.id == null) return;
    const id = game.id;
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleSelectAllVisible(): void {
    const visible = this.filteredGames();
    const shouldSelect = !this.allVisibleSelected();
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      for (const g of visible) {
        if (g.id == null) continue;
        if (shouldSelect) next.add(g.id); else next.delete(g.id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkTagInput.set('');
    this.bulkActionError.set(null);
  }

  // Adds one tag (category or mechanic) to every selected game, skipping games that
  // already have it. A full PUT via the existing update() endpoint — no bulk-specific
  // backend endpoint needed since the selection is small and this only runs on demand.
  applyBulkTag(): void {
    const tag = this.bulkTagInput().trim();
    if (!tag) return;
    const type = this.bulkTagType();
    const ids = this.selectedIds();
    const targets = this.games().filter(g => g.id != null && ids.has(g.id));
    const updates = targets
      .filter(g => !(type === 'category' ? g.categories : g.mechanics).includes(tag))
      .map(g => this.api.update(g.id!, {
        ...g,
        categories: type === 'category' ? [...g.categories, tag] : g.categories,
        mechanics: type === 'mechanic' ? [...g.mechanics, tag] : g.mechanics,
      }));

    if (updates.length === 0) {
      this.bulkTagInput.set('');
      return;
    }

    this.bulkActionError.set(null);
    forkJoin(updates).subscribe({
      next: (saved) => {
        this.games.update(list => list.map(g => saved.find(s => s.id === g.id) ?? g));
        this.bulkTagInput.set('');
      },
      error: (err) => this.bulkActionError.set(describeHttpError(err))
    });
  }

  confirmBulkDelete(): void {
    this.bulkDeleteDialog()?.nativeElement.showModal();
  }

  cancelBulkDelete(): void {
    this.bulkDeleteDialog()?.nativeElement.close();
  }

  executeBulkDelete(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    this.bulkDeleteDialog()?.nativeElement.close();
    this.bulkActionError.set(null);
    forkJoin(ids.map(id => this.api.delete(id))).subscribe({
      next: () => {
        this.games.update(list => list.filter(g => g.id == null || !ids.includes(g.id)));
        this.selectedIds.set(new Set());
      },
      error: (err) => {
        this.bulkActionError.set(describeHttpError(err));
        // Some deletes may have already succeeded before the failure — resync with the
        // server rather than leaving stale rows or a stale selection in the UI.
        this.selectedIds.set(new Set());
        this.refresh();
      }
    });
  }

  selectSuggestion(value: string): void {
    this.searchTerm.set(value);
    this.searchFocused.set(false);
    this.suggestionHighlightIdx.set(-1);
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchFocused.set(false), 150);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const flat = this.flatSuggestions();
    const idx = this.suggestionHighlightIdx();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.suggestionHighlightIdx.set(Math.min(idx + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.suggestionHighlightIdx.set(Math.max(idx - 1, -1));
    } else if (event.key === 'Enter' && idx >= 0) {
      event.preventDefault();
      this.selectSuggestion(flat[idx]);
    } else if (event.key === 'Escape') {
      this.searchFocused.set(false);
      this.suggestionHighlightIdx.set(-1);
    }
  }

  onSearchTermChange(value: string): void {
    this.searchTerm.set(value);
    this.suggestionHighlightIdx.set(-1);
  }

  selectSort(key: SortKey): void {
    this.sortKey.set(key);
    this.sortOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (this.sortOpen() && !(e.target as HTMLElement).closest('.sort-wrapper')) {
      this.sortOpen.set(false);
    }
    if (this.filterOpen() && !(e.target as HTMLElement).closest('.filter-wrapper')) {
      this.filterOpen.set(false);
    }
  }
}

type SortKey = 'title-asc' | 'title-desc' | 'favorites' | 'plays-desc' | 'plays-asc' | 'last-played' | 'rating-desc';
type ViewMode = 'list' | 'grid';
type BggFilter = 'all' | 'linked' | 'unlinked';

function sortComparator(key: SortKey): (a: Game, b: Game) => number {
  switch (key) {
    case 'title-asc':   return (a, b) => a.title.localeCompare(b.title);
    case 'title-desc':  return (a, b) => b.title.localeCompare(a.title);
    case 'favorites':   return (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.title.localeCompare(b.title);
    case 'plays-desc':  return (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.title.localeCompare(b.title);
    case 'plays-asc':   return (a, b) => (a.playCount ?? 0) - (b.playCount ?? 0) || a.title.localeCompare(b.title);
    // ISO date strings (YYYY-MM-DD) compare correctly without parsing.
    case 'last-played': return (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || a.title.localeCompare(b.title);
    // null treated as 0 so unrated games sort to the bottom.
    case 'rating-desc': return (a, b) => (b.personalRating ?? 0) - (a.personalRating ?? 0) || a.title.localeCompare(b.title);
  }
}
