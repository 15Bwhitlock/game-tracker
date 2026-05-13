import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SuggestionApi, GameApi, GamePlay } from '@shared/api';
import { ToastService, describeHttpError, formatTime, formatDate } from '@shared/services';
import { Game, ScoredGame, SuggestionCriteria, SuggestionPage, GAME_CATEGORIES, GAME_MECHANICS, PLAYER_OPTIONS, PLAYERS_UNLIMITED, TIME_OPTIONS, TIME_UNLIMITED, COMPLEXITY_OPTIONS, COMPLEXITY_LABELS, RATING_OPTIONS } from '@shared/models';

@Component({
  selector: 'app-suggest-page',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './suggest-page.html',
  styleUrl: './suggest-page.scss'
})
export class SuggestPage implements OnInit {
  private readonly api = inject(SuggestionApi);
  private readonly gameApi = inject(GameApi);
  private readonly toast = inject(ToastService);

  readonly draft = signal<SuggestionCriteria>({
    minPlayers: null,
    maxPlayers: null,
    minMinutes: null,
    maxMinutes: null,
    minComplexity: null,
    maxComplexity: null,
    categories: null,
    mechanics: null,
    series: null,
    favoritesOnly: false,
    unplayedOnly: false,
    maxPlayCount: null,
    minRating: null,
    page: 0
  });

  readonly detailDialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  readonly selectedGame = signal<Game | null>(null);
  readonly playHistory = signal<GamePlay[]>([]);
  readonly historyLoading = signal(false);
  readonly loggedIds = signal<Set<number>>(new Set());

  readonly results = signal<ScoredGame[]>([]);
  readonly totalCount = signal(0);
  readonly currentPage = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = computed(() => this.results().length < this.totalCount());
  readonly hasResults = computed(() => this.results().length > 0);

  readonly playerOptions = PLAYER_OPTIONS;
  readonly PLAYERS_UNLIMITED = PLAYERS_UNLIMITED;
  readonly timeOptions = TIME_OPTIONS;
  readonly TIME_UNLIMITED = TIME_UNLIMITED;
  readonly complexityOptions = COMPLEXITY_OPTIONS;
  readonly complexityLabels = COMPLEXITY_LABELS;
  private readonly complexityLower: Record<number, number> = { 1: 1.0, 2: 1.7, 3: 2.5, 4: 3.3, 5: 4.0 };
  private readonly complexityUpper: Record<number, number> = { 1: 1.7, 2: 2.5, 3: 3.3, 4: 4.0, 5: 5.0 };

  readonly ratingOptions = RATING_OPTIONS;
  readonly playCountOptions = [1, 2, 3, 5, 10, 25, 50];

  readonly presets: Array<{ label: string; draft: Partial<SuggestionCriteria> }> = [
    { label: 'Quick game',  draft: { minPlayers: 4, maxPlayers: 4, maxMinutes: 30 } },
    { label: 'Game night',  draft: { minPlayers: 4, maxPlayers: 4, maxMinutes: 120, minComplexity: 2, maxComplexity: 3 } },
    { label: 'Party',       draft: { minPlayers: 6, maxPlayers: 6 } },
    { label: 'New to me',   draft: { minPlayers: 2, maxPlayers: 2, unplayedOnly: true } },
    { label: 'Top picks',   draft: { minPlayers: 4, maxPlayers: 4, minRating: 7 } },
  ];


  private readonly presetCategoryNames = new Set(GAME_CATEGORIES.map(c => c.name));
  private readonly presetMechanicNames = new Set(GAME_MECHANICS.map(m => m.name));

  private readonly allGames = signal<Game[]>([]);
  private readonly gamesLoaded = signal(false);

  // All categories/mechanics that exist anywhere in the collection (preset + custom).
  // Used as the lookup source for stale chips.
  private readonly allDbCategories = computed(() => {
    const used = new Set<string>();
    for (const g of this.allGames()) for (const c of g.categories ?? []) used.add(c);
    const customs = [...used]
      .filter(n => !this.presetCategoryNames.has(n))
      .map(n => ({ name: n, description: 'Custom category' }));
    return [...GAME_CATEGORIES.filter(c => used.has(c.name)), ...customs];
  });

  private readonly allDbMechanics = computed(() => {
    const used = new Set<string>();
    for (const g of this.allGames()) for (const m of g.mechanics ?? []) used.add(m);
    const customs = [...used]
      .filter(n => !this.presetMechanicNames.has(n))
      .map(n => ({ name: n, description: 'Custom mechanic' }));
    return [...GAME_MECHANICS.filter(m => used.has(m.name)), ...customs];
  });

  // Games that pass the hard criteria (players / time / complexity / series) — mirrors backend
  // passesHardFilters, excluding category/mechanic checks so chip availability doesn't depend
  // on selected chips. Series IS included so selecting a series narrows category/mechanic chips.
  private readonly gamesMatchingHardCriteria = computed(() => {
    const d = this.draft();
    const selectedSeries = d.series?.length ? new Set(d.series.map(s => s.toLowerCase())) : null;
    return this.allGames().filter(g => {
      if (d.minPlayers != null && d.maxPlayers != null) {
        if (d.maxPlayers < (g.minPlayers ?? 0) || d.minPlayers > (g.maxPlayers ?? 99)) return false;
      }
      if (d.minMinutes != null && (g.minPlayTimeMinutes ?? 0) < d.minMinutes) return false;
      if (d.maxMinutes != null && (g.maxPlayTimeMinutes ?? 0) > d.maxMinutes) return false;
      if (d.minComplexity != null && (g.complexityWeight == null || g.complexityWeight < this.complexityLower[d.minComplexity])) return false;
      if (d.maxComplexity != null && (g.complexityWeight == null || g.complexityWeight > this.complexityUpper[d.maxComplexity])) return false;
      if (d.minRating != null && (g.personalRating == null || g.personalRating < d.minRating)) return false;
      if (d.favoritesOnly && !g.favorite) return false;
      if (d.unplayedOnly && ((g.playCount ?? 0) > 0 || g.lastPlayedAt != null)) return false;
      if (d.maxPlayCount != null && (g.playCount ?? 0) > d.maxPlayCount) return false;
      if (selectedSeries && !selectedSeries.has((g.seriesName ?? '').toLowerCase())) return false;
      return true;
    });
  });

  // Categories/mechanics present in games that pass the current hard criteria.
  // Falls back to full preset lists until the game list has loaded.
  private readonly availableCategories = computed(() => {
    if (!this.gamesLoaded()) return GAME_CATEGORIES;
    const used = new Set<string>();
    for (const g of this.gamesMatchingHardCriteria()) for (const c of g.categories ?? []) used.add(c);
    return this.allDbCategories().filter(c => used.has(c.name));
  });

  private readonly availableMechanics = computed(() => {
    if (!this.gamesLoaded()) return GAME_MECHANICS;
    const used = new Set<string>();
    for (const g of this.gamesMatchingHardCriteria()) for (const m of g.mechanics ?? []) used.add(m);
    return this.allDbMechanics().filter(m => used.has(m.name));
  });

  // All distinct series names in the collection (only games that have one).
  readonly allSeriesNames = computed(() => {
    const names = new Set<string>();
    for (const g of this.allGames()) if (g.seriesName) names.add(g.seriesName);
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  // Series names present in games that also pass the current hard criteria.
  private readonly availableSeries = computed(() => {
    if (!this.gamesLoaded()) return this.allSeriesNames();
    const names = new Set<string>();
    for (const g of this.gamesMatchingHardCriteria()) if (g.seriesName) names.add(g.seriesName);
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly staleSeriesNames = computed(() => {
    const avail = new Set(this.availableSeries());
    return new Set((this.draft().series ?? []).filter(n => !avail.has(n)));
  });

  readonly sortedSeries = computed(() => {
    const selected = this.draft().series ?? [];
    const avail = this.availableSeries();
    const stale = this.allSeriesNames().filter(n => selected.includes(n) && !avail.includes(n));
    const all = [...avail, ...stale];
    return [...all.filter(n => selected.includes(n)), ...all.filter(n => !selected.includes(n))];
  });

  // Selected chips that are no longer in the available set (criteria narrowed them out).
  readonly staleCategoryNames = computed(() => {
    const avail = new Set(this.availableCategories().map(c => c.name));
    return new Set((this.draft().categories ?? []).filter(n => !avail.has(n)));
  });

  readonly staleMechanicNames = computed(() => {
    const avail = new Set(this.availableMechanics().map(m => m.name));
    return new Set((this.draft().mechanics ?? []).filter(n => !avail.has(n)));
  });

  readonly sortedCategories = computed(() => {
    const selected = this.draft().categories ?? [];
    const avail = this.availableCategories();
    const availNames = new Set(avail.map(c => c.name));
    const stale = this.allDbCategories().filter(c => selected.includes(c.name) && !availNames.has(c.name));
    const all = [...avail, ...stale];
    return [...all.filter(c => selected.includes(c.name)), ...all.filter(c => !selected.includes(c.name))];
  });

  readonly sortedMechanics = computed(() => {
    const selected = this.draft().mechanics ?? [];
    const avail = this.availableMechanics();
    const availNames = new Set(avail.map(m => m.name));
    const stale = this.allDbMechanics().filter(m => selected.includes(m.name) && !availNames.has(m.name));
    const all = [...avail, ...stale];
    return [...all.filter(m => selected.includes(m.name)), ...all.filter(m => !selected.includes(m.name))];
  });

  constructor() {
    effect(() => {
      this.draft();
      untracked(() => {
        if (this.results().length > 0) {
          this.results.set([]);
          this.totalCount.set(0);
          this.currentPage.set(0);
        }
      });
    });
  }

  ngOnInit(): void {
    this.gameApi.list().subscribe({
      next: games => {
        this.allGames.set(games);
        this.gamesLoaded.set(true);
      },
      error: () => { this.gamesLoaded.set(true); /* keep preset lists as fallback */ }
    });
  }

  logPlay(game: Game): void {
    if (!game.id) return;
    this.gameApi.logPlay(game.id).subscribe({
      next: ({ game: saved, playId }) => {
        this.applyGameUpdate(saved);
        this.loggedIds.update(ids => new Set([...ids, saved.id!]));
        this.toast.show('Play logged!', 'Undo', () => this.undoLogPlay(saved.id!, playId));
      },
      error: (err) => this.error.set(describeHttpError(err))
    });
  }

  private undoLogPlay(gameId: number, playId: number): void {
    this.gameApi.undoPlay(gameId, playId).subscribe({
      next: (reverted) => {
        this.applyGameUpdate(reverted);
        this.loggedIds.update(ids => { const next = new Set(ids); next.delete(reverted.id!); return next; });
      },
      error: (err) => this.error.set(describeHttpError(err))
    });
  }

  private applyGameUpdate(game: Game): void {
    this.results.update(list => list.map(sg => sg.game.id === game.id ? { ...sg, game } : sg));
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
    this.gameApi.getPlays(gameId).subscribe({
      next: (plays) => { this.playHistory.set(plays); this.historyLoading.set(false); },
      error: (err) => { this.historyLoading.set(false); this.error.set(describeHttpError(err)); }
    });
  }

  isCustomCategory(name: string): boolean {
    return !this.presetCategoryNames.has(name);
  }

  isCustomMechanic(name: string): boolean {
    return !this.presetMechanicNames.has(name);
  }

  readonly formatDate = formatDate;
  readonly formatTime = formatTime;

  isPlayerSelected(n: number): boolean {
    return n === this.draft().minPlayers;
  }

  onPlayerClick(n: number): void {
    const current = this.draft().minPlayers;
    this.draft.update(d => ({
      ...d,
      minPlayers: current === n ? null : n,
      maxPlayers: current === n ? null : n,
    }));
  }

  isTimeSelected(t: number): boolean {
    return t === this.draft().maxMinutes;
  }

  onTimeClick(t: number): void {
    const current = this.draft().maxMinutes;
    this.draft.update(d => ({
      ...d,
      minMinutes: null,
      maxMinutes: current === t ? null : t,
    }));
  }

  isComplexityInRange(n: number): boolean {
    const min = this.draft().minComplexity;
    const max = this.draft().maxComplexity;
    return min != null && max != null && n > min && n < max;
  }

  isPlayCountSelected(n: number): boolean {
    return n === this.draft().maxPlayCount;
  }

  onPlayCountClick(n: number): void {
    const current = this.draft().maxPlayCount;
    this.draft.update(d => ({ ...d, maxPlayCount: current === n ? null : n }));
  }

  isRatingSelected(n: number): boolean {
    return n === this.draft().minRating;
  }

  onRatingClick(n: number): void {
    const current = this.draft().minRating;
    this.draft.update(d => ({ ...d, minRating: current === n ? null : n }));
  }

  isComplexitySelected(n: number): boolean {
    const min = this.draft().minComplexity;
    const max = this.draft().maxComplexity;
    return n === min || n === max;
  }

  onComplexityClick(n: number): void {
    const { minComplexity: min, maxComplexity: max } = this.draft();
    if (min == null || max == null) {
      this.draft.update(d => ({ ...d, minComplexity: n, maxComplexity: n }));
    } else if (n < min) {
      this.draft.update(d => ({ ...d, minComplexity: n }));
    } else if (n > max) {
      this.draft.update(d => ({ ...d, maxComplexity: n }));
    } else {
      this.draft.update(d => ({ ...d, minComplexity: null, maxComplexity: null }));
    }
  }

  toggleCategory(cat: string): void {
    const current = this.draft().categories ?? [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    this.draft.update(d => ({ ...d, categories: updated.length ? updated : null }));
  }

  toggleMechanic(m: string): void {
    const current = this.draft().mechanics ?? [];
    const updated = current.includes(m) ? current.filter(x => x !== m) : [...current, m];
    this.draft.update(d => ({ ...d, mechanics: updated.length ? updated : null }));
  }

  toggleSeries(name: string): void {
    const current = this.draft().series ?? [];
    const updated = current.includes(name) ? current.filter(x => x !== name) : [...current, name];
    this.draft.update(d => ({ ...d, series: updated.length ? updated : null }));
  }

  showMore(): void {
    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);
    this.api.suggest({ ...this.criteriaWithoutStale(), page: nextPage }).subscribe({
      next: (page: SuggestionPage) => {
        this.results.update(existing => [...existing, ...page.items]);
        this.currentPage.set(nextPage);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.error.set(describeHttpError(err));
        this.loadingMore.set(false);
      }
    });
  }

  private criteriaWithoutStale(): SuggestionCriteria {
    const c = this.draft();
    const staleCategories = this.staleCategoryNames();
    const staleMechanics = this.staleMechanicNames();
    const staleSeries = this.staleSeriesNames();
    const categories = (c.categories ?? []).filter(n => !staleCategories.has(n));
    const mechanics = (c.mechanics ?? []).filter(n => !staleMechanics.has(n));
    const series = (c.series ?? []).filter(n => !staleSeries.has(n));
    return {
      ...c,
      categories: categories.length ? categories : null,
      mechanics: mechanics.length ? mechanics : null,
      series: series.length ? series : null,
    };
  }

  submit(): void {
    const c = this.criteriaWithoutStale();
    if (!c.minPlayers || c.minPlayers < 1) {
      this.error.set('Player count is required.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.currentPage.set(0);
    this.api.suggest({ ...c, page: 0 }).subscribe({
      next: (page: SuggestionPage) => {
        this.results.set(page.items);
        this.totalCount.set(page.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(describeHttpError(err));
        this.results.set([]);
        this.loading.set(false);
      }
    });
  }

  applyPreset(preset: Partial<SuggestionCriteria>): void {
    this.reset();
    this.draft.update(d => ({ ...d, ...preset }));
  }

  reset(): void {
    this.draft.set({
      minPlayers: null, maxPlayers: null,
      minMinutes: null, maxMinutes: null,
      minComplexity: null, maxComplexity: null,
      categories: null, mechanics: null, series: null,
      favoritesOnly: false, unplayedOnly: false,
      maxPlayCount: null, minRating: null,
      page: 0
    });
    this.results.set([]);
    this.totalCount.set(0);
    this.currentPage.set(0);
    this.error.set(null);
  }
}
