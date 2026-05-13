import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '@shared/services';
import { ToastComponent } from '@shared/services';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly theme = inject(ThemeService);
}
