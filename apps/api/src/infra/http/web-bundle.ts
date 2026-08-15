/**
 * Checks that a built Flutter web bundle matches the path it is served from.
 *
 * A bundle built for a different base path is the worst kind of failure: the
 * server answers 200 for `index.html`, then 404s every asset that page asks
 * for, so the browser shows a blank white screen and the server looks perfectly
 * healthy. Nothing in the logs, nothing in the console, no exception to find.
 *
 * This exact mismatch — a GitHub Pages build (`/starter/app/`) sitting in the
 * directory served at `/app/` — cost a long debugging session and was blamed on
 * Flutter, then Safari, then a service worker, before anyone compared the two
 * strings. One `<base href>` tag was all it took to tell them apart.
 */

/** The result of comparing a bundle's declared base href against its mount path. */
export type WebBundleCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Compares the `<base href>` a bundle was built with against where it is
 * mounted.
 *
 * Returns a *warning*, never a fatal error, and the caller logs it rather than
 * refusing to boot. An operator may legitimately serve behind a proxy that
 * rewrites the prefix, and a server that will not start is worse than a server
 * that says loudly what looks wrong.
 *
 * A bundle with no `<base href>` at all resolves assets relative to the current
 * URL, which happens to work at `/app/` — so that is not reported.
 */
export function checkWebBundleBaseHref(
  indexHtml: string,
  servedAt: string,
): WebBundleCheck {
  const declared = indexHtml.match(/<base\s+href="([^"]*)"/i)?.[1];
  if (declared === undefined) return { ok: true };

  // Flutter emits `$FLUTTER_BASE_HREF` when the template is left unsubstituted.
  // That is a broken build, but it is a *different* broken build, and saying so
  // precisely is more useful than reporting a path mismatch.
  if (declared.includes('$FLUTTER_BASE_HREF')) {
    return {
      ok: false,
      reason:
        'Web bundle still contains the unsubstituted $FLUTTER_BASE_HREF placeholder. ' +
        `Rebuild with \`flutter build web --base-href=${servedAt}\`.`,
    };
  }

  if (normalise(declared) === normalise(servedAt)) return { ok: true };

  return {
    ok: false,
    reason:
      `Web bundle was built with base href "${declared}" but is served at "${servedAt}". ` +
      'Every asset will 404 and the app will render a blank page. Rebuild with ' +
      `\`flutter build web --release --no-web-resources-cdn --base-href=${servedAt}\`.`,
  };
}

/**
 * `/app`, `/app/`, and `app/` all mean the same mount point to a browser.
 * Reporting those as a mismatch would train the operator to ignore the warning,
 * which costs more than the warning is worth.
 */
function normalise(path: string): string {
  return `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
}
