import { Injectable, signal } from '@angular/core';

/**
 * Manages dark/light mode for the whole app.
 *
 * The chosen theme is persisted to localStorage so it survives page refreshes.
 * On first visit (nothing in localStorage), we respect the OS-level preference
 * via the CSS media query "prefers-color-scheme: dark".
 *
 * Toggling adds/removes a "dark" CSS class on <html>, which all SCSS variables
 * key off of to switch the colour palette.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'theme';

  // isDark is an Angular signal — components can read it reactively and will
  // re-render automatically when it changes.
  readonly isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(this.storageKey);
    // Use the saved preference if present; otherwise fall back to the OS setting.
    const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(dark);
  }

  toggle(): void {
    this.apply(!this.isDark());
  }

  private apply(dark: boolean): void {
    this.isDark.set(dark);
    // Toggle the "dark" class on <html> — all CSS variables switch based on this.
    document.documentElement.classList.toggle('dark', dark);
    // Persist so the next page load remembers the choice.
    localStorage.setItem(this.storageKey, dark ? 'dark' : 'light');
  }
}
