#!/usr/bin/env node
/* =====================================================================
   MiniBlender MCP — conector que deixa o Claude controlar o MiniBlender.

   O que este servidor faz (uma porta só, padrão 8765):
     1. Serve o app (http://SEU-IP:8765) para abrir no celular/PC.
     2. Ponte WebSocket (/bridge) com o app aberto no navegador.
     3. Servidor MCP:
        - stdio  -> Claude Desktop e Claude Code (padrão)
        - HTTP   -> /mcp (Streamable HTTP) para claude.ai (conector
                    personalizado) via túnel HTTPS, com token.

   Uso:  node server.js [--port 8765] [--token SEGREDO] [--no-stdio]
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const PORT = Number(opt('port', process.env.MINIBLENDER_PORT || 8765));
// Token fixo por computador (~/.miniblender-mcp.json) para o endereço não mudar a cada execução.
function persistentToken() {
  const f = path.join(os.homedir(), '.miniblender-mcp.json');
  try { const t = JSON.parse(fs.readFileSync(f, 'utf8')).token; if (t) return t; } catch {}
  const t = crypto.randomBytes(9).toString('base64url');
  try { fs.writeFileSync(f, JSON.stringify({ token: t }, null, 1), { mode: 0o600 }); } catch {}
  return t;
}
const TOKEN = String(opt('token', process.env.MINIBLENDER_TOKEN || persistentToken()));
const USE_STDIO = !opt('no-stdio', false);
const CALL_TIMEOUT = 120000;
// Em modo stdio o stdout é do protocolo MCP: todo log vai para stderr.
const log = (...a) => console.error('[miniblender-mcp]', ...a);

/* ---------- Ferramentas: mesma fonte do app (js/tools.js) ---------- */
function loadTools() {
  const file = [path.join(APP_ROOT, 'js', 'tools.js'), path.join(here, 'tools.js')].find(f => fs.existsSync(f));
  if (!file) throw new Error('js/tools.js não encontrado');
  const sandbox = { globalThis: {} }; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox.MB_TOOLS;
}
const BASE_TOOLS = loadTools();
let pluginTools = []; // anunciadas pelo app (plugins instalados)
const STATUS_TOOL = { name: 'miniblender_status', description: 'Mostra se o app MiniBlender está conectado e o endereço para abrir no celular.', input_schema: { type: 'object', properties: {}, additionalProperties: false } };
const allTools = () => [STATUS_TOOL, ...BASE_TOOLS, ...pluginTools];

/* ---------- Ponte com o app ---------- */
const apps = new Set(); let lastApp = null; const pending = new Map();
function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(`http://${n.address}:${PORT}/?mcp=1&t=${TOKEN}`);
  return out.length ? out : [`http://localhost:${PORT}/?mcp=1&t=${TOKEN}`];
}
function callApp(name, input) {
  const ws = lastApp && lastApp.readyState === 1 ? lastApp : [...apps].find(a => a.readyState === 1);
  if (!ws) return Promise.resolve({ content: [{ type: 'text', text: 'O app MiniBlender não está conectado. Abra no celular ou PC: ' + lanUrls()[0] + ' (mesma rede Wi-Fi). Ou, no app, aba “Claude 🔌” › Conectar.' }], isError: true });
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const t = setTimeout(() => { pending.delete(id); resolve({ content: [{ type: 'text', text: 'Tempo esgotado esperando o app (' + name + ').' }], isError: true }); }, CALL_TIMEOUT);
    pending.set(id, msg => { clearTimeout(t); resolve(msg); });
    ws.send(JSON.stringify({ type: 'call', id, name, args: input || {} }));
  });
}
// Conteúdo do app -> formato MCP
const toMcp = blocks => (blocks || []).map(b => b.type === 'image' ? { type: 'image', data: b.data, mimeType: b.mediaType || 'image/jpeg' } : { type: 'text', text: String(b.text ?? '') });

/* ---------- Servidores MCP ---------- */
const mcpServers = new Set();
function makeMcp() {
  const m = new McpServer({ name: 'miniblender', version: '1.0.0' }, {
    capabilities: { tools: { listChanged: true } },
    instructions: 'Controla o MiniBlender Mobile (editor 3D tipo Blender no navegador/celular). Comece com get_scene; confira resultados com view_scene ou render. Unidades em metros, Y para cima, chão em y=0. O usuário pode desfazer tudo no app.'
  });
  m.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools().map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) }));
  m.server.setRequestHandler(CallToolRequestSchema, async req => {
    const { name, arguments: input } = req.params;
    if (name === 'miniblender_status') return { content: [{ type: 'text', text: JSON.stringify({ app_connected: [...apps].some(a => a.readyState === 1), open_on_phone: lanUrls(), mcp_http: `http://localhost:${PORT}/mcp?token=${TOKEN}` }, null, 1) }] };
    if (!allTools().some(t => t.name === name)) return { content: [{ type: 'text', text: 'Ferramenta desconhecida: ' + name }], isError: true };
    const r = await callApp(name, input);
    return { content: toMcp(r.content), isError: !!r.isError };
  });
  mcpServers.add(m);
  return m;
}
function notifyToolsChanged() { for (const m of mcpServers) m.server.sendToolListChanged().catch(() => {}); }

/* ---------- HTTP: app estático + /mcp + /bridge ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.md': 'text/plain; charset=utf-8' };
function tokenOk(req, url) { return url.searchParams.get('token') === TOKEN || url.searchParams.get('t') === TOKEN || req.headers.authorization === 'Bearer ' + TOKEN; }
async function readBody(req) { const chunks = []; for await (const c of req) chunks.push(c); const s = Buffer.concat(chunks).toString('utf8'); return s ? JSON.parse(s) : undefined; }

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/mcp') {
      if (!tokenOk(req, url)) { res.writeHead(401).end('token inválido'); return; }
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
      // Modo sem sessão: um servidor + transporte por requisição.
      const m = makeMcp();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); m.close(); mcpServers.delete(m); });
      await m.connect(transport);
      await transport.handleRequest(req, res, await readBody(req));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(APP_ROOT, '.' + rel);
    if (!file.startsWith(APP_ROOT + path.sep) || file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.git`)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('não encontrado'); return; }
    let data = fs.readFileSync(file);
    if (rel === '/index.html') data = Buffer.from(String(data).replace('<head>', '<head><script>window.MB_SERVED_BY_BRIDGE=1;window.MB_BRIDGE_TOKEN=' + JSON.stringify(tokenOk(req, url) ? TOKEN : '') + ';</script>'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(req.method === 'HEAD' ? undefined : data);
  } catch (err) { log('erro HTTP', err); if (!res.headersSent) res.writeHead(500).end(String(err.message)); }
});

const wss = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/bridge' || !tokenOk(req, url)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    apps.add(ws); lastApp = ws; log('app conectado (' + apps.size + ')');
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'result' && pending.has(m.id)) { pending.get(m.id)({ content: m.content, isError: m.isError }); pending.delete(m.id); }
      else if (m.type === 'hello') {
        const known = new Set(BASE_TOOLS.map(t => t.name));
        const extra = (m.tools || []).filter(t => t && t.name && !known.has(t.name) && t.name !== STATUS_TOOL.name);
        if (JSON.stringify(extra) !== JSON.stringify(pluginTools)) { pluginTools = extra; notifyToolsChanged(); }
        lastApp = ws;
      }
    });
    ws.on('close', () => { apps.delete(ws); if (lastApp === ws) lastApp = [...apps].pop() || null; log('app desconectado'); });
    const ping = setInterval(() => { if (ws.readyState === 1) ws.send('{"type":"ping"}'); else clearInterval(ping); }, 25000);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  log('');
  log('MiniBlender MCP pronto na porta ' + PORT);
  log('1) Abra o app (mesma rede Wi-Fi):');
  for (const u of lanUrls()) log('     ' + u);
  log('2) Claude Desktop / Claude Code: já conectado via stdio' + (USE_STDIO ? '' : ' (desativado com --no-stdio)'));
  log('3) claude.ai (conector personalizado): exponha a porta com um túnel HTTPS e use');
  log('     https://SEU-TUNEL/mcp?token=' + TOKEN);
  log('');
});
httpServer.on('error', err => { log('não consegui abrir a porta ' + PORT + ': ' + err.message + ' (use --port OUTRA)'); if (!USE_STDIO) process.exit(1); });

if (USE_STDIO) {
  const m = makeMcp();
  await m.connect(new StdioServerTransport());
}
