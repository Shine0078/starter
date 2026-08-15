import { describe, expect, it } from 'vitest';

import { checkWebBundleBaseHref } from '../src/infra/http/web-bundle';

/**
 * These tests exist because the failure they describe is invisible. A bundle
 * built for the wrong base path returns 200 for the page and 404 for every
 * asset, so the browser renders white and the server reports itself healthy.
 * The check below is the only thing that turns that into a sentence someone can
 * read.
 */
describe('checkWebBundleBaseHref', () => {
  const page = (href: string) => `<!DOCTYPE html><html><head><base href="${href}"></head></html>`;

  it('accepts a bundle built for the path it is served from', () => {
    expect(checkWebBundleBaseHref(page('/app/'), '/app/')).toEqual({ ok: true });
  });

  it('rejects the GitHub Pages build served at the local path', () => {
    // The real regression: `flutter build web --base-href=/starter/app/` left in
    // apps/mobile/build/web, which the API serves at /app/.
    const result = checkWebBundleBaseHref(page('/starter/app/'), '/app/');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('/starter/app/');
    expect(result.ok === false && result.reason).toContain('blank page');
  });

  it('names the rebuild command with the path actually being served', () => {
    const result = checkWebBundleBaseHref(page('/starter/app/'), '/app/');

    expect(result.ok === false && result.reason).toContain('--base-href=/app/');
  });

  it('reports an unsubstituted template placeholder as its own distinct fault', () => {
    // A different broken build with the same symptom. Saying which one it is
    // saves the operator from rebuilding with a flag that was never the problem.
    const result = checkWebBundleBaseHref(page('$FLUTTER_BASE_HREF'), '/app/');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('$FLUTTER_BASE_HREF');
    expect(result.ok === false && result.reason).not.toContain('but is served at');
  });

  it('treats trailing and leading slash differences as equivalent', () => {
    // A browser resolves all three identically. Warning about them would train
    // the operator to ignore the warning that matters.
    for (const declared of ['/app', 'app/', '/app/']) {
      expect(checkWebBundleBaseHref(page(declared), '/app/')).toEqual({ ok: true });
    }
  });

  it('does not report a bundle with no base tag at all', () => {
    // No base href means assets resolve relative to the current URL, which
    // works at /app/. Not our problem to flag.
    expect(checkWebBundleBaseHref('<!DOCTYPE html><html><head></head></html>', '/app/')).toEqual({
      ok: true,
    });
  });

  it('matches the base tag regardless of casing or extra whitespace', () => {
    const result = checkWebBundleBaseHref(
      '<BASE   href="/starter/app/">',
      '/app/',
    );

    expect(result.ok).toBe(false);
  });
});
