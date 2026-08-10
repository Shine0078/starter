# FINVERSE web bundle

This directory is mounted read-only into the optional public `web` container.
Before starting the public stack, place the contents of `apps/mobile/build/web`
here after building with:

```powershell
flutter build web --release `
  --base-href=/app/ `
  --dart-define=API_BASE_URL=https://api.your-domain.example
```

The deployment serves the bundle at `/app/` and routes the API origin directly
to the same public HTTPS hostname.
