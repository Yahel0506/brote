#!/usr/bin/env node
// Uso: npm run validate   (o DATA_DIR=otra/carpeta npm run validate)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../server/loader.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const { content, report } = await loadContent(dataDir);

console.log(`Archivos: ${report.files.join(', ') || '(ninguno)'}`);
console.log(`Preguntas válidas: ${report.counts.questions}${report.counts.excluded ? ` · excluidas: ${report.counts.excluded}` : ''}`);
for (const s of content.game?.stages ?? []) {
  const n = content.questions.filter((q) => q.stage === s.id).length;
  console.log(`  ${(s.label ?? s.id).padEnd(16)} ${n}`);
}
if (report.errors.length) {
  console.log(`\nErrores (${report.errors.length}):`);
  report.errors.forEach((e) => console.log(`  ✗ ${e}`));
}
if (report.warnings.length) {
  console.log(`\nAdvertencias (${report.warnings.length}):`);
  report.warnings.forEach((w) => console.log(`  · ${w}`));
}
if (!report.errors.length) console.log('\nSin errores.');
process.exit(report.errors.length ? 1 : 0);
