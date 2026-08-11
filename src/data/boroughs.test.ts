import { describe, expect, it } from 'vitest';
import { boroughFor } from './boroughs';

/**
 * These coordinates are taken from real Citi Bike stations. The waterfront
 * cases are the ones that matter: every borough boundary here except
 * Brooklyn/Queens is a river, and a polygon that cuts a corner silently files
 * whole neighbourhoods under the wrong borough — which then shows up as a
 * false claim in the situation sentence ("Manhattan holds 8 of the worst 10").
 */
describe('borough classification', () => {
  it.each([
    ['W 52 St & 11 Ave', 40.7674, -73.9932, 'Manhattan'],
    ['Broadway & W 25 St', 40.7429, -73.9892, 'Manhattan'],
    ['E 17 St & Broadway', 40.7373, -73.9901, 'Manhattan'],
    ['Bedford Ave & Nassau Ave', 40.7231, -73.9525, 'Brooklyn'],
    ['31 St & Ditmars Blvd', 40.7746, -73.9121, 'Queens'],
    ['Vernon Blvd & 50 Ave', 40.7423, -73.9538, 'Queens'],
  ])('places %s in %s', (_name, lat, lon, expected) => {
    expect(boroughFor(lat, lon)).toBe(expected);
  });

  describe('waterfront edges', () => {
    it.each([
      // The East River turns hard west below the Williamsburg Bridge. A
      // straight line from Manhattan's east side to the Battery swallows all
      // of DUMBO and Brooklyn Heights.
      ['Bridge St & York St (DUMBO)', 40.7026, -73.9869, 'Brooklyn'],
      ['Columbia Heights & Cranberry St', 40.7004, -73.9955, 'Brooklyn'],
      ['Brooklyn Bridge Park Pier 2', 40.6985, -73.9972, 'Brooklyn'],
      // Bay Ridge's Shore Road sits outside the seawall.
      ['Shore Rd & 86 St', 40.6256, -74.0408, 'Brooklyn'],

      // Hudson River Park piers stick west of Manhattan's shoreline, and
      // Battery Park City is landfill past -74.017.
      ['Pier 61 at Chelsea Piers', 40.7469, -74.0082, 'Manhattan'],
      ['12 Ave & W 40 St', 40.7609, -74.0028, 'Manhattan'],
      ['West Thames St', 40.7083, -74.0171, 'Manhattan'],
      ['South St & Pike St', 40.7099, -73.9916, 'Manhattan'],
      ['Ave D & E 12 St', 40.7258, -73.9742, 'Manhattan'],

      // Islands that belong to Manhattan but sit in other waters.
      ['Southpoint Park (Roosevelt Is.)', 40.7537, -73.9587, 'Manhattan'],
      ['Soissons Landing (Governors Is.)', 40.6926, -74.0159, 'Manhattan'],
      ['Icahn Stadium (Randalls Is.)', 40.7932, -73.924, 'Manhattan'],
      ['Wards Meadow (Wards Is.)', 40.7829, -73.9308, 'Manhattan'],

      // Astoria's shoreline wraps around Hell Gate, within 700m of Wards Island.
      ['Shore Blvd & Astoria Park', 40.7798, -73.9232, 'Queens'],
      ['20 Ave & Shore Blvd', 40.786, -73.9151, 'Queens'],
      ['Center Blvd & 51 Ave', 40.7434, -73.9596, 'Queens'],

      // Across the Hudson. The New Jersey polygons stop at the channel
      // midline so they cannot reach over and claim Battery Park City.
      ['River St & 1 St', 40.7372, -74.0289, 'Hoboken'],
      ['Adams St & 12 St', 40.7519, -74.0333, 'Hoboken'],
    ])('places %s in %s', (_name, lat, lon, expected) => {
      expect(boroughFor(lat, lon)).toBe(expected);
    });
  });

  it('never returns Unknown for a coordinate inside the service area', () => {
    // A sweep across the bounding box of the system; every hit must resolve.
    const probes: [number, number][] = [
      [40.7128, -74.006], // Lower Manhattan
      [40.8296, -73.9262], // Bronx
      [40.6782, -73.9442], // Brooklyn
      [40.7282, -73.7949], // Queens
      [40.7178, -74.0431], // Jersey City
    ];
    for (const [lat, lon] of probes) {
      expect(boroughFor(lat, lon)).not.toBe('Unknown');
    }
  });

  it('returns Unknown well outside the service area rather than guessing', () => {
    expect(boroughFor(51.5074, -0.1278)).toBe('Unknown'); // London
    expect(boroughFor(0, 0)).toBe('Unknown'); // Null Island
  });

  it('is deterministic across repeated calls (memoization is transparent)', () => {
    expect(boroughFor(40.7026, -73.9869)).toBe(boroughFor(40.7026, -73.9869));
  });
});
