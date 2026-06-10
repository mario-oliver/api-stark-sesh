# Stark Reference Frames

These PNG files are passed as style/pose reference images to `openai.images.edit` during per-dog sprite generation. They anchor the visual style and pose vocabulary so generated sprites are consistent with the Stark art style.

## Required files

Each file must be a 1024×1024 (or larger) transparent PNG with the Stark dog in the correct pose.

### `idle/`

| File | Pose |
|------|------|
| `idle_001.png` | Relaxed standing, base rest pose (weight even, tail horizontal) |
| `idle_002.png` | Subtle weight shift — left front paw barely lifted |
| `idle_003.png` | Head tilted 8° right, curious look |
| `idle_004.png` | Chest expansion, breathing in |
| `idle_005.png` | Head centered, ears forward attentively |

### `run/`

| File | Pose |
|------|------|
| `run_001.png` | Mid-stride extended — front-left + rear-right forward |
| `run_002.png` | Peak suspension — all legs tucked, body stretched |
| `run_003.png` | Landing stride — front-right + rear-left forward |

### `bark/`

| File | Pose |
|------|------|
| `bark_001.png` | Mouth wide open mid-bark, alert stance |
| `bark_002.png` | Mouth snapping shut, same stance |

## How to add frames

1. Export from the Stark design assets (`Assets.xcassets/Sprites/Stark/`) or the app icon.
2. Name files `{animation}_{NNN}.png` (zero-padded 3 digits).
3. Ensure transparent PNG with no background fill.
4. The API loads these at runtime from this directory via `loadStarkReferenceFrame()` in `services/spriteGen/starkReference.ts`.

## Loading logic

`starkReference.ts` uses `fs.readFileSync` with a graceful fallback — if a reference file is missing, generation proceeds without that specific reference (the base dog photo + previous frame still anchor style). This means generation can function with partial or no reference frames, but quality will be better with them.
