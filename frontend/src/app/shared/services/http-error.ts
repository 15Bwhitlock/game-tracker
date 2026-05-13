/**
 * Converts an Angular HttpErrorResponse into a user-friendly string.
 *
 * The backend's GlobalExceptionHandler always returns a JSON body shaped as
 * {"message": "..."} for known errors, so we try to extract that first.
 * If the response isn't from our backend (network down, proxy issue, etc.)
 * we fall back to status-based strings so the user always sees something
 * meaningful rather than Angular's internal error message.
 */
export function describeHttpError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: { message?: unknown }; status?: number };

    // Our backend always sends {"message": "..."} — extract it if present.
    if (typeof e.error?.message === 'string') return e.error.message;

    // Fall back to status-specific messages for cases where the body isn't
    // our JSON (e.g. a 404 from the proxy, or a Spring error page).
    if (e.status === 404) return 'Not found.';
    if (e.status === 400) return 'Invalid request — check your input.';

    // status === 0 means the request never reached the server (server down,
    // network disconnected, or the Angular dev proxy isn't running).
    if (e.status === 0) return 'Could not reach the server.';
  }

  // Catch-all for anything unexpected (non-object errors, unrecognised status codes).
  return 'Something went wrong.';
}
