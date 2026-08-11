import { describe, expect, it } from 'vitest';
import { NEEDS_TRUCK_THRESHOLD } from './score';
import type { SnapshotRow } from '../data/snapshots';
import {
  OUTCOME_DEFINITIONS,
  OUTCOME_DELTA_TOLERANCE,
  buildTracks,
  classifyOutcome,
  countOutcomes,
} from './verify';

const T = NEEDS_TRUCK_THRESHOLD;
const TOL = OUTCOME_DELTA_TOLERANCE;

describe('outcome classification', () => {
  describe('boundary: the truck threshold', () => {
    it('is resolved one point below the threshold', () => {
      expect(classifyOutcome(90, T - 1)).toBe('resolved');
    });

    it('is NOT resolved exactly at the threshold — the threshold is inclusive', () => {
      expect(classifyOutcome(90, T)).toBe('still-failing');
    });

    it('counts as resolved however far it fell', () => {
      expect(classifyOutcome(100, 0)).toBe('resolved');
      expect(classifyOutcome(T, T - 1)).toBe('resolved');
    });

    it('resolves even when the score rose first and then crossed back down', () => {
      // Outcome is about where it ended up, not the path.
      expect(classifyOutcome(60, T - 1)).toBe('resolved');
    });
  });

  describe('boundary: the noise tolerance', () => {
    it('treats a rise of exactly the tolerance as noise, not worsening', () => {
      expect(classifyOutcome(80, 80 + TOL)).toBe('still-failing');
    });

    it('calls one point past the tolerance worsened', () => {
      expect(classifyOutcome(80, 80 + TOL + 1)).toBe('worsened');
    });

    it('does not call an unchanged score worsened', () => {
      expect(classifyOutcome(80, 80)).toBe('still-failing');
    });

    it('does not call an improvement worsened, however large', () => {
      expect(classifyOutcome(100, T)).toBe('still-failing');
      expect(classifyOutcome(100, T + 1)).toBe('still-failing');
    });

    it('clamping at 100 cannot manufacture a worsening', () => {
      expect(classifyOutcome(100, 100)).toBe('still-failing');
    });
  });

  it('always returns exactly one of the three outcomes', () => {
    for (let first = 0; first <= 100; first += 7) {
      for (let now = 0; now <= 100; now += 7) {
        expect(['resolved', 'still-failing', 'worsened']).toContain(classifyOutcome(first, now));
      }
    }
  });
});

describe('outcome definitions', () => {
  it('states the same numbers the code compares against', () => {
    // The UI renders these strings verbatim. If a constant moves and the prose
    // does not, this fails rather than quietly lying to the user.
    expect(OUTCOME_DEFINITIONS.resolved).toContain(String(T));
    expect(OUTCOME_DEFINITIONS['still-failing']).toContain(String(T));
    expect(OUTCOME_DEFINITIONS['still-failing']).toContain(String(TOL));
    expect(OUTCOME_DEFINITIONS.worsened).toContain(String(TOL));
  });
});

// ---------------------------------------------------------------------------

let seq = 0;
function row(over: Partial<SnapshotRow> & { t: number; score: number }): SnapshotRow {
  const stationId = over.stationId ?? 'A';
  return {
    id: `${stationId}:${over.t}:${seq++}`,
    stationId,
    name: over.name ?? 'Test St & Test Ave',
    borough: 'Manhattan',
    category: 'empty',
    signal: 'empty',
    needsTruck: over.score >= T,
    bikes: 0,
    docks: 20,
    ...over,
  };
}

describe('building tracks from snapshots', () => {
  it('groups readings per station and orders them oldest first', () => {
    const [track] = buildTracks([
      row({ t: 3000, score: 80 }),
      row({ t: 1000, score: 90 }),
      row({ t: 2000, score: 85 }),
    ]);
    expect(track?.scores).toEqual([90, 85, 80]);
    expect(track?.firstScore).toBe(90);
    expect(track?.currentScore).toBe(80);
    expect(track?.delta).toBe(-10);
  });

  it('ignores stations that were never flagged', () => {
    expect(buildTracks([row({ t: 1, score: 10 }), row({ t: 2, score: 20 })])).toHaveLength(0);
  });

  it('measures from the first flagged reading, not from first sight', () => {
    // Recorded below threshold first; the comparison must start at 90, so the
    // rise to 98 is +8 (worsened) rather than +78 measured from the 20.
    const [track] = buildTracks([
      row({ t: 1000, score: 20 }),
      row({ t: 2000, score: 90 }),
      row({ t: 3000, score: 98 }),
    ]);
    expect(track?.firstScore).toBe(90);
    expect(track?.readings).toHaveLength(2);
    expect(track?.delta).toBe(8);
    expect(track?.outcome).toBe('worsened');
  });

  it('carries the counts behind each reading', () => {
    const [track] = buildTracks([row({ t: 1000, score: 90, bikes: 0, docks: 28 })]);
    expect(track?.readings[0]).toMatchObject({ bikes: 0, docks: 28 });
  });

  it('tolerates older rows written before counts were recorded', () => {
    const legacy = row({ t: 1000, score: 90 });
    delete legacy.bikes;
    delete legacy.docks;
    const [track] = buildTracks([legacy]);
    expect(track?.readings[0]?.bikes).toBeNull();
  });

  it('sorts open work above resolved work', () => {
    const tracks = buildTracks([
      row({ stationId: 'resolved', t: 1, score: 90 }),
      row({ stationId: 'resolved', t: 2, score: 10 }),
      row({ stationId: 'worse', t: 1, score: 80 }),
      row({ stationId: 'worse', t: 2, score: 95 }),
      row({ stationId: 'same', t: 1, score: 70 }),
      row({ stationId: 'same', t: 2, score: 70 }),
    ]);
    expect(tracks.map((t) => t.outcome)).toEqual(['worsened', 'still-failing', 'resolved']);
  });

  it('counts outcomes across every track', () => {
    const tracks = buildTracks([
      row({ stationId: 'a', t: 1, score: 90 }),
      row({ stationId: 'a', t: 2, score: 10 }),
      row({ stationId: 'b', t: 1, score: 80 }),
      row({ stationId: 'b', t: 2, score: 95 }),
    ]);
    expect(countOutcomes(tracks)).toEqual({ resolved: 1, 'still-failing': 0, worsened: 1 });
  });

  it('handles a single reading without inventing a trend', () => {
    const [track] = buildTracks([row({ t: 1000, score: 90 })]);
    expect(track?.delta).toBe(0);
    expect(track?.outcome).toBe('still-failing');
    expect(track?.readings).toHaveLength(1);
  });
});
