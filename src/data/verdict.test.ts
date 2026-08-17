import { describe, expect, it } from 'vitest';
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD, type ScoreBreakdown } from '../model/score';
import { toneForScore } from '../ui/tone';
import { VERDICT_LINE, verdictFor, wantsTruck } from './verdict';

const T = NEEDS_TRUCK_THRESHOLD;
const C = CRITICAL_THRESHOLD;

/** A scored, fresh, truck-lane breakdown. Overridden per case. */
function breakdown(over: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    scored: true,
    signal: 'empty',
    category: 'empty',
    staleness: { notReporting: false, ageMinutes: 2, penalty: 0 },
    ...over,
  } as ScoreBreakdown;
}

describe('verdictFor', () => {
  describe('the two lines', () => {
    it('is below one point under the dispatch threshold', () => {
      expect(verdictFor(breakdown(), T - 1)).toBe('below');
    });

    it('is dispatch exactly at the dispatch threshold — inclusive', () => {
      expect(verdictFor(breakdown(), T)).toBe('dispatch');
    });

    it('is dispatch one point under the critical line', () => {
      expect(verdictFor(breakdown(), C - 1)).toBe('dispatch');
    });

    it('is critical exactly at the critical line — inclusive', () => {
      expect(verdictFor(breakdown(), C)).toBe('critical');
    });
  });

  describe('lane beats score', () => {
    /**
     * The regression this module exists for. An unverified station can compute
     * a high score off stale counts while `needsTruck` stays false, which is
     * how the drawer once rendered "Urgency score 100 / 100" directly above
     * "Below the 55-point threshold. No truck needed yet."
     */
    it('calls a high-scoring unverified station excluded, not urgent', () => {
      const b = breakdown({ staleness: { notReporting: true, ageMinutes: 240, penalty: 10 } as never });
      expect(verdictFor(b, 100)).toBe('unverified');
    });

    it('calls a low-scoring unverified station excluded, not "below"', () => {
      const b = breakdown({ staleness: { notReporting: true, ageMinutes: 240, penalty: 10 } as never });
      expect(verdictFor(b, 3)).toBe('unverified');
    });

    it('calls an outage mechanical however high it scores', () => {
      expect(verdictFor(breakdown({ signal: 'outage' }), 100)).toBe('mechanic');
    });
  });

  it('only sends a truck for the two lines above the dispatch threshold', () => {
    expect(wantsTruck('critical')).toBe(true);
    expect(wantsTruck('dispatch')).toBe(true);
    expect(wantsTruck('below')).toBe(false);
    expect(wantsTruck('unverified')).toBe(false);
    expect(wantsTruck('mechanic')).toBe(false);
  });

  it('has a line for every kind', () => {
    for (const kind of ['critical', 'dispatch', 'below', 'unverified', 'mechanic'] as const) {
      expect(VERDICT_LINE[kind]).toBeTruthy();
    }
  });
});

/**
 * The badge ramp and the Score Guide are two renderings of one set of bands.
 * They drifted once — the ramp turned amber at 40 while the published legend
 * said amber began at 55 — so the boundaries are pinned to the same constants
 * the legend is generated from.
 */
describe('toneForScore agrees with the published bands', () => {
  it('is green below the dispatch threshold', () => {
    expect(toneForScore(T - 1)).toBe('ok');
    expect(toneForScore(0)).toBe('ok');
  });

  it('is amber from the dispatch threshold to just under critical', () => {
    expect(toneForScore(T)).toBe('warn');
    expect(toneForScore(C - 1)).toBe('warn');
  });

  it('is red from the critical line up', () => {
    expect(toneForScore(C)).toBe('empty');
    expect(toneForScore(100)).toBe('empty');
  });

  it('is muted for an unscored station', () => {
    expect(toneForScore(null)).toBe('mute');
  });
});
