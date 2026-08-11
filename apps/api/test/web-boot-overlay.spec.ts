/**
 * The boot overlay must never be able to outlive the app it covers.
 *
 * This guards a bug that cost several sessions and was misdiagnosed four times
 * — as an iOS Safari version problem, a service-worker cache problem, a
 * CanvasKit CDN problem, and an API problem. It was none of those.
 *
 * `web/index.html` paints a loading overlay and removed it only when the
 * `flutter-first-frame` event fired. That event does not fire in every
 * Flutter/bootstrap combination, and does not fire in ours. The app rendered
 * perfectly and sat invisible underneath a splash with no way out, which
 * presents to the user as "stuck loading forever".
 *
 * A cover with one release mechanism is a cover that eventually jams, so there
 * are three independent ways out. This asserts all three still exist — reverting
 * to the event alone reintroduces an unrecoverable blank screen on someone's
 * phone, and nothing else in the suite would notice.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(
  join(__dirname, '..', '..', 'mobile', 'web', 'index.html'),
  'utf8',
);

describe('web boot overlay', () => {
  it('still exists, because a blank first load reads as a crash', () => {
    expect(indexHtml).toContain('id="boot"');
  });

  it('dismisses on the first-frame event when the engine emits one', () => {
    expect(indexHtml).toContain("addEventListener('flutter-first-frame'");
  });

  it('also dismisses by observing that Flutter actually rendered', () => {
    // Ground truth rather than an event: a view in the document cannot be
    // missed by attaching a listener a moment too late.
    expect(indexHtml).toContain('MutationObserver');
    expect(indexHtml).toMatch(/flutter-view|flt-glass-pane/);
  });

  it('has a backstop that gets out of the way of a painted app', () => {
    // The specific failure being guarded: both other paths stay silent, the app
    // is fine, and the overlay stays forever. A timed backstop that re-checks
    // whether Flutter rendered is what makes that state impossible.
    const safety = indexHtml.match(/safety\s*=\s*setTimeout\(([\s\S]*?)\}, \d+\);/);
    expect(safety, 'a named safety timeout should exist').not.toBeNull();
    expect(safety![1]).toContain('painted()');
    expect(safety![1]).toContain('dismiss()');
  });

  it('never blames the phone in text the user actually sees', () => {
    // The old stall message told people to update iOS. The app was working and
    // the overlay was the bug, so that blame was both wrong and expensive — it
    // is what sent several sessions chasing Safari versions.
    //
    // Scoped to the strings assigned to the hint, not the whole file: the
    // reasoning above is allowed to name the mistake it prevents.
    const shown = [...indexHtml.matchAll(/bootHint\.(?:textContent|innerHTML)\s*=\s*([\s\S]*?);/g)]
      .map((match) => match[1]);

    expect(shown.length, 'the hint should still say something').toBeGreaterThan(0);
    for (const message of shown) {
      expect(message).not.toMatch(/update iOS|unsupported|your (phone|device) /i);
    }
  });
});
