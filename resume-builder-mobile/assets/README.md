# Mobile assets

Drop these files in this folder before building. Expo will fall back to
defaults if any are missing during `expo start`, but EAS builds **require**
them.

| File                  | Size      | Purpose                                  |
| --------------------- | --------- | ---------------------------------------- |
| `icon.png`            | 1024×1024 | iOS + Android launcher icon              |
| `adaptive-icon.png`   | 1024×1024 | Android adaptive-icon foreground         |
| `splash.png`          | 1284×2778 | Splash screen (any aspect, 9:19.5 best)  |
| `favicon.png`         | 48×48     | Web (`expo start --web`) favicon         |

If you want to bootstrap quickly, copy the existing web icon:

```bash
# from repo root
cp resume-builder-web/public/icons/icon.svg \
   resume-builder-mobile/assets/icon.svg
# then convert to PNG with any tool (rsvg-convert, ImageMagick, online):
rsvg-convert -w 1024 -h 1024 \
   resume-builder-mobile/assets/icon.svg \
   -o resume-builder-mobile/assets/icon.png
cp resume-builder-mobile/assets/icon.png \
   resume-builder-mobile/assets/adaptive-icon.png
```

`splash.png` and `favicon.png` are best authored separately at the right
sizes — you can use [makeappicon.com](https://makeappicon.com/) or
`expo install expo-splash-screen && expo splash` to generate them.
