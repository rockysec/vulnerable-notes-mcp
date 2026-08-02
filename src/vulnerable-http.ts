import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { registerVulnerableTools } from './lib/vulnerable-tools.js';

// Mismo servidor vulnerable que ./vulnerable.ts, pero servido por HTTP en
// vez de stdio: es el que simula un MCP remoto de un tercero (el escenario
// de "auditar mcp.notion.com"), para practicar command injection y path
// traversal como se probarían contra una API real, con curl puro.
//
// El transporte de por sí no agrega ni quita vulnerabilidades: son los
// mismos bugs de ./lib/vulnerable-tools.ts. Lo único que cambia es que ahora
// hay una request de red real de por medio, en vez de un proceso hijo local.

const NOTES_DIR = join(import.meta.dirname, '..', 'notes');
const PORT = Number(process.env.PORT ?? 3939);

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'vulnerable-notes-http', version: '1.0.0' });
  registerVulnerableTools(server, NOTES_DIR);
  return server;
});

createServer((req, res) => void toNodeHandler(handler)(req, res)).listen(PORT, () => {
  console.log(`vulnerable-notes-http escuchando en http://127.0.0.1:${PORT}/mcp`);
});
