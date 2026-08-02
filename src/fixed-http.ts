import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { registerFixedTools } from './lib/fixed-tools.js';

// Contraparte corregida de ./vulnerable-http.ts, para confirmar el fix de
// command injection y path traversal con los mismos requests HTTP.

const NOTES_DIR = resolve(import.meta.dirname, '..', 'notes');
const PORT = Number(process.env.PORT ?? 3940);

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'vulnerable-notes-http-fixed', version: '1.0.0' });
  registerFixedTools(server, NOTES_DIR);
  return server;
});

createServer((req, res) => void toNodeHandler(handler)(req, res)).listen(PORT, () => {
  console.log(`vulnerable-notes-http-fixed escuchando en http://127.0.0.1:${PORT}/mcp`);
});
