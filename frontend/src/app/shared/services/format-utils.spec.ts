import { formatPlayers } from './format-utils';

describe('formatPlayers', () => {
  it('uses the singular for a solo-only game, never "1–1" or "1 players"', () => {
    expect(formatPlayers(1, 1)).toBe('1 player');
  });

  it('uses the plural for a single fixed count above one', () => {
    expect(formatPlayers(2, 2)).toBe('2 players');
  });

  it('shows a range when min and max differ, including a solo-friendly range', () => {
    expect(formatPlayers(1, 4)).toBe('1–4 players');
    expect(formatPlayers(2, 4)).toBe('2–4 players');
  });

  it('shows 10+ for the unlimited sentinel', () => {
    expect(formatPlayers(2, 99)).toBe('2–10+ players');
    expect(formatPlayers(99, 99)).toBe('10+ players');
  });

  it('returns an empty string when either count is unknown', () => {
    expect(formatPlayers(null, 4)).toBe('');
    expect(formatPlayers(2, undefined)).toBe('');
  });
});
