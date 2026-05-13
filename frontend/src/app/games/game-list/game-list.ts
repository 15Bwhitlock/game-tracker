import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { GameApi, GamePlay } from '@shared/api';
import { Game, PLAYERS_UNLIMITED, TIME_UNLIMITED } from '@shared/models';
import { ToastService, describeHttpError, formatTime, formatDate } from '@shared/services';

@Component({
  selector: 'app-game-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './game-list.html',
  styleUrl: './game-list.scss'
})
export class GameList implements OnInit {
  private readonly api = inject(GameApi);
  private readonly toast = inject(ToastService);

  readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  readonly detailDialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');

  readonly gameToDelete = signal<Game | null>(null);
  readonly selectedGame = signal<Game | null>(null);

  readonly games = signal<Game[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal('');
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

  readonly filteredGames = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const asNumber = Number(term);
    const numeric = Number.isFinite(asNumber);

    const filtered = this.games().filter((g) => {
      if (!term) return true;
      if (g.title.toLowerCase().includes(term)) return true;
      if (g.categories.some((c) => c.toLowerCase().includes(term))) return true;
      if (g.mechanics.some((m) => m.toLowerCase().includes(term))) return true;
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

  readonly formatDate = formatDate;
  readonly formatTime = formatTime;

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
        this.gameToDelete.set(null);
      },
      error: (err) => {
        this.error.set(describeHttpError(err));
        this.gameToDelete.set(null);
      }
    });
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
  }
}

type SortKey = 'title-asc' | 'title-desc' | 'favorites' | 'plays-desc' | 'plays-asc' | 'last-played' | 'rating-desc';

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
