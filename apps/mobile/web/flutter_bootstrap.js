{{flutter_js}}
{{flutter_build_config}}

// FINVERSE must not need a second, third-party origin to draw its first
// frame. The default Flutter release template resolves CanvasKit from
// gstatic.com; when that host is filtered, slow, or unavailable on an iPhone,
// the bootstrap leaves the user on the launch screen indefinitely. Keep the
// renderer next to the app bundle instead. `canvaskit/` is resolved from the
// generated document base, so it remains correct at the public `/app/` mount.
//
// Older bootstrap bundles still request flutter_service_worker.js; the
// migration-only source file at that path clears and unregisters any old
// Flutter cache. Fresh bundles intentionally do not register a worker.
_flutter.loader.load({
  config: {
    canvasKitBaseUrl: 'canvaskit/',
  },
});
