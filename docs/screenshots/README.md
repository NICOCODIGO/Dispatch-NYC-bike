# Screenshots

Drop images here using these exact filenames. The main
[README](../../README.md) already links to both, so each one appears the moment
the file lands — no markdown editing needed.

| Filename | Which screenshot |
| --- | --- |
| `queue.png` | **Priority Queue with a station's Score Breakdown open** — ranked table on the left, receipt panel on the right. Sits at the very top of the README. |
| `map.jpg` | **Network Status Map** — the full city, Urgency layer, legend visible. |

That's it. Two files. Adding more means adding matching `![...](...)` lines to
the main README, or they'll sit in this folder doing nothing.

## Why one PNG and one JPG

They're different kinds of picture, so they compress differently.

The **queue** is flat colour, hairline borders and 10px type — exactly what JPEG
handles worst. It stays PNG, and PNG happens to be efficient on flat UI anyway
(324 KB for a 2101px-wide capture).

The **map** is a raster basemap under thousands of soft dots — closer to a
photograph, and PNG is the wrong tool for it. The original 2100px PNG was
**2.32 MB**, nearly eight times the queue, for an image GitHub displays at about
880px. Resampled to 1600px and saved as JPEG at quality 90 it is **0.29 MB** with
no visible difference at display size.

Rule of thumb if you swap either out: **flat UI → PNG, anything with a map or
photo in it → JPEG.**

## If you re-capture

- **Wait for live data** so the counts are real numbers, not skeleton rows.
- **Hide personal browser chrome** — bookmarks bar, extensions, other tabs.
- **~1600px wide is plenty.** GitHub's content column is around 880px; anything
  past 1600 is weight nobody sees.
- **Keep the pair under ~1 MB total.** They're currently 624 KB together.
