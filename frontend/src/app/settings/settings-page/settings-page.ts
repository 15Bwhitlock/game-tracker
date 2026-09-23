import { Component, OnInit, inject, signal } from '@angular/core';

import { AppSettingsApi } from '@shared/api';
import { describeHttpError } from '@shared/services';

@Component({
  selector: 'app-settings-page',
  imports: [],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss'
})
export class SettingsPage implements OnInit {
  private readonly api = inject(AppSettingsApi);

  readonly aiEnabled = signal(true);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.get().subscribe({
      next: settings => {
        this.aiEnabled.set(settings.aiEnabled);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(describeHttpError(err));
        this.loading.set(false);
      }
    });
  }

  toggleAi(): void {
    const next = !this.aiEnabled();
    this.saving.set(true);
    this.error.set(null);
    this.api.updateAiEnabled(next).subscribe({
      next: settings => {
        this.aiEnabled.set(settings.aiEnabled);
        this.saving.set(false);
      },
      error: err => {
        this.error.set(describeHttpError(err));
        this.saving.set(false);
      }
    });
  }
}
