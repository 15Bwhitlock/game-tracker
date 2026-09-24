import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { BackupApi, BackupFile, BggApi, GameApi, TagDescriptionApi } from '@shared/api';
import { COMPLEXITY_LABELS, COMPLEXITY_OPTIONS, PLAYERS_UNLIMITED, PLAYER_OPTIONS, TIME_OPTIONS, TIME_UNLIMITED } from '@shared/models';
import { PreferencesService, SORT_OPTIONS, describeHttpError, formatTime, mergeBggDetails } from '@shared/services';

// Pause between BGG lookups so refreshing a big collection doesn't hammer their API.
const BGG_DELAY_MS = 400;

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss'
})
export class SettingsPage {
  private readonly backupApi = inject(BackupApi);
  private readonly gameApi = inject(GameApi);
  private readonly bggApi = inject(BggApi);
  private readonly tagApi = inject(TagDescriptionApi);
  private readonly preferences = inject(PreferencesService);

  readonly prefs = this.preferences.prefs;
  readonly sortOptions = SORT_OPTIONS;
  readonly playerOptions = PLAYER_OPTIONS;
  readonly timeOptions = TIME_OPTIONS;
  readonly complexityOptions = COMPLEXITY_OPTIONS;
  readonly complexityLabels = COMPLEXITY_LABELS;
  readonly PLAYERS_UNLIMITED = PLAYERS_UNLIMITED;
  readonly TIME_UNLIMITED = TIME_UNLIMITED;
  readonly formatTime = formatTime;

  readonly error = signal<string | null>(null);

  // --- Backup & restore ---
  readonly backupBusy = signal(false);
  readonly backupMessage = signal<string | null>(null);
  readonly pendingRestore = signal<BackupFile | null>(null);
  readonly pendingRestoreSummary = computed(() => {
    const b = this.pendingRestore();
    if (!b) return '';
    const games = b.games ?? [];
    const plays = games.reduce((n, g) => n + (g.plays?.length ?? 0), 0);
    return `${games.length} games, ${plays} plays, ${(b.wishlist ?? []).length} wishlist items`;
  });

  // --- Refresh from BoardGameGeek ---
  readonly refreshing = signal(false);
  readonly refreshDone = signal(0);
  readonly refreshTotal = signal(0);
  readonly refreshMessage = signal<string | null>(null);
  readonly refreshFailures = signal<string[]>([]);
  private cancelRefresh = false;

  // --- Dictionary housekeeping ---
  readonly dictionaryMessage = signal<string | null>(null);

  setPref<K extends keyof ReturnType<typeof this.prefs>>(key: K, value: ReturnType<typeof this.prefs>[K]): void {
    this.preferences.update({ [key]: value });
  }

  resetPrefs(): void {
    this.preferences.reset();
  }

  // ---- backup ----

  async downloadBackup(): Promise<void> {
    this.backupBusy.set(true);
    this.error.set(null);
    this.backupMessage.set(null);
    try {
      const blob = await firstValueFrom(this.backupApi.export());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.backupMessage.set('Backup downloaded.');
    } catch (err) {
      this.error.set(describeHttpError(err));
    } finally {
      this.backupBusy.set(false);
    }
  }

  async chooseRestoreFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.backupMessage.set(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed?.version == null || !Array.isArray(parsed.games)) throw new Error('not a backup');
      this.error.set(null);
      this.pendingRestore.set(parsed);
    } catch {
      this.pendingRestore.set(null);
      this.error.set("That file isn't a Game Tracker backup.");
    }
  }

  cancelRestore(): void {
    this.pendingRestore.set(null);
  }

  async confirmRestore(): Promise<void> {
    const data = this.pendingRestore();
    if (!data) return;
    this.backupBusy.set(true);
    this.error.set(null);
    try {
      const counts = await firstValueFrom(this.backupApi.restore(data));
      this.pendingRestore.set(null);
      this.backupMessage.set(`Restored ${counts.games} games, ${counts.plays} plays, ${counts.wishlist} wishlist items.`);
    } catch (err) {
      this.error.set(describeHttpError(err));
    } finally {
      this.backupBusy.set(false);
    }
  }

  // ---- BGG refresh ----

  async refreshAllFromBgg(): Promise<void> {
    this.error.set(null);
    this.refreshMessage.set(null);
    this.refreshFailures.set([]);
    this.cancelRefresh = false;
    this.refreshing.set(true);
    try {
      const linked = (await firstValueFrom(this.gameApi.list())).filter(g => g.bggId != null && g.id != null);
      this.refreshTotal.set(linked.length);
      this.refreshDone.set(0);
      let updated = 0;
      const failures: string[] = [];
      for (const game of linked) {
        if (this.cancelRefresh) break;
        try {
          const details = await firstValueFrom(this.bggApi.details(game.bggId!));
          await firstValueFrom(this.gameApi.update(game.id!, mergeBggDetails(game, details)));
          updated++;
        } catch {
          failures.push(game.title);
        }
        this.refreshDone.update(n => n + 1);
        await new Promise(resolve => setTimeout(resolve, BGG_DELAY_MS));
      }
      this.refreshFailures.set(failures);
      const stopped = this.cancelRefresh ? ' (stopped early)' : '';
      this.refreshMessage.set(`Refreshed ${updated} of ${linked.length} games${stopped}.`);
    } catch (err) {
      this.error.set(describeHttpError(err));
    } finally {
      this.refreshing.set(false);
    }
  }

  stopRefresh(): void {
    this.cancelRefresh = true;
  }

  // ---- dictionary ----

  clearPending(): void {
    this.runDictionary(this.tagApi.deletePending(), n => `Cleared ${n} "Not yet described" entries.`);
  }

  resetEdits(): void {
    this.runDictionary(this.tagApi.deleteOverrides(), n => `Restored ${n} edited entries to the originals.`);
  }

  private runDictionary(call: ReturnType<TagDescriptionApi['deletePending']>, message: (n: number) => string): void {
    this.error.set(null);
    this.dictionaryMessage.set(null);
    call.subscribe({
      next: r => this.dictionaryMessage.set(message(r.deleted)),
      error: err => this.error.set(describeHttpError(err))
    });
  }
}
