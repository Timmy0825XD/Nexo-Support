# Schedule thumbnail backgrounds

Place match schedule banner backgrounds in this folder.

## Recommended format (fastest)

| Format | Speed | Notes |
|--------|-------|-------|
| **JPEG (`.jpg`)** | Fastest | Use 85–90% quality, 1280×720 or 1920×1080 |
| **WebP (`.webp`)** | Fast | Good size/quality balance |
| **PNG (`.png`)** | Slower | Larger files; use only if you need transparency |

The bot loads **local files first** (random pick, never the same as the previous schedule), then falls back to remote URLs in code.

Rotation state is saved in `bot/data/schedule-thumbnail-state.json` so backgrounds stay distinct across bot restarts.

## Tips

- Keep files under ~500 KB each for quick generation.
- Use landscape 16:9 (1920×1080 or 1280×720).
- File names can be anything; only `.jpg`, `.jpeg`, `.png`, and `.webp` are used.
