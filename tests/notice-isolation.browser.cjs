const assert = require('node:assert/strict');
const { launch, fixture, ready } = require('./helpers/interaction-fixture.cjs');
// Fixed Hugo fixtures: 16 unmarked posts, one explicitly ordinary tagged post,
// 13 published notices, and one draft notice. The second build has notices only.
const source = process.env.BLOG_NOTICE_BUILD || 'local-only/notice-isolation-2026-10-09/build';
const onlySource = process.env.BLOG_NOTICE_ONLY_BUILD || 'local-only/notice-isolation-2026-10-09/only-build';
async function swapped(page, pathname) {
  await page.waitForFunction(path => location.pathname === path && !document.documentElement.classList.contains('songline-page-transitioning'), pathname);
  await page.evaluate(() => SonglinePageModules.ready(document));
}
(async () => {
  const browser = await launch();
  try {
    for (const width of [1440, 390]) {
      const f = await fixture(browser, source, { width, theme: width === 1440 ? 'light' : 'dark' });
      try {
        const { page } = f;
        await ready(page, f.origin, '/');
        assert.equal(await page.locator('a[aria-label="查看文章归档"] .songline-terminal-stat-value').innerText(), '17');
        const pool = JSON.parse(await page.locator('[data-home-recommendation-pool]').textContent());
        assert.equal(pool.length, 17);
        assert(!pool.some(post => post.url.includes('/notice')));
        assert.equal(await page.locator('[data-home-notice-latest]').getAttribute('href'), '/posts/notice-12/');
        await page.locator('a[aria-label="查看文章归档"]').click();
        await swapped(page, '/posts/');
        const records = page.locator('[data-archive-panel="articles"] [data-archive-record]');
        assert.equal(await records.count(), 17);
        assert.equal(await records.locator('.archive-record__detail--open[href*="/notice"]').count(), 0);
        assert.equal(await page.locator('[data-archive-search-term="notice-only-tag"]').count(), 0);
        assert.equal(await page.locator('[data-archive-search-term="site-notice"]').count(), 1, 'Ordinary tagged article remains searchable');
        assert.equal(await records.filter({ visible: true }).count(), 10);
        const pager = page.locator('[data-archive-pagination="articles"]');
        await pager.locator('[data-archive-page-step="1"]').click();
        assert.equal(await records.filter({ visible: true }).count(), 7);
        assert(await pager.locator('[data-archive-page-step="1"]').isDisabled());
        await page.reload();
        await page.evaluate(() => SonglinePageModules.ready(document));
        assert.equal(await records.count(), 17);
        assert.equal(await records.filter({ visible: true }).count(), 7);
        await page.locator('[data-archive-search-trigger]').click();
        const input = page.locator('[data-archive-search-input]');
        await input.fill('公告隔离词');
        await page.waitForFunction(() => !document.querySelector('#archiveArticles [data-archive-record]:not([hidden])'));
        assert(await page.locator('[data-archive-empty="articles"]').isVisible());
        await input.fill('标记为普通文章');
        await page.waitForFunction(() => document.querySelector('#archiveArticles [data-archive-record]:not([hidden])')?.dataset.title === '标记为普通文章');
        assert.equal(await records.filter({ visible: true }).count(), 1);
        await page.evaluate(() => SonglinePageTransition.navigateLink('/'));
        await page.locator('[data-home-notices] a[href="/tags/site-notice/"]').click();
        await swapped(page, '/tags/site-notice/');
        assert.equal(await page.locator('[data-archive-record]').count(), 13);
        assert.equal(await page.locator('[data-archive-pagination]').count(), 0);
        assert(!await page.locator('[data-notice-archive]').textContent().then(text => text.includes('草稿公告') || text.includes('标记为普通文章')));
        await page.locator('[data-archive-search-trigger]').click();
        await input.fill('公告隔离词');
        await page.waitForFunction(() => document.querySelectorAll('[data-archive-record]:not([hidden])').length === 12);
        const record = page.locator('[data-archive-record]:visible').first();
        await record.locator('[data-archive-trigger]').click();
        await record.locator('.archive-record__detail--open').click();
        await swapped(page, '/posts/notice-12/');
        assert.equal(await page.locator('.article-heading__eyebrow').innerText(), '站点公告');
        await page.goBack();
        await swapped(page, '/tags/site-notice/');
        assert.equal(await page.locator('[data-archive-record]').count(), 13);
        assert.deepEqual(f.errors, []);
        console.log(`PASS ${width}px: notice isolation, article counts/search/paging/reload, all notices/detail/history`);
      } finally { await f.close(); }
      const only = await fixture(browser, onlySource, { width });
      try {
        await ready(only.page, only.origin, '/');
        assert.equal(await only.page.locator('a[aria-label="查看文章归档"] .songline-terminal-stat-value').innerText(), '0');
        await only.page.locator('a[aria-label="查看文章归档"]').click();
        await swapped(only.page, '/posts/');
        assert.equal(await only.page.locator('[data-archive-panel="articles"] [data-archive-record]').count(), 0);
        assert(await only.page.getByText('还没有可归档的文章。').isVisible());
        assert(!await only.page.locator('[data-archive-pagination="articles"]').isVisible());
        await only.page.evaluate(() => SonglinePageTransition.navigateLink('/tags/site-notice/'));
        assert.equal(await only.page.locator('[data-archive-record]').count(), 13);
        assert.deepEqual(only.errors, []);
        console.log(`PASS ${width}px: notices-only site keeps article archive empty and notices accessible`);
      } finally { await only.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
