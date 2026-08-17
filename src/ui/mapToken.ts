/**
 * The Mapbox token, in its own module so reading it does not drag the library.
 *
 * `mapbox-gl` is 1.6 MB — six times the rest of the app put together. Anything
 * that imports StationMap to ask "do we have a token?" would pull the whole
 * engine into the main bundle for every visitor, including the ones who never
 * open the map. This file is two lines and safe to import anywhere; the map
 * itself is loaded on demand.
 *
 * Vite inlines VITE_* at build time, so this ends up as a literal in the
 * bundle. That is fine and unavoidable for a client-side map — a `pk.` token is
 * designed to be public. The control that matters is the URL restriction set
 * on the token in the Mapbox dashboard, not secrecy.
 */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
