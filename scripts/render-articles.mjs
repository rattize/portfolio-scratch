import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

// Publication workflow: add approved content/articles/<slug>.md and a catalog
// record {slug,title,date,summary}; run npm ci && npm run build; serve the
// entire directory under the chosen host prefix and verify its links/images.
// Removed slugs leave an orphan articles/<slug>/ directory: remove that exact
// generated directory explicitly, then rebuild. Never publish before checking
// source rights, profile/contact accuracy, artwork rights and the host base path.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'content/articles/catalog.json');
const output = path.join(root, 'articles');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = message => { throw new Error(message); };
const file = name => path.join(root, name);
const withinRoot = name => {
  const real = fs.realpathSync(name);
  return real.startsWith(`${root}${path.sep}`);
};
const hasFile = name => fs.existsSync(file(name)) && withinRoot(file(name)) && fs.statSync(file(name)).isFile();
const md = new MarkdownIt({ html: false, linkify: false });

// ~/ is a site-relative source convention: rewrite it relative to each published article.
// Ordinary relative URLs are interpreted from articles/<slug>/index.html, never the .md file.
function resolveUrl(url, page, image, pendingSlugs) {
  if (/^(https?:|mailto:)/i.test(url)) {
    if (image && /^mailto:/i.test(url)) fail(`Image cannot use mailto: ${url}`);
    return url;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('/') || url.includes('\\')) fail(`Unsafe URL: ${url}`);
  const [pathname, suffix = ''] = url.split(/(?=[?#])/, 2);
  if (!pathname && !image && suffix.startsWith('#')) return url;
  const sitePath = pathname.startsWith('~/') ? pathname.slice(2) : null;
  if (!pathname || /%(?:2e|2f|5c)/i.test(pathname) || pathname.split('/').includes('..')) fail(`Unsafe path: ${url}`);
  const target = path.posix.normalize(sitePath ?? path.posix.join(path.posix.dirname(page), pathname));
  if (target.startsWith('../') || target === '..' || !(hasFile(target) || !image && pendingSlugs.has(target))) fail(`Broken local URL: ${url} from ${page}`);
  return sitePath === null ? url : `${path.posix.relative(path.posix.dirname(page), target)}${suffix}`;
}
function checkTokens(tokens, page, pendingSlugs) {
  for (const token of tokens) {
    if (token.type === 'text') for (const match of token.content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) resolveUrl(match[1], page, match[0].startsWith('!'), pendingSlugs);
    if (token.attrs) for (const attr of token.attrs) {
      if (attr[0] === 'href' || attr[0] === 'src') attr[1] = resolveUrl(attr[1], page, attr[0] === 'src', pendingSlugs);
    }
    if (token.children) checkTokens(token.children, page, pendingSlugs);
  }
}
function page(title, body, prefix) {
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | ポートフォリオ</title><link rel="stylesheet" href="${prefix}assets/css/site.css"></head><body><a class="skip" href="#main">本文へ移動</a><header><nav aria-label="主要ナビゲーション"><a href="${prefix}index.html">ホーム</a><a href="${prefix}about.html">紹介</a><a href="${prefix}works/index.html">作品</a><a href="${prefix}articles/index.html">記事</a><a href="${prefix}contact.html">連絡</a></nav></header><main id="main">${body}</main></body></html>\n`;
}
export function build() {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!Array.isArray(catalog)) fail('Catalog must be an array');
  const seen = new Set();
  const pendingSlugs = new Set(catalog.filter(entry => entry && typeof entry.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)).map(entry => `articles/${entry.slug}/index.html`));
  const pending = new Map();
  const entries = [];
  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') fail('Invalid entry');
    const { slug, title, date, summary } = entry;
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ['index', 'assets'].includes(slug) || seen.has(slug)) fail(`Invalid or duplicate slug: ${slug}`);
    seen.add(slug);
    if (![title, summary].every(v => typeof v === 'string' && v.trim() && v.length <= 300) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail(`Invalid metadata: ${slug}`);
    const source = file(`content/articles/${slug}.md`);
    if (!hasFile(`content/articles/${slug}.md`)) fail(`Missing or unsafe article: ${slug}`);
    const tokens = md.parse(fs.readFileSync(source, 'utf8'), {});
    checkTokens(tokens, `articles/${slug}/index.html`, pendingSlugs);
    const html = md.renderer.render(tokens, md.options, {});
    pending.set(slug, page(title, `<article><h1>${escape(title)}</h1><p><time datetime="${escape(date)}">${escape(date)}</time></p>${html}</article>`, '../../'));
    entries.push(`<li><a href="${escape(slug)}/index.html">${escape(title)}</a> <time datetime="${escape(date)}">${escape(date)}</time><p>${escape(summary)}</p></li>`);
  }
  if (fs.lstatSync(output, { throwIfNoEntry: false }) && (fs.lstatSync(output).isSymbolicLink() || !fs.statSync(output).isDirectory())) fail('Article output must be a real directory');
  if (fs.existsSync(output)) for (const dirent of fs.readdirSync(output, { withFileTypes: true })) {
    if (dirent.isSymbolicLink()) fail(`Symlink in article output: ${dirent.name}`);
    if (dirent.isDirectory() && !seen.has(dirent.name)) fail(`Orphan article output: ${dirent.name}; remove it explicitly before rebuilding`);
    if (dirent.name !== 'index.html' && !dirent.isDirectory()) fail(`Unexpected article output: ${dirent.name}`);
  }
  fs.mkdirSync(output, { recursive: true });
  for (const [slug, html] of pending) {
    const dest = path.join(output, slug);
    if (fs.existsSync(dest) && (!fs.statSync(dest).isDirectory() || fs.lstatSync(dest).isSymbolicLink() || fs.readdirSync(dest).some(name => name !== 'index.html') || fs.existsSync(path.join(dest, 'index.html')) && fs.lstatSync(path.join(dest, 'index.html')).isSymbolicLink())) fail(`Unexpected contents in article output: ${slug}`);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'), html);
  }
  fs.writeFileSync(path.join(output, 'index.html'), page('記事', `<h1>記事</h1>${entries.length ? `<ul>${entries.join('')}</ul>` : '<p>公開許可済みの記事はまだありません。</p>'}`, '../'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
