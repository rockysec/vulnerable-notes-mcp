import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { resolve } from 'node:path';
import { registerFixedTools } from './lib/fixed-tools.js';

// Versión corregida de las tres fallas de ./vulnerable.ts, servida por
// stdio para confirmar el fix de la Falla 1 con el mismo transporte con el
// que se reprodujo. Contraparte HTTP en ./fixed-http.ts.

const NOTES_DIR = resolve(import.meta.dirname, '..', 'notes');

function createServer(): McpServer {
  const server = new McpServer({ name: 'vulnerable-notes-fixed', version: '1.0.0' });
  registerFixedTools(server, NOTES_DIR);
  return server;
}

void serveStdio(createServer);
console.error('vulnerable-notes-fixed MCP server escuchando por stdio');
