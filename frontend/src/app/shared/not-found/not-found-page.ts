import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Catch-all page for any URL that doesn't match a real route (app.routes.ts's
 * wildcard '**' route). Without this, an unknown path used to render a blank
 * <main> under the header instead of telling the user anything.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss'
})
export class NotFoundPage {}
