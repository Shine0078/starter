import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const mobileWeb = join(__dirname, '..', '..', 'mobile', 'web');
const indexHtml = readFileSync(join(mobileWeb, 'index.html'), 'utf8');
const manifest = readFileSync(join(mobileWeb, 'manifest.json'), 'utf8');

describe('light-only web shell', () => {
  it('keeps the browser shell light regardless of device preference', () => {
    expect(indexHtml).toContain('background-color: #FFFFFF');
    expect(indexHtml).toContain('color: #17213A');
    expect(indexHtml).toContain('content="#FFFFFF"');
    expect(indexHtml).toContain('apple-mobile-web-app-status-bar-style" content="default"');
    expect(indexHtml).not.toContain('prefers-color-scheme');
    expect(indexHtml).not.toContain('black-translucent');
  });

  it('keeps installed app surfaces white', () => {
    expect(manifest).toContain('"background_color": "#FFFFFF"');
    expect(manifest).toContain('"theme_color": "#FFFFFF"');
    expect(manifest).not.toContain('#0B1220');
  });
});
