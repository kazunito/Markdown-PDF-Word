// Run after npm run compile. Exercises the actual Paged.js print layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildHtml } = require('../out/template');
const { parseMarkdown, renderBody } = require('../out/markdown');
const { resolveBrowserPath } = require('../out/browser');

(async () => {
  const harness = fs.readFileSync(path.join(__dirname, 'run-local.js'), 'utf8');
  const cfg = vm.runInNewContext(harness.slice(harness.indexOf('const cfg ='), harness.indexOf('/** SecretStorage')) + '\ncfg', { path, process, __dirname });
  cfg.cover.enabled = false;
  cfg.toc.enabled = false;
  const source = fs.readFileSync(path.join(__dirname, 'doc-table-widths.md'), 'utf8');
  const longTable = '\n\n### ページをまたぐ表\n\n| # | 説明 |\n|---|---|\n' +
    Array.from({ length: 90 }, (_, i) => `| ${i + 1} | ROW${String(i + 1).padStart(3, '0')} 支店ごとの接続を管理します。必要な接続を確保し、利用後に返却します。 |`).join('\n');
  process.env.PUPPETEER_EXECUTABLE_PATH = resolveBrowserPath('');
  const { default: Printer } = await import('pagedjs-cli');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  for (const format of ['A4', 'B5']) {
    for (const orientation of ['portrait', 'landscape']) {
      cfg.page = { ...cfg.page, format, orientation };
      const input = parseMarkdown('table-widths.md', source + longTable);
      const rendered = renderBody(input.markdown);
      const html = buildHtml(input, rendered.html, rendered.headings, cfg, '');
      const file = path.join(__dirname, 'out', `table-widths-${format}-${orientation}.html`);
      fs.writeFileSync(file, html);
      const printer = new Printer({ allowLocal: true, allowRemote: false, timeout: 120000 });
      try {
        const page = await printer.render(file);
        const metrics = await page.evaluate(() => {
          const tables = [...document.querySelectorAll('.pagedjs_page table')];
          const first = tables[0];
          const cells = [...first.rows[0].cells];
          return {
            ratio: cells[0].getBoundingClientRect().width / first.getBoundingClientRect().width,
            pages: document.querySelectorAll('.pagedjs_page').length,
            textOverflow: [...document.querySelectorAll('.pagedjs_page a, .pagedjs_page code')].filter(el => {
              const box = el.closest('.pagedjs_page_content').getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(el);
              return [...range.getClientRects()].some(r => r.right > box.right + 2 || r.left < box.left - 2);
            }).length,
            links: [...document.querySelectorAll('.pagedjs_page a')].map(a => [a.getAttribute('href'), a.textContent]),
            overflow: tables.filter(t => {
              const rect = t.getBoundingClientRect();
              const box = t.closest('.pagedjs_page_content').getBoundingClientRect();
              return rect.right > box.right + 2 || rect.left < box.left - 2 || t.scrollWidth > t.clientWidth + 2;
            }).length,
            rows: [...document.querySelectorAll('.pagedjs_page td')].map(t => t.textContent).filter(t => /^ROW\d{3}/.test(t)),
          };
        });
        assert(metrics.ratio < 0.15, 'Number column must be compact');
        assert.equal(metrics.textOverflow, 0, 'Links and identifiers must stay inside page width');
        assert.equal(metrics.links.length, 6, 'All URL links must survive pagination');
        for (const [href, label] of metrics.links) assert.equal(href, label, 'URL and link label must stay intact');
        assert.equal(metrics.overflow, 0, 'Tables must stay inside page width');
        assert.equal(metrics.rows.length, 90, 'Every long-table row must survive pagination exactly once');
        assert.equal(new Set(metrics.rows).size, 90);
        console.log(format, orientation, JSON.stringify({ ...metrics, links: metrics.links.length, rows: metrics.rows.length }));
        if (format === 'A4' && orientation === 'portrait') {
          await page.pdf({ path: path.join(__dirname, 'out', 'table-widths.pdf'), preferCSSPageSize: true, printBackground: true });
        }
      } finally {
        await printer.close();
      }
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
