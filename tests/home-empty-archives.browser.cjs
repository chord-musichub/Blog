const assert = require('node:assert/strict');
const { launch, fixture, ready } = require('./helpers/interaction-fixture.cjs');
// Build with data/projects.json and data/memories.json both set to [], leaving seeds present.
const source = process.env.BLOG_EMPTY_ARCHIVES_BUILD || 'local-only/header-home-2026-10-09/empty-projects-build';
(async () => {
  const browser = await launch();
  try {
    for (const width of [1440, 390]) {
      const f = await fixture(browser, source, { width });
      try {
        await ready(f.page, f.origin, '/');
        const tile = f.page.locator('a[aria-label="查看项目归档"]');
        assert.equal(await tile.locator('.songline-terminal-stat-value').innerText(), '0');
        await tile.click();
        await f.page.waitForFunction(() => document.querySelector('[data-archive-mode="projects"]')?.getAttribute('aria-selected') === 'true');
        assert.equal(await f.page.locator('[data-archive-panel="projects"] .archive-record').count(), 0);
        assert(await f.page.getByText('尚未归档项目').isVisible());
        await f.page.evaluate(() => SonglinePageTransition.navigateLink('/friends/memories/'));
        assert.equal(await f.page.locator('[data-memory-card]').count(), 0);
        assert(await f.page.getByText('还没有回忆。').isVisible());
        assert.deepEqual(f.errors, []);
        console.log(`PASS ${width}px: explicit empty projects/memories stay empty despite build seeds`);
      } finally { await f.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
