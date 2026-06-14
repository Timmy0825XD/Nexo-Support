# AGENTS.md — Instrucciones para construir el bot

Reglas para desarrollar el bot monolítico en `bot/`. Aplica a agentes de IA, colaboradores y cualquier persona que escriba código en este repositorio.

Para contexto funcional, consultar [`CONTEXT.md`](./CONTEXT.md). Para schema DB, [`DATABASE.md`](./DATABASE.md).

---

## Visión de la solución

| Componente | Carpeta | Rol |
|---|---|---|
| **Bot Discord** | `bot/` | Comandos, lógica de negocio, Supabase, integraciones |
| **Schema DB** | `prisma/` | Migraciones Prisma — **no importar en runtime del bot** |
| **Documentación** | `docs/` | Specs y convenciones |

**Regla de oro:** el bot accede a Supabase directamente con `service_role`. No hay API REST ni frontend en esta arquitectura.

---

## Stack tecnológico

| Área | Stack |
|---|---|
| Runtime / PM | **Bun** (`bun install`, `bun run dev`) |
| Lenguaje | TypeScript strict |
| Bot | discord.js v14 |
| DB runtime | `@supabase/supabase-js` |
| DB migrations | Prisma CLI (`prisma/schema.prisma`) |
| Validación | Zod |
| Participantes | Google Sheets API (`services/sheets.ts`) |
| Bracket | Challonge REST (`services/challonge.ts`) |

### Prisma — solo migraciones

- Schema en `prisma/schema.prisma`.
- El bot **nunca** importa `@prisma/client` en producción.
- Queries en runtime: `supabase.from('table').select()` etc.
- Scripts en `bot/package.json`: `db:push`, `db:migrate`, `db:generate`.

### Supabase — runtime

- Cliente singleton en `src/services/supabase.ts`.
- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Fail fast al iniciar si faltan env vars.

### discord.js — bot

- Auto-discovery de comandos vía `commands/loader.ts` (expandir al implementar).
- `interaction.deferReply()` cuando operación >3s (Sheets, Challonge, transcripts).
- Respuestas en **embeds** — inglés. Ver [`EMOJIS.md`](./EMOJIS.md).
- Emojis desde `src/constants/emojis.ts`.
- Helpers en `src/utils/embeds.ts`.
- Autocomplete en `src/autocomplete/` — listas buscables, no IDs manuales.
- Permisos: `setDefaultMemberPermissions(null)`; validar en `execute` con `guards/`.

### Patrón de código

```
command (thin) → service (business logic) → supabase / sheets / challonge
```

Opcional: `repositories/` si el mismo query se repite 3+ veces.

**Estructura por dominio en services:**

```
src/services/
├── supabase.ts
├── tournaments.ts
├── matches.ts
├── attendance.ts
├── schedules.ts
├── sheets.ts
├── challonge.ts
├── transcripts.ts
├── guild-logs.ts        # Audit embeds → bot_logs / challonge_logs channels
└── encryption.ts      # Challonge key encrypt/decrypt
```

---

## Política de idiomas

| Ámbito | Idioma |
|---|---|
| Bot (usuarios) | Inglés |
| Documentación `docs/` | Español |
| Código fuente | Inglés |
| Commits | Inglés, imperativo |

---

## Principios arquitectónicos

### 1. Un solo proceso

- Sin round-trip a API propia — bot → Supabase directo.
- Lógica de negocio en `services/`, no dispersa en comandos.
- Comandos delgados: parse input, llamar service, formatear embed.

### 2. Eficiencia

- Defer reply en operaciones lentas.
- Batch queries cuando sea posible (evitar N+1 en loops Discord).
- Cache opcional de participantes en `participants` tras sync de Sheet.

### 3. Mantenibilidad

- Un archivo por comando slash.
- Guards reutilizables en `guards/`.
- Zod schemas en `src/schemas/` para validar inputs de comandos.

### 4. Multi-servidor y multi-torneo

- Toda operación identifica `guildId` y `tournamentId`.
- Máximo 4 torneos activos por guild (validar en `tournaments.ts`).

### 5. Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` solo en servidor del bot.
- Challonge keys encriptadas — nunca plaintext en DB ni logs.
- Google credentials en env o archivo local — nunca en DB.

---

## Responsabilidades del bot

```
Responsable de:
  ✅ Slash + prefix commands
  ✅ Lógica de negocio y validaciones
  ✅ Persistencia vía Supabase
  ✅ Canales, roles, permisos Discord
  ✅ Tickets y transcripts HTML
  ✅ Challonge read/report
  ✅ Google Sheets read (participantes)
  ✅ Generación XLSX (/get sheet)

NO responsable de:
  ❌ Formulario web de registro
  ❌ API REST pública
  ❌ Crear/seeding bracket en Challonge
  ❌ Persistir transcripts en DB
```

---

## Jerarquía de permisos

Implementar en `guards/permissions.ts` — no duplicar por comando.

| Rol | Alcance |
|---|---|
| Organizer | Torneo asignado |
| Helper | Torneo asignado |
| Judge / Recorder | Su partido/ticket |
| Captain | Solo su ticket |

---

## Integraciones externas

### Challonge

- READ y REPORT desde `services/challonge.ts`.
- Keys desde DB desencriptadas solo en memoria durante la operación.

### Google Sheets

- `services/sheets.ts` — leer participantes por `sheet_link`.
- Validar headers al configurar torneo (`/tournament add`).

### Discord

- Gateway, channels, roles, transcripts.
- Transcripts: `services/transcripts.ts` — HTML, enviar a canal, no guardar en DB.

---

## Flujo de desarrollo

1. Leer `docs/INDEX.md` y el doc relevante.
2. Si la feature toca DB: actualizar `DATABASE.md` + `schema.prisma` + migrar.
3. Implementar service primero, luego comando.
4. No crear tests/docs extra no solicitados.

### Git

Ver [`GITFLOW.md`](./GITFLOW.md). Ramas de trabajo: `feature/<descripcion>`.

---

## Checklist antes de entregar código

### General

- [ ] Lógica en `services/`, comando delgado
- [ ] Bot no importa `@prisma/client` en runtime
- [ ] Zod schemas actualizados si cambió input
- [ ] Errores con contexto en logs; mensajes al usuario en inglés
- [ ] Sin secrets hardcodeados

### Bot

- [ ] Permisos verificados en `execute`
- [ ] `tournamentId` explícito en comandos de torneo
- [ ] Defer si operación puede tardar >3s
- [ ] Embeds + emojis desde constants
- [ ] Autocomplete para entidades (torneos, matches)

### Base de datos

- [ ] Schema Prisma alineado con `DATABASE.md`
- [ ] Migración aplicable con `bun run db:push` o `db:migrate`

---

## Referencia rápida

| Documento | Propósito |
|---|---|
| [`INDEX.md`](./INDEX.md) | Índice de documentación |
| [`CONTEXT.md`](./CONTEXT.md) | Arquitectura y roadmap |
| [`AGENTS.md`](./AGENTS.md) | Este archivo — reglas técnicas |
| [`COMMANDS.md`](./COMMANDS.md) | Spec de slash commands |
| [`DATABASE.md`](./DATABASE.md) | Tablas Supabase y RLS |
| [`EMOJIS.md`](./EMOJIS.md) | Emojis del bot |
| [`GITFLOW.md`](./GITFLOW.md) | Git Flow |
| [`../README.md`](../README.md) | Instalación Bun y deploy |
