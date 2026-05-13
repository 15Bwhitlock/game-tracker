import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { GameApi, GamePlay } from '@shared/api';
import { Game, emptyGame, GAME_CATEGORIES, GAME_MECHANICS, PLAYER_OPTIONS, PLAYERS_UNLIMITED, TIME_OPTIONS, TIME_UNLIMITED, COMPLEXITY_OPTIONS, COMPLEXITY_LABELS, RATING_OPTIONS } from '@shared/models';
import { describeHttpError, formatTime, formatDate } from '@shared/services';

interface TagSuggestion {
  name: string;
  isNew: boolean;
  isFromCollection: boolean;
}

function toTitleCase(s: string): string {
  return s.trim()
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Words too generic to be meaningful series indicators.
const SERIES_STOPWORDS = new Set([
  'game', 'card', 'board', 'dice', 'play', 'with', 'from', 'ages',
  'edition', 'deluxe', 'classic', 'pocket', 'travel', 'junior',
  'family', 'party', 'adult', 'blank', 'super', 'ultra', 'mini',
]);

function titlesDuplicate(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
  return normalize(a) === normalize(b);
}

function titlesSimilar(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = (s: string) =>
    normalize(s).split(/\s+/).filter(w => w.length >= 4 && !SERIES_STOPWORDS.has(w));
  const aWords = new Set(words(a));
  return words(b).some(w => aWords.has(w));
}

@Component({
  selector: 'app-game-form',
  imports: [FormsModule],
  templateUrl: './game-form.html',
  styleUrl: './game-form.scss'
})
export class GameForm implements OnInit {
  private readonly api = inject(GameApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly editId = signal<number | null>(null);
  readonly loading = signal(false);

  readonly categoryInfoDialog = viewChild<ElementRef<HTMLDialogElement>>('categoryInfoDialog');
  readonly mechanicInfoDialog = viewChild<ElementRef<HTMLDialogElement>>('mechanicInfoDialog');
  readonly complexityInfoDialog = viewChild<ElementRef<HTMLDialogElement>>('complexityInfoDialog');

  readonly draft = signal<Game>(emptyGame());
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly playHistory = signal<GamePlay[]>([]);
  readonly historyLoading = signal(false);
  readonly pendingRemovals = signal<number[]>([]);
  readonly visiblePlayHistory = computed(() =>
    this.playHistory().map(p => ({ play: p, pending: this.pendingRemovals().includes(p.id) }))
  );

  readonly customCategoryInput = signal('');
  readonly categoryInputFocused = signal(false);
  readonly categoryHighlightIdx = signal(-1);

  readonly playerOptions = PLAYER_OPTIONS;
  readonly PLAYERS_UNLIMITED = PLAYERS_UNLIMITED;
  readonly timeOptions = TIME_OPTIONS;
  readonly TIME_UNLIMITED = TIME_UNLIMITED;
  readonly ratingOptions = RATING_OPTIONS;
  readonly complexityOptions = COMPLEXITY_OPTIONS;
  readonly complexityLabels = COMPLEXITY_LABELS;

  readonly presetCategories = GAME_CATEGORIES;
  readonly presetCategoryNames = GAME_CATEGORIES.map(c => c.name);
  readonly presetMechanics = GAME_MECHANICS;
  readonly presetMechanicNames = GAME_MECHANICS.map(m => m.name);

  readonly customMechanicInput = signal('');
  readonly mechanicInputFocused = signal(false);
  readonly mechanicHighlightIdx = signal(-1);

  readonly usedCustomCategories = signal<string[]>([]);
  readonly usedCustomMechanics = signal<string[]>([]);

  readonly editingCategoryTag = signal<string | null>(null);
  readonly editingCategoryValue = signal('');
  readonly editingMechanicTag = signal<string | null>(null);
  readonly editingMechanicValue = signal('');

  // Series suggestion + duplicate warning state — only active when adding a new game.
  private readonly allGames = signal<import('@shared/models').Game[]>([]);
  private titleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly duplicateGame = signal<import('@shared/models').Game | null>(null);
  readonly duplicateDismissed = signal(false);
  readonly showDuplicateWarning = computed(() =>
    !this.editId() && this.duplicateGame() !== null && !this.duplicateDismissed()
  );
  readonly seriesMatchGame = signal<import('@shared/models').Game | null>(null);
  readonly seriesSuggestionName = signal('');
  readonly seriesDismissed = signal(false);
  // Tracks an existing game that should also get the series name on save.
  readonly seriesUpdateTarget = signal<{ gameId: number; seriesName: string } | null>(null);
  readonly showSeriesSuggestion = computed(() =>
    !this.editId() && this.seriesMatchGame() !== null && !this.seriesDismissed()
  );

  readonly sortedCategories = computed(() => {
    const selected = this.draft().categories;
    const extras = this.usedCustomCategories().map(name => ({ name, description: '' }));
    const all = [...GAME_CATEGORIES, ...extras];
    return [
      ...all.filter(c => selected.includes(c.name)),
      ...all.filter(c => !selected.includes(c.name)),
    ];
  });

  readonly sortedMechanics = computed(() => {
    const selected = this.draft().mechanics;
    const extras = this.usedCustomMechanics().map(name => ({ name, description: '' }));
    const all = [...GAME_MECHANICS, ...extras];
    return [
      ...all.filter(m => selected.includes(m.name)),
      ...all.filter(m => !selected.includes(m.name)),
    ];
  });

  readonly categorySuggestions = computed<TagSuggestion[]>(() => {
    const q = this.customCategoryInput().trim().toLowerCase();
    if (!q) return [];
    const selected = this.draft().categories;
    const fromCollection = this.usedCustomCategories()
      .filter(n => !selected.includes(n) && n.toLowerCase().includes(q))
      .map(n => ({ name: n, isNew: false, isFromCollection: true }));
    const fromPresets = this.presetCategories
      .filter(c => !selected.includes(c.name) && c.name.toLowerCase().includes(q))
      .map(c => ({ name: c.name, isNew: false, isFromCollection: false }));
    const list: TagSuggestion[] = [...fromCollection, ...fromPresets];
    const typed = this.customCategoryInput().trim();
    const exactMatch = list.some(s => s.name.toLowerCase() === typed.toLowerCase());
    if (typed && !exactMatch && !selected.includes(typed)) {
      list.push({ name: typed, isNew: true, isFromCollection: false });
    }
    return list;
  });

  readonly categorySuggestionsOpen = computed(() =>
    this.categoryInputFocused() && this.categorySuggestions().length > 0
  );

  readonly mechanicSuggestions = computed<TagSuggestion[]>(() => {
    const q = this.customMechanicInput().trim().toLowerCase();
    if (!q) return [];
    const selected = this.draft().mechanics;
    const fromCollection = this.usedCustomMechanics()
      .filter(n => !selected.includes(n) && n.toLowerCase().includes(q))
      .map(n => ({ name: n, isNew: false, isFromCollection: true }));
    const fromPresets = this.presetMechanics
      .filter(m => !selected.includes(m.name) && m.name.toLowerCase().includes(q))
      .map(m => ({ name: m.name, isNew: false, isFromCollection: false }));
    const list: TagSuggestion[] = [...fromCollection, ...fromPresets];
    const typed = this.customMechanicInput().trim();
    const exactMatch = list.some(s => s.name.toLowerCase() === typed.toLowerCase());
    if (typed && !exactMatch && !selected.includes(typed)) {
      list.push({ name: typed, isNew: true, isFromCollection: false });
    }
    return list;
  });

  readonly mechanicSuggestionsOpen = computed(() =>
    this.mechanicInputFocused() && this.mechanicSuggestions().length > 0
  );

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (games) => {
        this.allGames.set(games);
        const cats = games.flatMap(g => g.categories);
        const mechs = games.flatMap(g => g.mechanics);
        this.usedCustomCategories.set([...new Set(cats)].filter(c => !this.presetCategoryNames.includes(c)));
        this.usedCustomMechanics.set([...new Set(mechs)].filter(m => !this.presetMechanicNames.includes(m)));
      }
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.editId.set(id);
      this.loading.set(true);
      this.api.get(id).subscribe({
        next: (game) => {
          this.draft.set(game);
          this.loading.set(false);
        },
        error: (err) => {
          this.formError.set(describeHttpError(err));
          this.loading.set(false);
        }
      });
      this.loadHistory(id);
    }
  }

  cancel(): void {
    this.router.navigate(['/collection']);
  }

  onTitleBlur(): void {
    const title = this.draft().title;
    if (title) this.draft.update(d => ({ ...d, title: toTitleCase(title) }));
  }

  onTitleChange(title: string): void {
    this.draft.update(d => ({ ...d, title }));

    if (this.editId()) return;

    // Reset both hints on every keystroke so stale matches don't linger.
    this.duplicateGame.set(null);
    this.duplicateDismissed.set(false);
    this.seriesMatchGame.set(null);
    this.seriesDismissed.set(false);

    if (this.titleDebounceTimer) clearTimeout(this.titleDebounceTimer);

    const trimmed = title.trim();
    if (trimmed.length < 2) return;

    this.titleDebounceTimer = setTimeout(() => {
      const games = this.allGames();

      const duplicate = games.find(g => g.id != null && titlesDuplicate(trimmed, g.title));
      if (duplicate) {
        this.duplicateGame.set(duplicate);
        return; // duplicate takes priority — skip series hint
      }

      const match = games.find(g => g.id != null && titlesSimilar(trimmed, g.title));
      if (match) {
        this.seriesMatchGame.set(match);
        this.seriesSuggestionName.set(match.seriesName || match.title);
      }
    }, 400);
  }

  dismissDuplicateWarning(): void {
    this.duplicateDismissed.set(true);
  }

  acceptSeriesSuggestion(): void {
    const name = this.seriesSuggestionName().trim();
    const match = this.seriesMatchGame();
    if (!match || !match.id || !name) return;
    this.draft.update(d => ({ ...d, seriesName: name }));
    this.seriesUpdateTarget.set({ gameId: match.id, seriesName: name });
    this.seriesDismissed.set(true);
  }

  dismissSeriesSuggestion(): void {
    this.seriesDismissed.set(true);
  }

  save(): void {
    this.draft.update(d => ({ ...d, title: toTitleCase(d.title) }));
    const game = this.draft();

    if (!game.title.trim()) {
      this.formError.set('Title is required.');
      return;
    }
    if (game.minPlayers == null || game.maxPlayers == null) {
      this.formError.set('Player count is required.');
      return;
    }
    if (game.minPlayTimeMinutes == null || game.maxPlayTimeMinutes == null) {
      this.formError.set('Play time is required.');
      return;
    }
    if (game.minPlayers > game.maxPlayers) {
      this.formError.set('Min players must be ≤ max players.');
      return;
    }
    if (game.minPlayTimeMinutes > game.maxPlayTimeMinutes) {
      this.formError.set('Min play time must be ≤ max play time.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const id = this.editId();
    const seriesTarget = this.seriesUpdateTarget();
    const removals = this.pendingRemovals();

    const followUps: Observable<unknown>[] = [
      ...(id && removals.length > 0 ? removals.map(playId => this.api.undoPlay(id, playId)) : []),
      ...(seriesTarget ? [this.api.updateSeriesName(seriesTarget.gameId, seriesTarget.seriesName)] : []),
    ];

    const mainRequest: Observable<unknown> = id ? this.api.update(id, game) : this.api.create(game);
    const pipeline: Observable<unknown> = followUps.length > 0
      ? mainRequest.pipe(switchMap(() => forkJoin(followUps)))
      : mainRequest;

    pipeline.subscribe({
      next: () => this.router.navigate(['/collection']),
      error: (err: unknown) => {
        this.formError.set(describeHttpError(err));
        this.saving.set(false);
      },
      complete: () => this.router.navigate(['/collection']),
    });
  }

  // First click sets min=max; subsequent clicks expand the range. Clicking inside collapses it.
  isPlayerInRange(n: number): boolean {
    const min = this.draft().minPlayers;
    const max = this.draft().maxPlayers;
    return min !== null && max !== null && n >= min && n <= max;
  }

  isPlayerSelected(n: number): boolean {
    const min = this.draft().minPlayers;
    const max = this.draft().maxPlayers;
    return n === min || n === max;
  }

  onPlayerClick(n: number): void {
    const { minPlayers: min, maxPlayers: max } = this.draft();
    if (min === null || max === null) {
      this.draft.update(d => ({ ...d, minPlayers: n, maxPlayers: n }));
    } else if (n < min) {
      this.draft.update(d => ({ ...d, minPlayers: n }));
    } else if (n > max) {
      this.draft.update(d => ({ ...d, maxPlayers: n }));
    } else {
      this.draft.update(d => ({ ...d, minPlayers: n, maxPlayers: n }));
    }
  }

  readonly formatTime = formatTime;

  isTimeInRange(t: number): boolean {
    const min = this.draft().minPlayTimeMinutes;
    const max = this.draft().maxPlayTimeMinutes;
    return min !== null && max !== null && t >= min && t <= max;
  }

  isTimeSelected(t: number): boolean {
    const min = this.draft().minPlayTimeMinutes;
    const max = this.draft().maxPlayTimeMinutes;
    return t === min || t === max;
  }

  onTimeClick(t: number): void {
    const { minPlayTimeMinutes: min, maxPlayTimeMinutes: max } = this.draft();
    if (min === null || max === null) {
      this.draft.update(d => ({ ...d, minPlayTimeMinutes: t, maxPlayTimeMinutes: t }));
    } else if (t < min) {
      this.draft.update(d => ({ ...d, minPlayTimeMinutes: t }));
    } else if (t > max) {
      this.draft.update(d => ({ ...d, maxPlayTimeMinutes: t }));
    } else {
      this.draft.update(d => ({ ...d, minPlayTimeMinutes: t, maxPlayTimeMinutes: t }));
    }
  }

  onRatingClick(r: number): void {
    const current = this.draft().personalRating;
    this.draft.update(d => ({ ...d, personalRating: current === r ? null : r }));
  }

  onComplexityClick(n: number): void {
    const current = this.draft().complexityWeight;
    this.draft.update(d => ({ ...d, complexityWeight: current === n ? null : n }));
  }

  toggleCategory(cat: string): void {
    const current = this.draft().categories;
    if (current.includes(cat)) {
      this.draft.update(d => ({ ...d, categories: d.categories.filter(c => c !== cat) }));
    } else {
      this.draft.update(d => ({ ...d, categories: [...d.categories, cat] }));
    }
  }

  toggleMechanic(m: string): void {
    const current = this.draft().mechanics;
    if (current.includes(m)) {
      this.draft.update(d => ({ ...d, mechanics: d.mechanics.filter(x => x !== m) }));
    } else {
      this.draft.update(d => ({ ...d, mechanics: [...d.mechanics, m] }));
    }
  }

  startEditCategory(cat: string): void {
    this.editingCategoryTag.set(cat);
    this.editingCategoryValue.set(cat);
  }

  confirmEditCategory(): void {
    const oldName = this.editingCategoryTag();
    const newName = this.editingCategoryValue().trim();
    if (oldName && newName && newName !== oldName) {
      this.draft.update(d => ({ ...d, categories: d.categories.map(c => c === oldName ? newName : c) }));
    }
    this.editingCategoryTag.set(null);
  }

  cancelEditCategory(): void {
    this.editingCategoryTag.set(null);
  }

  startEditMechanic(m: string): void {
    this.editingMechanicTag.set(m);
    this.editingMechanicValue.set(m);
  }

  confirmEditMechanic(): void {
    const oldName = this.editingMechanicTag();
    const newName = this.editingMechanicValue().trim();
    if (oldName && newName && newName !== oldName) {
      this.draft.update(d => ({ ...d, mechanics: d.mechanics.map(m => m === oldName ? newName : m) }));
    }
    this.editingMechanicTag.set(null);
  }

  cancelEditMechanic(): void {
    this.editingMechanicTag.set(null);
  }

  onEditTagKeydown(event: KeyboardEvent, type: 'category' | 'mechanic'): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      type === 'category' ? this.confirmEditCategory() : this.confirmEditMechanic();
    }
    if (event.key === 'Escape') {
      type === 'category' ? this.cancelEditCategory() : this.cancelEditMechanic();
    }
  }

  selectCategorySuggestion(s: TagSuggestion): void {
    this.toggleCategory(s.name);
    this.customCategoryInput.set('');
    this.categoryHighlightIdx.set(-1);
  }

  onCustomCategoryKeydown(event: KeyboardEvent): void {
    const suggestions = this.categorySuggestions();
    const idx = this.categoryHighlightIdx();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.categoryHighlightIdx.set(Math.min(idx + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.categoryHighlightIdx.set(Math.max(idx - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!suggestions.length) return;
      this.selectCategorySuggestion(idx >= 0 ? suggestions[idx] : suggestions[0]);
    } else if (event.key === 'Escape') {
      this.customCategoryInput.set('');
      this.categoryHighlightIdx.set(-1);
      this.categoryInputFocused.set(false);
    }
  }

  selectMechanicSuggestion(s: TagSuggestion): void {
    this.toggleMechanic(s.name);
    this.customMechanicInput.set('');
    this.mechanicHighlightIdx.set(-1);
  }

  onCustomMechanicKeydown(event: KeyboardEvent): void {
    const suggestions = this.mechanicSuggestions();
    const idx = this.mechanicHighlightIdx();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.mechanicHighlightIdx.set(Math.min(idx + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.mechanicHighlightIdx.set(Math.max(idx - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!suggestions.length) return;
      this.selectMechanicSuggestion(idx >= 0 ? suggestions[idx] : suggestions[0]);
    } else if (event.key === 'Escape') {
      this.customMechanicInput.set('');
      this.mechanicHighlightIdx.set(-1);
      this.mechanicInputFocused.set(false);
    }
  }

  openComplexityInfo(): void {
    this.complexityInfoDialog()?.nativeElement.showModal();
  }

  closeComplexityInfo(): void {
    this.complexityInfoDialog()?.nativeElement.close();
  }

  openCategoryInfo(): void {
    this.categoryInfoDialog()?.nativeElement.showModal();
  }

  closeCategoryInfo(): void {
    this.categoryInfoDialog()?.nativeElement.close();
  }

  openMechanicInfo(): void {
    this.mechanicInfoDialog()?.nativeElement.showModal();
  }

  closeMechanicInfo(): void {
    this.mechanicInfoDialog()?.nativeElement.close();
  }

  private loadHistory(gameId: number): void {
    this.historyLoading.set(true);
    this.api.getPlays(gameId).subscribe({
      next: (plays) => { this.playHistory.set(plays); this.historyLoading.set(false); },
      error: (err) => { this.historyLoading.set(false); this.formError.set(describeHttpError(err)); }
    });
  }

  removePlay(play: GamePlay): void {
    this.pendingRemovals.update(ids => [...ids, play.id]);
  }

  restorePlay(play: GamePlay): void {
    this.pendingRemovals.update(ids => ids.filter(id => id !== play.id));
  }

  readonly formatDate = formatDate;
}
