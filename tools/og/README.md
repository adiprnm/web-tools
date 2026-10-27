# Open Graph cards

Source for the share images on tools.adipurnm.com. Each card is a small HTML
file rendered with headless Chromium, then downscaled to 1200×630.

## Render

```sh
cd tools/og
npm install        # once
npm run render
```

This writes `../../zen-write/og-image.png`. Chromium defaults to
`/usr/bin/chromium`; override with `CHROMIUM_PATH`. ImageMagick (`magick` or
`convert`) is required for the downscale.

## Editing

Copy and spacing live in `zen-write.html`, in the same tokens the site uses:

| Token | Warm value |
| --- | --- |
| Paper | `#f6efe3` |
| Ink | `#2b2118` |
| Dim | `#c8b89f` |
| Muted | `#7b6853` |
| Accent | `#c2551f` |

The prose is JetBrains Mono at 42px with a 900px measure, so keep each line
under ~35 characters. Fonts are loaded from `assets/fonts/`.

After rendering, rebuild the site and commit both `zen-write/og-image.png` and
any change here.
