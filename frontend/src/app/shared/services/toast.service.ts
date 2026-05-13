import { Injectable, signal } from '@angular/core';

// Shape of a single toast notification.
export interface Toast {
  id: number;        // unique ID used to dismiss a specific toast
  message: string;   // main text shown to the user
  actionLabel: string;  // label on the action button (e.g. "Undo")
  onAction: () => void; // called when the user clicks the action button
}

/**
 * Signal-based toast notification queue.
 *
 * Components call show() to push a toast. It auto-dismisses after `duration`
 * milliseconds. The action callback (e.g. "Undo" on a log-play toast) can be
 * clicked before the timer fires.
 *
 * ToastComponent reads the toasts signal and renders the queue. Because it's
 * a signal, Angular re-renders the toast list automatically whenever it changes
 * — no manual change detection needed.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  // The live queue of toasts, rendered by ToastComponent.
  readonly toasts = signal<Toast[]>([]);

  // Auto-incrementing counter to give each toast a unique ID.
  private nextId = 0;

  /**
   * Show a toast notification.
   * @param message     The text to display.
   * @param actionLabel Label for the optional action button.
   * @param onAction    Called if the user clicks the action button.
   * @param duration    How long (ms) before auto-dismissing. Default 5 seconds.
   */
  show(message: string, actionLabel: string, onAction: () => void, duration = 5000): void {
    const id = ++this.nextId;
    this.toasts.update(t => [...t, { id, message, actionLabel, onAction }]);
    // Schedule auto-dismiss. If the user clicks the action or dismisses manually
    // before this fires, dismiss() is a no-op on an already-removed ID.
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }
}
