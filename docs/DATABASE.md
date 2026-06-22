# Base de datos — Supabase PostgreSQL

Esquema de persistencia para el bot monolítico. El bot accede en **runtime** vía `@supabase/supabase-js` (PostgREST). **Prisma** en `prisma/` se usa **solo** para migraciones de schema.

> Participantes del torneo: fuente de verdad en **Google Sheets** (`tournaments.sheet_link`). La tabla `participants` es **cache opcional** sincronizada desde la sheet.

---

## Diagrama ER (simplificado)

```mermaid
erDiagram
  Guild ||--o{ Tournament : has
  Tournament ||--o{ Match : has
  Tournament ||--o{ MatchRoom : has
  Tournament ||--o{ Attendance : has
  Tournament ||--o{ Schedule : has
  Tournament ||--o{ Participant : caches
  Match ||--o| MatchRoom : may_have
  Match ||--o{ Attendance : has
  Match ||--o| Schedule : may_have
  Match ||--o{ BracketCorrection : has
  Schedule ||--o{ StaffAssignment : has
```

---

## Política de acceso (RLS)

| Actor | Acceso |
|---|---|
| Bot (servidor) | `SUPABASE_SERVICE_ROLE_KEY` — bypass RLS, solo en el proceso del bot |
| Clientes públicos | **No hay** — no existe front ni API pública en esta arquitectura |
| Anon key | **No usar** en el bot |

**Reglas:**

- La `service_role` key **nunca** se expone en logs, commits ni variables del cliente.
- Habilitar RLS en todas las tablas con política deny-all por defecto; el bot opera con service role.
- Documentar en deploy que solo un servicio (el bot) tiene la key.

---

## Tablas

### `guilds`

Configuración por servidor Discord (multi-tenant).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | Discord guild ID |
| `prefix` | `TEXT` | Prefijo de comandos (default `_`) |
| `admin_role_id` | `TEXT` | Rol admin del bot — `/settings *` |
| `challonge_mod_role_id` | `TEXT` | Rol moderación Challonge — `/staff config *` |
| `challonge_logs_channel_id` | `TEXT` | Logs de bracket/Challonge — `/settings *` |
| `transcript_logs_channel_id` | `TEXT` | Archivo de transcripts — `/settings *` |
| `closed_category_id` | `TEXT` | *(legacy, no expuesto en comandos)* |
| `schedule_channel_id` | `TEXT` | Anuncios de schedules — `/staff config *` |
| `results_channel_id` | `TEXT` | *(legacy, no expuesto en comandos)* |
| `bot_logs_channel_id` | `TEXT` | Logs del bot — `/settings *` |
| `thumbnail_channel_id` | `TEXT` | Thumbnails de schedules — `/settings *` |
| `staff_role_id` | `TEXT` | Staff general — `/staff config *` |
| `judge_role_id` | `TEXT` | Jueces |
| `recorder_role_id` | `TEXT` | Recorders |
| `t1_admin_role_id` | `TEXT` | Admin tier 1 |
| `t2_admin_role_id` | `TEXT` | Admin tier 2 |
| `best_staff_role_id` | `TEXT` | Reconocimiento staff |
| `server_helper_role_id` | `TEXT` | Helpers del servidor |
| `manager_role_id` | `TEXT` | Gestión de staff |
| `staff_chat_channel_id` | `TEXT` | Chat interno staff |
| `staff_announcement_channel_id` | `TEXT` | Anuncios staff |
| `staff_instructions_channel_id` | `TEXT` | Instrucciones staff |
| `staff_details_channel_id` | `TEXT` | Info/documentación staff |
| `event_rules_channel_id` | `TEXT` | Reglas del evento |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Notas:**

- Roles operativos (`staff`, `judge`, `recorder`), `challonge_mod_role_id` y `schedule_channel_id` viven en columnas staff — `/staff config *`.
- `closed_category_id` y `results_channel_id` permanecen en schema por compatibilidad; categoría cerrada y resultados se configuran por torneo en `tournaments`.
- Columnas nullable: permite configurar `/settings` y `/staff config` de forma independiente.

**Comandos:** `/settings setup|edit|show`, `/staff config set|edit|view`, multi-servidor global.

---

### `tournaments`

Configuración completa de un torneo en un servidor.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID interno |
| `guild_id` | `TEXT` FK → `guilds` | |
| `name` | `TEXT` | Nombre visible |
| `challonge_id` | `TEXT` | ID del torneo en Challonge |
| `challonge_key_encrypted` | `TEXT` | API key encriptada (nunca plaintext) |
| `sheet_link` | `TEXT` | URL Google Sheet de participantes |
| `admin_role_id` | `TEXT` | Discord role ID (organizer/admin) |
| `helper_role_id` | `TEXT` | Discord role ID |
| `attendance_channel_id` | `TEXT` | |
| `transcript_channel_id` | `TEXT` | |
| `rules_channel_id` | `TEXT` | |
| `deadline_channel_id` | `TEXT` | |
| `result_channel_id` | `TEXT` | Canal de resultados del torneo (**requerido** en `/tournament add`; nullable en DB para registros legacy) |
| `closed_ticket_category_id` | `TEXT` | |
| `close_ticket_category_2_id` | `TEXT` | Opcional — overflow |
| `ticket_open_category_1_id` | `TEXT` | |
| `ticket_open_category_2_id` | `TEXT` | |
| `ticket_open_category_3_id` | `TEXT` | Opcional |
| `ticket_open_category_4_id` | `TEXT` | Opcional |
| `auto_room_enabled` | `BOOLEAN` | Default `false` |
| `schedules_channel_id` | `TEXT` | Reservado — no usado en v1 de `/schedule create` (ver `result_channel_id`) |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Índices:** `guild_id`.

**Comandos:** `/tournament add|edit|delete|info|list`, `/auto_room *`, `/room *`, `/upload_score`.

**Límite de negocio:** máximo 4 torneos activos por `guild_id` (validar en servicio, no en DB).

---

### `matches`

Partidos sincronizados desde Challonge o creados al abrir tickets.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID interno |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `challonge_match_id` | `TEXT` | ID externo |
| `round` | `TEXT` | Ronda del bracket |
| `group` | `TEXT` | Grupo/fase para filtrado en `/room create` |
| `team1_name` | `TEXT` | |
| `team2_name` | `TEXT` | |
| `team1_score` | `INTEGER` | Nullable hasta resultado |
| `team2_score` | `INTEGER` | |
| `winner_side` | `INTEGER` | `1`, `2`, o null |
| `status` | `TEXT` | `pending`, `open`, `completed` — auto-room solo usa `open` |
| `ticket_channel_id` | `TEXT` | Canal Discord del ticket |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Índices:** `tournament_id`, `challonge_match_id`, `ticket_channel_id`.

**Comandos:** `/room create|available`, `/upload_score`, `/correct_bracket`, autocomplete de matches.

---

### `match_rooms`

Salas/tickets creados para partidos (tracking de auto-room y manual). **Un match solo puede tener una sala** (`UNIQUE` en `match_id`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `match_id` | `TEXT` FK → `matches` | **Único** — una fila por partido |
| `channel_id` | `TEXT` | Canal Discord creado |
| `category_id` | `TEXT` | Categoría donde se creó |
| `created_at` | `TIMESTAMPTZ` | |

**Índices:** `tournament_id`, `channel_id`, **`UNIQUE (match_id)`** — migración `20250618180000_match_rooms_unique_match_id`.

**Comandos:** `/auto_room *`, `/room create`.

**Concurrencia:** `createRoomsForMatches` serializa por `tournament_id` (`utils/tournament-room-lock.ts`) y revalida antes de insertar; violación `23505` se trata como sala ya existente.

---

### `attendance`

Registros de asistencia y trabajo del staff por partido/ticket.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `match_id` | `TEXT` FK → `matches` | Una asistencia activa por match (`deleted_at IS NULL`) |
| `ticket_channel_id` | `TEXT` | |
| `judge_discord_id` | `TEXT` | |
| `recorder_discord_id` | `TEXT` | |
| `team1_score` | `INTEGER` | |
| `team2_score` | `INTEGER` | Matches = `team1_score + team2_score` |
| `remark` | `TEXT` | Autocomplete `DW` = default win |
| `recording_links` | `JSONB` | Array de URLs YouTube (máx. 7) |
| `created_by_discord_user_id` | `TEXT` | Quien ejecutó `/attendance mark` |
| `ticket_message_id` | `TEXT` | Embed público en el ticket |
| `attendance_channel_message_id` | `TEXT` | Embed público en canal attendance |
| `deleted_at` | `TIMESTAMPTZ` | Soft delete (`/attendance delete`) |
| `deleted_reason` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Índices:** `tournament_id`, `match_id`, `judge_discord_id`, `recorder_discord_id`.

**Comandos:** Attendance completa, `/link *`, `/work_done`, `/get sheet`.

---

### `schedules`

Horarios publicados para partidos en tickets.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `match_id` | `TEXT` FK → `matches` | |
| `ticket_channel_id` | `TEXT` | |
| `scheduled_at` | `TIMESTAMPTZ` | UTC |
| `schedules_message_id` | `TEXT` | Mensaje en canal de schedules (`guilds.schedule_channel_id` vía `/staff config`) |
| `remark` | `TEXT` | Nota opcional del schedule (max 130 chars) |
| `created_by_discord_user_id` | `TEXT` | Usuario Discord que creó el schedule |
| `ticket_message_id` | `TEXT` | Embed en el ticket |
| `thumbnail_url` | `TEXT` | Opcional |
| `reminder_message_id` | `TEXT` | Mensaje de recordatorio T-10 en el ticket |
| `reminder_sent_at` | `TIMESTAMPTZ` | Cuándo se envió el recordatorio |
| `urgent_message_id` | `TEXT` | Post de urgencia en schedule channel |
| `urgent_sent_at` | `TIMESTAMPTZ` | Cuándo se procesó el check de asistencia |
| `assignment_buttons_expires_at` | `TIMESTAMPTZ` | Ventana activa de botones Judge/Recorder en el post del schedule channel (10 min; `/schedule refresh` renueva) |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Índices:** `tournament_id`, `match_id`, `ticket_channel_id`, `scheduled_at`.

**Comandos:** `/schedule create|delete|refresh|unassigned|resign|results|results_delete`.

---

### `schedule_results`

Resultados declarados para un schedule (embed en canal de resultados del torneo).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `schedule_id` | `TEXT` FK → `schedules` | **Único** — un resultado por schedule |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `match_id` | `TEXT` FK → `matches` | |
| `team1_score` | `INTEGER` | |
| `team2_score` | `INTEGER` | |
| `winner_side` | `INTEGER` | `1` o `2` |
| `notes` | `TEXT` | Notas opcionales del resultado |
| `proof_image_urls` | `TEXT[]` | URLs de capturas adjuntas en Discord |
| `results_message_id` | `TEXT` | Mensaje en `tournaments.result_channel_id` |
| `ticket_message_id` | `TEXT` | Mensaje en el ticket del partido |
| `result_channel_id` | `TEXT` | Canal donde se publicó |
| `declared_by_discord_user_id` | `TEXT` | Usuario que declaró el resultado |
| `declared_at` | `TIMESTAMPTZ` | Momento de la declaración |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Índices:** `UNIQUE (schedule_id)`, `tournament_id`, `match_id`.

**Comandos:** `/schedule results`, `/schedule results_delete`.

---

### `staff_assignments`

Asignaciones de Judge/Recorder a un schedule (soporta resign).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `schedule_id` | `TEXT` FK → `schedules` | |
| `role` | `TEXT` | `judge`, `recorder` |
| `discord_user_id` | `TEXT` | |
| `resigned_at` | `TIMESTAMPTZ` | Null si activo |
| `resign_reason` | `TEXT` | |
| `attendance_confirmed_at` | `TIMESTAMPTZ` | Confirmación de asistencia vía botón T-10 |
| `created_at` | `TIMESTAMPTZ` | |

**Índices:** `schedule_id`, `discord_user_id`.

**Comandos:** `/schedule create`, `/schedule resign`, `/schedule unassigned`.

---

### `bracket_corrections`

Auditoría de correcciones de score en bracket.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `match_id` | `TEXT` FK → `matches` | |
| `old_team1_score` | `INTEGER` | |
| `old_team2_score` | `INTEGER` | |
| `new_team1_score` | `INTEGER` | |
| `new_team2_score` | `INTEGER` | |
| `corrected_by_discord_id` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |

**Comandos:** `/correct_bracket`.

---

### `participants` (cache)

Snapshot de participantes leídos desde Google Sheets — **no** formulario web.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | CUID |
| `tournament_id` | `TEXT` FK → `tournaments` | |
| `team_name` | `TEXT` | |
| `discord_tag` | `TEXT` | |
| `discord_id` | `TEXT` | |
| `in_game_name` | `TEXT` | |
| `in_game_id` | `TEXT` | |
| `current_title` | `TEXT` | |
| `seed` | `INTEGER` | Opcional |
| `sheet_row_index` | `INTEGER` | Fila en la sheet |
| `source` | `TEXT` | Siempre `sheet` |
| `synced_at` | `TIMESTAMPTZ` | Última sincronización |

**Índices:** `tournament_id`, `discord_id`, `in_game_id`.

**Comandos:** `/team info`, `/team list`, `/assign_role` (validación cruzada con sheet + ban DB).

**Servicio:** `services/sheets.ts` — leer sheet en vivo; opcionalmente `syncParticipants()` escribe cache.

---

## Mapeo comando → persistencia

| Área | Tablas / servicio |
|---|---|
| Attendance | `attendance` |
| Tournament config | `tournaments`, `guilds` |
| Rooms / auto-room | `matches`, `match_rooms`, `tournaments` |
| Scores / bracket | `matches`, `bracket_corrections` + Challonge API |
| Schedules | `schedules`, `staff_assignments` |
| Teams / participants | Google Sheets + cache `participants` |
| Transcripts | **No en DB** — solo Discord |

---

## Prisma ↔ PostgREST

| Prisma model | Tabla PostgreSQL |
|---|---|
| `Guild` | `guilds` |
| `Tournament` | `tournaments` |
| `Match` | `matches` |
| `MatchRoom` | `match_rooms` |
| `Attendance` | `attendance` |
| `Schedule` | `schedules` |
| `StaffAssignment` | `staff_assignments` |
| `BracketCorrection` | `bracket_corrections` |
| `Participant` | `participants` |

Schema Prisma: [`../prisma/schema.prisma`](../prisma/schema.prisma).

---

## Datos sensibles

| Dato | Almacenamiento |
|---|---|
| Challonge API key | `tournaments.challonge_key_encrypted` — encriptar con `CHALLONGE_KEY_ENCRYPTION_SECRET` |
| Service role key | Solo `.env` del bot — nunca en DB |
| Google credentials | Solo `.env` o archivo local — nunca en DB |

---

## Migraciones

```bash
cd bot
cp ../prisma/.env.example ../prisma/.env   # configurar DATABASE_URL + DIRECT_URL
bun run db:push      # desarrollo
bun run db:migrate   # producción
```

**Migraciones recientes:**

| ID | Cambio |
|---|---|
| `20250618180000_match_rooms_unique_match_id` | `UNIQUE` en `match_rooms.match_id`; deduplica filas previas antes de aplicar |

Ver [`../README.md`](../README.md) para el flujo completo con Bun.
