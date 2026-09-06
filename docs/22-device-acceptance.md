# Physical device acceptance matrix

Engineering preparation for `Final Goal.md` P1.4. This is the checklist, not
completed hardware proof. Do not mark passkeys or push complete from CI alone.

Canonical API: `https://finverse-d6vqs5iu7q-uc.a.run.app`

Record the SHA from `/api/version` before testing. If that route is 404, the
live image is stale and device results are not valid for the current `main`.

## Android

| Check | Low-end device | Modern device | Result |
| --- | --- | --- | --- |
| Release APK against canonical HTTPS API | | | |
| Sign-in / refresh / app lock | | | |
| Passkey register + login + remove | | | |
| Offline edit, reconnect, rejected mutation | | | |
| Receipt OCR | | | |
| Push permission and lock-screen copy | | | |
| Plaid Link (sandbox until production approval) | | | |
| Export and account deletion with MFA | | | |
| TalkBack + 200% text | | | |

## iPhone

| Check | Safari PWA | Chrome iOS | Native | Result |
| --- | --- | --- | --- | --- |
| Same-origin `/app/` | | | | |
| Face ID / app lock | | | | |
| Passkey register + login + remove | | | | |
| Associated domain / AASA | | | | |
| Push | | | | |
| Receipt OCR | | | | |
| Plaid | | | | |
| Session restore after kill | | | | |
| VoiceOver | | | | |

## Browser

| Check | Chrome | Safari | Result |
| --- | --- | --- | --- |
| WebAuthn login | | | |
| Registration legal URLs | | | |
| Offline banner / conflict center | | | |

Fill results with date, device OS, and SHA. Empty cells mean not proven.
