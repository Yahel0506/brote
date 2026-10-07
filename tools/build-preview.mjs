#!/usr/bin/env node
// Genera un único HTML autocontenido (sin backend) con el contenido de /data incrustado.
// Uso: npm run preview:build   →   dist/brote-preview.html
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../server/loader.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('node', ['tools/build-tree.mjs'], { cwd: root, stdio: 'inherit' });
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist', 'brote-preview.html');
const { content, report } = await loadContent(path.join(root, 'data'));
if (report.errors.length) console.warn(`⚠ ${report.errors.length} errores de contenido (npm run validate).`);

const js = execFileSync('npx', ['--yes', 'esbuild', 'public/js/main.js', '--bundle', '--format=iife', '--minify', '--target=es2020'], { cwd: root, maxBuffer: 1 << 26 }).toString();
const css = readFileSync(path.join(root, 'public/css/styles.css'), 'utf8');
let html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
const safe = (t) => t.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const data = JSON.stringify({ meta: content.meta, game: content.game, questions: content.questions, endings: content.endings, flows: content.flows }).replace(/</g, '\\u003c');

html = html
  .replace('<link rel="stylesheet" href="/css/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/js/main.js"></script>', () => `<script>window.__BROTE_CONTENT__=${data};</script>\n<script>${safe(js)}</script>`)
  .replace('<meta name="theme-color"', '<meta name="color-scheme" content="light">\n  <meta name="theme-color"');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${path.relative(root, out)} · ${(html.length / 1024).toFixed(0)} KB`);
