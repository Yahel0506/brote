import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './server/loader.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}

// El contenido se relee en cada petición: editas un JSON, recargas el navegador y listo.
let lastReportKey = '';
async function getContent() {
  const loaded = await loadContent(DATA_DIR);
  const key = JSON.stringify([loaded.report.errors, loaded.report.warnings]);
  if (key !== lastReportKey) {
    lastReportKey = key;
    const { errors, warnings, counts } = loaded.report;
    console.log(`\n[contenido] ${counts.questions} preguntas válidas${counts.excluded ? `, ${counts.excluded} excluidas` : ''}.`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    warnings.forEach((w) => console.log(`  · ${w}`));
  }
  return loaded;
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '');
  if (route === '/api/health') return sendJSON(res, 200, { ok: true });

  const { content, report } = await getContent();

  switch (route) {
    case '/api/content':
      return sendJSON(res, 200, { ...content, report });
    case '/api/meta':
      return sendJSON(res, 200, content.meta);
    case '/api/game':
      return sendJSON(res, 200, content.game);
    case '/api/endings':
      return sendJSON(res, 200, content.endings);
    case '/api/report':
      return sendJSON(res, 200, report);
    case '/api/questions': {
      const stage = url.searchParams.get('stage');
      const questions = stage ? content.questions.filter((q) => q.stage === stage) : content.questions;
      return sendJSON(res, 200, { questions });
    }
    default: {
      const m = route.match(/^\/api\/questions\/([^/]+)$/);
      if (m) {
        const q = content.questions.find((x) => x.id === decodeURIComponent(m[1]));
        return q ? sendJSON(res, 200, q) : sendJSON(res, 404, { error: 'Pregunta no encontrada' });
      }
      return sendJSON(res, 404, { error: 'Ruta no encontrada' });
    }
  }
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw Object.assign(new Error(), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    } else throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Error interno', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Brote listo en http://localhost:${PORT}`);
  console.log(`Leyendo contenido desde ${path.relative(ROOT, DATA_DIR) || '.'}/`);
  getContent().catch((e) => console.error(e));
});
