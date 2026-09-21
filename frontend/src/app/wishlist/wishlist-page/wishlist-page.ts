import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { BggApi, GameApi, WishlistApi } from '@shared/api';
import { BggGameDetails, BggSearchHit, Wishlist } from '@shared/models';
import { decodeBggDescription, describeHttpError, formatTime } from '@shared/services';

type Tab = 'mine' | 'trending';

// Common shape both "My Wishlist" (Wishlist) and "Browse Trending" (BggGameDetails)
// cards render against, so one card template and one filter can serve both tabs.
interface WishlistCard {
  bggId: number | null;
  title: string;
  yearPublished: number | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTimeMinutes: number | null;
  maxPlayTimeMinutes: number | null;
  complexityWeight: number | null;
  categories: string[];
  mechanics: string[];
  notes?: string | null;
  description?: string | null; // BGG's own blurb — only set pre-add (see cardFromDetails);
                                // once on the wishlist it lives on as the (editable) notes instead
  basedOnBggId?: number | null;
  basedOnGameName?: string | null;
  wishlistId?: number; // present only for "mine" cards — needed for remove/move actions
  trendingSource?: BggGameDetails; // present only for "trending" cards — needed to add
}

// Shared by the "Browse Trending" pool and the search-by-name detail preview —
// both start from the same BggGameDetails shape, just fetched at different times.
function cardFromDetails(details: BggGameDetails): WishlistCard {
  return {
    bggId: details.bggId,
    title: details.title,
    yearPublished: details.yearPublished,
    thumbnailUrl: details.thumbnailUrl,
    imageUrl: details.imageUrl,
    minPlayers: details.minPlayers,
    maxPlayers: details.maxPlayers,
    minPlayTimeMinutes: details.minPlayTimeMinutes,
    maxPlayTimeMinutes: details.maxPlayTimeMinutes,
    complexityWeight: details.complexityWeight,
    categories: details.categories,
    mechanics: details.mechanics,
    description: details.description ? decodeBggDescription(details.description) : null,
    basedOnBggId: details.basedOnBggId,
    basedOnGameName: details.basedOnGameName,
    trendingSource: details
  };
}

@Component({
  selector: 'app-wishlist-page',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './wishlist-page.html',
  styleUrl: './wishlist-page.scss'
})
export class WishlistPage implements OnInit {
  private readonly wishlistApi = inject(WishlistApi);
  private readonly bggApi = inject(BggApi);
  private readonly gameApi = inject(GameApi);
  private readonly router = inject(Router);

  readonly tab = signal<Tab>('mine');

  readonly wishlist = signal<Wishlist[]>([]);
  readonly loadingWishlist = signal(false);
  readonly wishlistError = signal<string | null>(null);

  readonly trending = signal<BggGameDetails[]>([]);
  readonly trendingLoaded = signal(false);
  readonly loadingTrending = signal(false);
  readonly trendingError = signal<string | null>(null);

  readonly ownedBggIds = signal<Set<number>>(new Set());
  readonly wishlistBggIds = computed(() =>
    new Set(this.wishlist().map(w => w.bggId).filter((id): id is number => id != null))
  );

  isMissingBaseGame(card: WishlistCard): boolean {
    return card.basedOnBggId != null && !this.ownedBggIds().has(card.basedOnBggId);
  }

  // Search-by-name — independent of which tab is active, mirrors GameForm's BGG import UI.
  readonly searchQuery = signal('');
  readonly searchResults = signal<BggSearchHit[]>([]);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly addingBggId = signal<number | null>(null);
  readonly loadingDetailBggId = signal<number | null>(null);

  readonly selectedCategories = signal<string[]>([]);
  readonly selectedMechanics = signal<string[]>([]);

  // BGG's hot list is a fixed, non-paginated ~50-item snapshot — it's already fully
  // fetched by loadTrending(), so "Load More" just reveals more of what's in memory
  // rather than requesting anything further from BGG.
  private static readonly TRENDING_PAGE_SIZE = 20;
  readonly visibleTrendingCount = signal(WishlistPage.TRENDING_PAGE_SIZE);

  readonly detailDialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  readonly selectedCard = signal<WishlistCard | null>(null);

  readonly editingNotes = signal(false);
  readonly editingNotesValue = signal('');
  readonly savingNotes = signal(false);

  readonly formatTime = formatTime;

  private readonly currentPool = computed<WishlistCard[]>(() =>
    this.tab() === 'mine'
      ? this.wishlist().map(w => ({
          bggId: w.bggId ?? null,
          title: w.title,
          yearPublished: w.yearPublished ?? null,
          thumbnailUrl: w.thumbnailUrl ?? null,
          imageUrl: w.imageUrl ?? null,
          minPlayers: w.minPlayers ?? null,
          maxPlayers: w.maxPlayers ?? null,
          minPlayTimeMinutes: w.minPlayTimeMinutes ?? null,
          maxPlayTimeMinutes: w.maxPlayTimeMinutes ?? null,
          complexityWeight: w.complexityWeight ?? null,
          categories: w.categories,
          mechanics: w.mechanics,
          notes: w.notes,
          basedOnBggId: w.basedOnBggId ?? null,
          basedOnGameName: w.basedOnGameName ?? null,
          wishlistId: w.id
        }))
      : this.trending().map(g => cardFromDetails(g))
  );

  // Only categories/mechanics actually present in the current tab's pool — same
  // "dynamic chip availability" idea as the Suggest page, just without a separate
  // hard-filter layer underneath (the pool itself IS the filter base here).
  readonly availableCategories = computed(() => {
    const set = new Set<string>();
    for (const item of this.currentPool()) for (const c of item.categories) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  readonly availableMechanics = computed(() => {
    const set = new Set<string>();
    for (const item of this.currentPool()) for (const m of item.mechanics) set.add(m);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  readonly filteredCards = computed(() => {
    const cats = this.selectedCategories();
    const mechs = this.selectedMechanics();
    return this.currentPool().filter(item => {
      if (cats.length > 0 && !item.categories.some(c => cats.includes(c))) return false;
      if (mechs.length > 0 && !item.mechanics.some(m => mechs.includes(m))) return false;
      return true;
    });
  });

  // Only the Trending tab paginates client-side — My Wishlist is small enough (and
  // personally curated) to always show in full.
  readonly visibleCards = computed(() =>
    this.tab() === 'trending'
      ? this.filteredCards().slice(0, this.visibleTrendingCount())
      : this.filteredCards()
  );

  ngOnInit(): void {
    this.loadWishlist();
    this.gameApi.list().subscribe({
      next: games => this.ownedBggIds.set(
        new Set(games.map(g => g.bggId).filter((id): id is number => id != null))
      )
    });
  }

  private loadWishlist(): void {
    this.loadingWishlist.set(true);
    this.wishlistApi.list().subscribe({
      next: items => {
        this.wishlist.set(items);
        this.loadingWishlist.set(false);
      },
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.loadingWishlist.set(false);
      }
    });
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.selectedCategories.set([]);
    this.selectedMechanics.set([]);
    this.visibleTrendingCount.set(WishlistPage.TRENDING_PAGE_SIZE);
    if (tab === 'trending' && !this.trendingLoaded()) {
      this.loadTrending();
    }
  }

  loadMoreTrending(): void {
    this.visibleTrendingCount.update(n => n + WishlistPage.TRENDING_PAGE_SIZE);
  }

  private loadTrending(): void {
    this.loadingTrending.set(true);
    this.trendingError.set(null);
    this.bggApi.hot().subscribe({
      next: games => {
        this.trending.set(games);
        this.trendingLoaded.set(true);
        this.loadingTrending.set(false);
      },
      error: err => {
        this.trendingError.set(describeHttpError(err));
        this.loadingTrending.set(false);
      }
    });
  }

  openDetail(card: WishlistCard): void {
    this.selectedCard.set(card);
    this.editingNotes.set(false);
    this.detailDialog()?.nativeElement.showModal();
  }

  closeDetail(): void {
    this.detailDialog()?.nativeElement.close();
    this.selectedCard.set(null);
    this.editingNotes.set(false);
  }

  startEditNotes(card: WishlistCard): void {
    this.editingNotesValue.set(card.notes ?? '');
    this.editingNotes.set(true);
  }

  cancelEditNotes(): void {
    this.editingNotes.set(false);
    this.editingNotesValue.set('');
  }

  // Saved immediately via PATCH, same rationale as GameForm's play-notes editor —
  // a wishlist note isn't part of a larger draft with its own Save/Cancel, so
  // there's nothing to batch it with.
  saveNotes(card: WishlistCard): void {
    if (card.wishlistId == null) return;
    const notes = this.editingNotesValue().trim() || null;
    this.savingNotes.set(true);
    this.wishlistApi.updateNotes(card.wishlistId, notes).subscribe({
      next: updated => {
        this.wishlist.update(list => list.map(w => w.id === updated.id ? updated : w));
        this.selectedCard.update(c => c && c.wishlistId === updated.id ? { ...c, notes: updated.notes } : c);
        this.editingNotes.set(false);
        this.savingNotes.set(false);
      },
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.savingNotes.set(false);
      }
    });
  }

  toggleCategory(name: string): void {
    this.selectedCategories.update(list =>
      list.includes(name) ? list.filter(c => c !== name) : [...list, name]
    );
  }

  toggleMechanic(name: string): void {
    this.selectedMechanics.update(list =>
      list.includes(name) ? list.filter(m => m !== name) : [...list, name]
    );
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.search();
    }
  }

  search(): void {
    const query = this.searchQuery().trim();
    if (!query) return;
    this.searching.set(true);
    this.searchError.set(null);
    this.bggApi.search(query).subscribe({
      next: hits => {
        this.searchResults.set(hits);
        this.searched.set(true);
        this.searching.set(false);
      },
      error: err => {
        this.searchError.set(describeHttpError(err));
        this.searching.set(false);
      }
    });
  }

  // Search results only carry name/year (BggSearchHit) — fetch the full record
  // on demand so a hit can be previewed the same way trending/wishlist cards are,
  // before ever adding it.
  openSearchHitDetail(hit: BggSearchHit): void {
    this.loadingDetailBggId.set(hit.bggId);
    this.bggApi.details(hit.bggId).subscribe({
      next: details => {
        this.loadingDetailBggId.set(null);
        this.openDetail(cardFromDetails(details));
      },
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.loadingDetailBggId.set(null);
      }
    });
  }

  addSearchHitToWishlist(hit: BggSearchHit): void {
    this.addingBggId.set(hit.bggId);
    this.bggApi.details(hit.bggId).subscribe({
      next: details => {
        this.addDetailsToWishlist(details);
        this.searchResults.set([]);
        this.searched.set(false);
        this.searchQuery.set('');
      },
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.addingBggId.set(null);
      }
    });
  }

  addTrendingToWishlist(details: BggGameDetails): void {
    this.addingBggId.set(details.bggId);
    this.addDetailsToWishlist(details);
  }

  private addDetailsToWishlist(details: BggGameDetails): void {
    const item: Wishlist = {
      bggId: details.bggId,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      imageUrl: details.imageUrl,
      yearPublished: details.yearPublished,
      minPlayers: details.minPlayers,
      maxPlayers: details.maxPlayers,
      minPlayTimeMinutes: details.minPlayTimeMinutes,
      maxPlayTimeMinutes: details.maxPlayTimeMinutes,
      complexityWeight: details.complexityWeight,
      categories: details.categories,
      mechanics: details.mechanics,
      notes: details.description ? decodeBggDescription(details.description) : null,
      basedOnBggId: details.basedOnBggId,
      basedOnGameName: details.basedOnGameName
    };
    this.wishlistApi.add(item).subscribe({
      next: saved => {
        this.wishlist.update(list => [...list, saved]);
        this.addingBggId.set(null);
      },
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.addingBggId.set(null);
      }
    });
  }

  remove(id: number): void {
    this.wishlistApi.remove(id).subscribe({
      next: () => {
        this.wishlist.update(list => list.filter(w => w.id !== id));
        if (this.selectedCard()?.wishlistId === id) this.closeDetail();
      },
      error: err => this.wishlistError.set(describeHttpError(err))
    });
  }

  // One-click convert, same as any other BGG import: personal fields (rating,
  // owned-since) start empty and can be filled in afterward via Edit — exactly how a
  // fresh "Add Game" BGG import already works, so this doesn't need its own detour
  // through a pre-filled form.
  readonly movingId = signal<number | null>(null);

  moveToCollection(id: number): void {
    this.movingId.set(id);
    this.wishlistApi.moveToCollection(id).subscribe({
      next: () => this.router.navigate(['/collection']),
      error: err => {
        this.wishlistError.set(describeHttpError(err));
        this.movingId.set(null);
      }
    });
  }

  readonly Math = Math;
}
