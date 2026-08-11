/**
 * Borough classification from coordinates.
 *
 * GBFS has no borough field. `system_regions` only offers "NYC District",
 * "JC District", "Hoboken District" plus junk zones ("testzone", "IC HQ"), and
 * 13 stations carry no region at all — so a region lookup cannot answer
 * "does Manhattan hold five of the worst ten?".
 *
 * Instead we test coordinates against hand-simplified borough outlines. These
 * are deliberately coarse: they only need to be right along the *water*, since
 * the boroughs are separated by rivers and no station sits mid-channel. The one
 * genuinely hard edge is Brooklyn/Queens, which is a land border running down
 * Newtown Creek and Cypress Hills; it is traced below at street granularity.
 *
 * Polygons are [lon, lat] and tested in the order listed by `BOROUGH_SHAPES`,
 * so overlapping simplifications resolve to the earlier entry.
 */

export type Borough =
  | 'Manhattan'
  | 'Brooklyn'
  | 'Queens'
  | 'Bronx'
  | 'Staten Island'
  | 'Jersey City'
  | 'Hoboken'
  | 'Unknown';

export const BOROUGHS: readonly Borough[] = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'Bronx',
  'Staten Island',
  'Jersey City',
  'Hoboken',
  'Unknown',
];

type Ring = readonly (readonly [number, number])[];

/** Manhattan island. The west edge is drawn out into the Hudson rather than
 *  along the seawall: Hudson River Park's piers carry stations (Chelsea Piers,
 *  12 Ave & W 40 St) that sit west of the shoreline, and Battery Park City's
 *  landfill pushes past -74.017. */
const MANHATTAN: Ring = [
  [-73.9265, 40.8795], // Inwood, northern tip
  [-73.911, 40.872], // Harlem River at Dyckman St
  [-73.933, 40.836], // High Bridge
  [-73.9325, 40.811], // E 135 St
  [-73.9285, 40.8], // Willis Ave Bridge, E 125 St
  [-73.941, 40.783], // E 96 St, FDR Drive
  [-73.946, 40.77], // E 79 St
  [-73.9585, 40.7565], // Queensboro Bridge
  [-73.969, 40.749], // United Nations, E 42 St
  [-73.974, 40.735], // E 20 St
  [-73.9705, 40.725], // East River Park, Avenue D
  // Below the Williamsburg Bridge the East River turns hard west toward the
  // Battery. Cutting the corner here is what wrongly swallows DUMBO and
  // Brooklyn Heights, so the shore is traced bridge by bridge.
  [-73.974, 40.7155], // Williamsburg Bridge
  [-73.9765, 40.7115], // Corlears Hook
  [-73.982, 40.7095], // Rutgers Slip
  [-73.99, 40.708], // Pike Slip / Manhattan Bridge
  [-73.9985, 40.7075], // Brooklyn Bridge
  [-74.0035, 40.705], // South Street Seaport
  [-74.011, 40.701], // Whitehall
  [-74.0215, 40.6985], // Battery, out into the harbor
  [-74.0225, 40.713], // Battery Park City
  [-74.0205, 40.725], // Tribeca
  [-74.0175, 40.742], // Gansevoort / W 14 St
  [-74.013, 40.75], // Chelsea Piers
  [-74.006, 40.766], // Hudson River Park, W 40-57 St piers
  [-73.993, 40.788], // W 96 St
  [-73.962, 40.818], // W 125 St
  [-73.949, 40.836], // W 158 St
  [-73.947, 40.851], // George Washington Bridge
  [-73.933, 40.872], // Inwood, west side
];

/** Roosevelt Island — Manhattan borough, but it sits east of the East River
 *  line above, so it needs its own sliver or its stations fall into Queens. */
const ROOSEVELT_ISLAND: Ring = [
  [-73.9625, 40.748],
  [-73.9535, 40.75],
  [-73.941, 40.7715],
  [-73.949, 40.774],
];

/** Randalls and Wards Islands — also Manhattan borough, though they sit in the
 *  East River between the Bronx and Astoria. Tested before Queens so the Hell
 *  Gate channel resolves correctly; the parkland stations here are barely
 *  700m from Astoria's waterfront stations. */
const RANDALLS_WARDS: Ring = [
  [-73.9355, 40.7845],
  [-73.927, 40.7795],
  [-73.92, 40.7855],
  [-73.9155, 40.7925],
  [-73.9195, 40.7975],
  [-73.928, 40.799],
  [-73.9345, 40.793],
];

/** Governors Island — Manhattan borough, reachable only by ferry, and it has
 *  Citi Bike stations (Picnic Point, Soissons Landing, Yankee Ferry Terminal). */
const GOVERNORS_ISLAND: Ring = [
  [-74.029, 40.683],
  [-74.013, 40.6845],
  [-74.0125, 40.695],
  [-74.025, 40.6945],
];

const BRONX: Ring = [
  [-73.9345, 40.8],
  [-73.92, 40.7975],
  [-73.9, 40.801],
  [-73.85, 40.807],
  [-73.8, 40.812],
  [-73.765, 40.825],
  [-73.78, 40.89],
  [-73.83, 40.916],
  [-73.92, 40.913],
  [-73.935, 40.885],
  [-73.9265, 40.8795],
  [-73.933, 40.836],
  [-73.9325, 40.811],
];

/** Brooklyn. The north-east edge follows Newtown Creek, then the Cypress Hills
 *  / Highland Park line down to Jamaica Bay — the Brooklyn/Queens land border,
 *  the only borough boundary here that isn't water. The west edge runs off the
 *  seawall to take in Shore Road, Red Hook and the Brooklyn Bridge Park piers. */
const BROOKLYN: Ring = [
  [-73.96, 40.739], // Greenpoint, mouth of Newtown Creek
  [-73.93, 40.727], // Newtown Creek
  [-73.905, 40.712], // English Kills
  [-73.888, 40.7], // Bushwick / Ridgewood line
  [-73.87, 40.687], // Cypress Hills
  [-73.855, 40.678], // Highland Park
  [-73.85, 40.665], // East New York
  [-73.845, 40.64], // Starrett City
  [-73.86, 40.58], // Jamaica Bay shore
  [-73.92, 40.573], // Manhattan Beach
  [-73.985, 40.573], // Coney Island
  [-74.048, 40.6], // Verrazzano Narrows
  [-74.043, 40.64], // Bay Ridge, Shore Road
  [-74.035, 40.66], // Sunset Park waterfront
  [-74.025, 40.68], // Red Hook
  [-74.006, 40.695], // Brooklyn Bridge Park piers
  [-73.999, 40.703], // Brooklyn Heights
  [-73.986, 40.713], // Dumbo
  [-73.975, 40.72], // Williamsburg
];

/** Queens. Shares the Newtown Creek / Cypress Hills vertices with Brooklyn,
 *  walked in reverse, so the two tile exactly with no gap or overlap. The
 *  north-west edge traces the Astoria shoreline around Hell Gate. */
const QUEENS: Ring = [
  [-73.964, 40.74], // Hunters Point, Center Blvd
  [-73.956, 40.75], // Long Island City waterfront
  [-73.9455, 40.7665], // Queensbridge / Ravenswood
  [-73.938, 40.776], // Astoria, 27 Ave
  [-73.931, 40.783], // Astoria Park
  [-73.921, 40.788], // Astoria, Shore Blvd
  [-73.908, 40.79], // Bowery Bay
  [-73.84, 40.795], // Flushing Bay
  [-73.76, 40.8], // Whitestone
  [-73.7, 40.79],
  [-73.7, 40.72], // Queens / Nassau county line
  [-73.735, 40.64],
  [-73.76, 40.58], // Rockaway peninsula
  [-73.87, 40.54],
  [-73.88, 40.6],
  [-73.845, 40.64], // back up the Brooklyn border
  [-73.85, 40.665],
  [-73.855, 40.678],
  [-73.87, 40.687],
  [-73.888, 40.7],
  [-73.905, 40.712],
  [-73.93, 40.727],
  [-73.96, 40.739],
];

const STATEN_ISLAND: Ring = [
  [-74.26, 40.5],
  [-74.05, 40.49],
  [-74.03, 40.58],
  [-74.06, 40.65],
  [-74.2, 40.65],
  [-74.26, 40.6],
];

const HOBOKEN: Ring = [
  [-74.0475, 40.7325],
  [-74.02, 40.7345],
  [-74.0185, 40.762],
  [-74.035, 40.7625],
  [-74.045, 40.75],
];

/** Jersey City plus the adjacent Bayonne / Weehawken / Union City stations the
 *  New Jersey side of the system reaches. The east edge follows the Hudson
 *  channel midline, not the New Jersey seawall, so it cannot reach across the
 *  river and claim Battery Park City. */
const JERSEY_CITY: Ring = [
  [-74.12, 40.66],
  [-74.048, 40.655],
  [-74.03, 40.69],
  [-74.026, 40.71],
  [-74.023, 40.733],
  [-74.02, 40.76],
  [-74.015, 40.79],
  [-74.04, 40.795],
  [-74.07, 40.78],
  [-74.09, 40.74],
  [-74.12, 40.72],
];

const BOROUGH_SHAPES: readonly (readonly [Borough, Ring])[] = [
  ['Manhattan', MANHATTAN],
  ['Manhattan', ROOSEVELT_ISLAND],
  ['Manhattan', RANDALLS_WARDS],
  ['Manhattan', GOVERNORS_ISLAND],
  ['Bronx', BRONX],
  ['Brooklyn', BROOKLYN],
  ['Queens', QUEENS],
  ['Hoboken', HOBOKEN],
  ['Jersey City', JERSEY_CITY],
  ['Staten Island', STATEN_ISLAND],
];

/** Standard ray-casting point-in-polygon. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const cache = new Map<string, Borough>();

export function boroughFor(lat: number, lon: number): Borough {
  // Station coordinates are stable across polls, so memoize on a rounded key —
  // this runs ~2,460 times per refresh against 8 polygons.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let result: Borough = 'Unknown';
  for (const [name, ring] of BOROUGH_SHAPES) {
    if (inRing(lon, lat, ring)) {
      result = name;
      break;
    }
  }
  cache.set(key, result);
  return result;
}
