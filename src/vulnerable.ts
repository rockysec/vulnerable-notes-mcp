import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { join } from 'node:path';
import { registerVulnerableTools } from './lib/vulnerable-tools.js';

// Deliberadamente vulnerable. NO usar como base de nada real.
// Sirve solo para reproducir tres fallas de MCP server con fines educativos.
// Versión corregida en ./fixed.ts. Versión HTTP en ./vulnerable-http.ts.
//
// Este entrypoint es stdio: local, sin red de por medio. Es el que
// corresponde para la Falla 1 (tool poisoning), porque esa falla se detecta
// leyendo `tools/list`, algo que cualquiera puede hacer contra un server
// propio antes de decidir si lo conecta a un agente.

const NOTES_DIR = join(import.meta.dirname, '..', 'notes');

function createServer(): McpServer {
  const server = new McpServer({ name: 'vulnerable-notes', version: '1.0.0' });
  registerVulnerableTools(server, NOTES_DIR);
  return server;
}

void serveStdio(createServer);
console.error('vulnerable-notes MCP server escuchando por stdio');
