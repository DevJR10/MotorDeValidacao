#!/usr/bin/env node
// server.js
// -----------------------------------------------------------------------------
// Servidor estático simples, sem dependências externas (só módulos nativos do
// Node). Necessário para rodar a versão MODULAR (pasta js/, ES Modules) —
// se preferir não usar Node, use o arquivo único Validador-de-Dados-V2.html
// na raiz do projeto, que não precisa de servidor nenhum.
//
// Uso:
//   npm start       -> serve em modo normal
//   npm run dev     -> serve em modo dev (sem cache, log de cada requisição)
// -----------------------------------------------------------------------------

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DEV_MODE = process.argv.includes('--dev');
const DEFAULT_PORT = Number(process.env.PORT) || 5500;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', // essencial p/ ES Modules — MIME errado quebra o import
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(root, decoded));
  if (!target.startsWith(root)) return null; // bloqueia path traversal (../../)
  return target;
}

function send404(res, urlPath) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`404 - Arquivo não encontrado: ${urlPath}`);
}

function serve(req, res) {
  let filePath = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);
  if (!filePath) return send404(res, req.url);

  fs.stat(filePath, (err, stats) => {
    if (err) return send404(res, req.url);
    if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) return send404(res, req.url);

      const ext = path.extname(filePath).toLowerCase();
      const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
      if (DEV_MODE) headers['Cache-Control'] = 'no-store';

      res.writeHead(200, headers);
      res.end(content);

      if (DEV_MODE) console.log(`${new Date().toLocaleTimeString('pt-BR')}  ${req.method} ${req.url} -> 200`);
    });
  });
}

function start(port) {
  const server = http.createServer(serve);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Porta ${port} já está em uso, tentando ${port + 1}...`);
      start(port + 1);
    } else {
      console.error('Erro ao iniciar o servidor:', err.message);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log('');
    console.log(`  Validador de Dados V2 ${DEV_MODE ? '(modo dev)' : ''}`);
    console.log(`  Rodando em: http://localhost:${port}`);
    console.log('  Pressione Ctrl+C para parar.');
    console.log('');
  });
}

start(DEFAULT_PORT);
