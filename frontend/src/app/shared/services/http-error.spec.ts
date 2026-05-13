import { describeHttpError } from './http-error';

describe('describeHttpError', () => {
  it('extracts the message field from a backend error body', () => {
    const err = { error: { message: 'Game not found: 5' }, status: 404 };
    expect(describeHttpError(err)).toBe('Game not found: 5');
  });

  it('returns a 404 string when no message body and status is 404', () => {
    const err = { status: 404 };
    expect(describeHttpError(err)).toBe('Not found.');
  });

  it('returns a 400 string when status is 400', () => {
    const err = { status: 400 };
    expect(describeHttpError(err)).toBe('Invalid request — check your input.');
  });

  it('returns server-unreachable message when status is 0', () => {
    const err = { status: 0 };
    expect(describeHttpError(err)).toBe('Could not reach the server.');
  });

  it('returns catch-all for unrecognised status codes', () => {
    const err = { status: 503 };
    expect(describeHttpError(err)).toBe('Something went wrong.');
  });

  it('returns catch-all for null input', () => {
    expect(describeHttpError(null)).toBe('Something went wrong.');
  });

  it('returns catch-all for non-object input', () => {
    expect(describeHttpError('network error')).toBe('Something went wrong.');
  });

  it('ignores non-string message in error body', () => {
    const err = { error: { message: 42 }, status: 500 };
    expect(describeHttpError(err)).toBe('Something went wrong.');
  });
});
