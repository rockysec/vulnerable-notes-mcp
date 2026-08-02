import { McpServer } from '@modelcontextprotocol/server';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import * as z from 'zod/v4';

/**
 * Versión corregida de `registerVulnerableTools`. Comentarios marcan qué
 * cambió y por qué en cada fix. `notesDir` debe llegar ya resuelto a ruta
 * absoluta (los entrypoints usan `resolve`, no `join`, para armarlo).
 */
export function registerFixedTools(server: McpServer, notesDir: string): void {
  server.registerTool(
    'search_notes',
    {
      // Fix 1 (tool poisoning): la descripción es texto plano, sin bloques
      // que parezcan instrucciones del sistema. Un servidor honesto no
      // necesita disfrazar nada acá.
      description: 'Busca notas por palabra clave dentro de notes/.',
      inputSchema: z.object({
        query: z.string().min(1).max(100).describe('Palabra o patrón a buscar en las notas'),
      }),
    },
    async ({ query }) => {
      // Fix 2 (command injection): `execFile` no invoca una shell, así que
      // `query` llega a `grep` como un solo argumento posicional, nunca como
      // texto que el shell reinterprete. `;`, `$(...)` o `"` dejan de tener
      // efecto especial.
      return new Promise((resolve) => {
        execFile('grep', ['-ril', query, notesDir], (error, stdout, stderr) => {
          if (error && !stdout) {
            resolve({ content: [{ type: 'text', text: `Sin resultados. (${stderr})` }] });
            return;
          }
          resolve({ content: [{ type: 'text', text: stdout || 'Sin resultados.' }] });
        });
      });
    },
  );

  server.registerTool(
    'read_note',
    {
      description: 'Lee el contenido de una nota por su nombre de archivo, dentro de notes/.',
      inputSchema: z.object({
        path: z.string().describe('Nombre del archivo dentro de la carpeta notes/'),
      }),
    },
    async ({ path }) => {
      // Fix 3 (path traversal): se resuelve la ruta final a absoluta y se
      // verifica que siga dentro de notesDir antes de leer. `resolve`
      // colapsa cualquier `..`, así que la comparación de prefijo es
      // suficiente y no hay forma de escapar del directorio.
      const target = resolve(notesDir, path);
      if (target !== notesDir && !target.startsWith(notesDir + sep)) {
        return {
          content: [{ type: 'text', text: `Ruta fuera de notes/: ${path}` }],
          isError: true,
        };
      }
      try {
        const content = await readFile(target, 'utf8');
        return { content: [{ type: 'text', text: content }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `No se pudo leer ${path}: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
