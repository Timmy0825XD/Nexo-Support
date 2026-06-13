# Índice de documentación

Mapa de archivos en `docs/`. Esta documentación describe la **arquitectura monolítica** del bot con Supabase directo.

| Archivo | Para qué sirve | Cuándo consultarlo |
|---|---|---|
| [`INDEX.md`](./INDEX.md) | Índice y mapa de documentación | Cuando no sepas qué archivo leer |
| [`CONTEXT.md`](./CONTEXT.md) | Arquitectura bot monolítico, alcance, stack Bun + Supabase, roadmap | Para entender el diseño del proyecto |
| [`AGENTS.md`](./AGENTS.md) | Reglas técnicas, convenciones, estructura de `bot/` | Antes de escribir código |
| [`DATABASE.md`](./DATABASE.md) | Tablas Supabase, ER, RLS, mapeo comando → tabla | Al tocar persistencia o Prisma schema |
| [`COMMANDS.md`](./COMMANDS.md) | Referencia de slash commands (spec completa) | Al implementar comandos |
| [`EMOJIS.md`](./EMOJIS.md) | Emojis personalizados del bot | Al diseñar embeds |
| [`GITFLOW.md`](./GITFLOW.md) | Git Flow y convenciones de ramas | Antes de commitear o abrir PR |
| [`../README.md`](../README.md) | Instalación Bun, env vars, migraciones, deploy | Para ejecutar el bot localmente |
