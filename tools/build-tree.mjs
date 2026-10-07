#!/usr/bin/env node
// Compila arbol/ (TypeScript) a public/js/tree/arbol.js para el navegador.
// Uso: npm run build:tree   (el resultado ya viene incluido en el proyecto)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('npx', ['--yes', 'esbuild', 'arbol/mountArbol.ts', '--bundle', '--format=esm', '--target=es2020',
  '--outfile=public/js/tree/arbol.js', '--banner:js=/* Generado por tools/build-tree.mjs desde arbol/. No editar. */', '--log-level=warning'],
  { cwd: root, stdio: 'inherit' });
console.log('public/js/tree/arbol.js listo');
