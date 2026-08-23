import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';

/**
 * Turns a built presentation into a single portable file. Readers get one
 * document they can open or send anywhere, and exporting never leaves build
 * output behind in the author's folder.
 */

const DATA_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
};

/** Folds a Vite build's scripts, styles, and binary assets into one HTML document. */
export function inlineStaticHtml(outDir: string, indexPath: string): string {
  const asset = (reference: string) => resolve(dirname(indexPath), reference.split(/[?#]/)[0]);
  const inside = (path: string) => !relative(outDir, path).startsWith('..');
  const dataUri = (path: string) => {
    const mime = DATA_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
  };
  const inlineCss = (css: string, from: string) => css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (whole, _quote: string, reference: string) => {
      if (/^(data:|https?:|#)/.test(reference)) return whole;
      const path = resolve(dirname(from), reference.split(/[?#]/)[0]);
      return existsSync(path) && inside(path) ? `url("${dataUri(path)}")` : whole;
    },
  );

  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || /^(https?:)?\/\//.test(href)) return tag;
    const path = asset(href);
    if (!existsSync(path) || !inside(path)) return tag;
    return `<style>${inlineCss(readFileSync(path, 'utf8'), path)}</style>`;
  });
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (tag, before: string, src: string, after: string) => {
    if (/^(https?:)?\/\//.test(src)) return tag;
    const path = asset(src);
    if (!existsSync(path) || !inside(path)) return tag;
    const isModule = /type=["']module["']/i.test(`${before}${after}`);
    const body = readFileSync(path, 'utf8').replace(/<\/script>/gi, '<\\/script>');
    return `<script${isModule ? ' type="module"' : ''}>${body}</script>`;
  });
  html = html.replace(/\b(src|href)=["'](\.\/[^"']+|assets\/[^"']+)["']/gi, (whole, attribute: string, reference: string) => {
    const path = asset(reference);
    if (!existsSync(path) || !inside(path) || !DATA_MIME[extname(path).toLowerCase()]) return whole;
    return `${attribute}="${dataUri(path)}"`;
  });
  return html;
}
