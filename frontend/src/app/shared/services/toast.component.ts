import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  template: `
    <div class="toast-stack">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast">
          <span class="toast__message">{{ toast.message }}</span>
          <button type="button" class="toast__action" (click)="act(toast.id, toast.onAction)">
            {{ toast.actionLabel }}
          </button>
          <button type="button" class="toast__close" (click)="toastService.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 1000;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 0.75rem 0.65rem 1rem;
      background: var(--text-primary);
      color: var(--bg-page);
      border-radius: 8px;
      box-shadow: 0 4px 16px var(--shadow-modal);
      font-size: 0.9rem;
      pointer-events: all;
      animation: slide-up 0.2s ease;
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .toast__message { flex: 1; }

    .toast__action {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 5px;
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      white-space: nowrap;

      &:hover { background: rgba(255,255,255,0.08); color: var(--bg-page); }
    }

    .toast__close {
      background: transparent;
      border: none;
      color: var(--bg-hover);
      font-size: 1.1rem;
      line-height: 1;
      padding: 0.1rem 0.3rem;
      cursor: pointer;
      border-radius: 4px;

      &:hover { background: rgba(255,255,255,0.08); color: var(--bg-page); }
    }
  `]
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  act(id: number, onAction: () => void): void {
    onAction();
    this.toastService.dismiss(id);
  }
}
