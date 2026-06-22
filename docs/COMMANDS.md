# Comandos del bot

Referencia de todos los slash commands del bot. Este documento se amplía durante el desarrollo.

> **Arquitectura:** bot monolítico (`bot/`) — fuente de verdad para implementación.  
> **Idioma del bot:** inglés (nombres, descripciones y respuestas en Discord).  
> **Idioma de las specs:** todo el contenido bajo cada `### /comando` (Description, Purpose, Options, Behavior, Validation, Success response, Notes, etc.) va en **inglés**. El texto explicativo entre secciones (intro, convención, notas) puede estar en español.  
> **Estado:** lista inicial — algunos comandos pueden cambiar antes de implementarse.

### Fuera de alcance

Esta spec **no incluye** registro web personalizado (`tournament registration open/close/validate`, URLs `REGISTER_BASE_URL` / `WEB_BASE_URL`). Participantes se gestionan vía **Google Sheets** (`sheet_link` en `/tournament add`).

### Mapeo rápido comando → persistencia

| Área | Tabla / servicio |
|---|---|
| Attendance, links, work | `attendance` ([`DATABASE.md`](./DATABASE.md)) |
| Tournament config | `tournaments`, `guilds` |
| Guild settings | `guilds` |
| Staff config | `guilds` |
| Audit logs (guild) | `guilds` → canales `bot_logs` / `challonge_logs` |
| Rooms / auto-room | `matches`, `match_rooms` |
| Scores / bracket fix | `matches`, `bracket_corrections` + Challonge API |
| Schedules | `schedules`, `staff_assignments`, `schedule_results` |
| Teams / participants | Google Sheets + cache opcional `participants` |
| Transcripts | Solo Discord — no DB |
| Role management | Discord API (no DB) |
| Server info / banlist | Discord API |
| Ticket close / reopen / delete | `matches`, `match_rooms`, `guilds.closed_category_id` |
| Staff recruit / fire | Discord roles + `guilds` (staff config) |
| Staff work | `attendance`, `matches`, `tournaments` |

### Sistema auto-room (resumen)

Flujo operativo implementado en `bot/src/services/auto-room.ts`, `match-rooms.ts`, `utils/auto-room-stage.ts`:

1. **`/tournament add`** registra el torneo; `auto_room_creation` solo habilita la *capacidad* — por defecto no crea salas hasta `/auto_room run`.
2. **`/auto_room run`** pone `auto_room_enabled = true`, sincroniza Challonge → `matches`, y crea tickets para partidos elegibles (hasta 25 en manual, 3 por tick del worker).
3. Mientras `auto_room_enabled` está activo, el **worker** (cada 60 s) y **`/upload_score`** disparan la misma lógica tras cada resultado.
4. Solo se crean salas para matches con **`status = open`** en Challonge (no `pending`, aunque ya tengan ambos nombres).
5. **Torneos de 2 etapas:** en etapa de grupos solo matches de grupo; al cerrar grupos no se crean salas `pending` fantasma; la etapa final requiere que Challonge abra esos matches y que auto-room siga habilitado (recomendado: **`/auto_room run`** al iniciar la etapa 2).
6. **Anti-duplicados:** mutex por torneo en `createRoomsForMatches`, re-chequeo de `match_rooms` / `ticket_channel_id`, y **`UNIQUE (match_id)`** en `match_rooms` (migración `20250618180000_match_rooms_unique_match_id`).

Detalle por comando: secciones [`/auto_room *`](#auto_room-run), [`/room create`](#room-create), [`/upload_score`](#upload_score).

---

## Índice rápido

| Comando | Categoría | Permisos |
|---|---|---|
| [`/attendance mark`](#attendance-mark) | Attendance | Staff |
| [`/attendance delete`](#attendance-delete) | Attendance | Staff |
| [`/get attendance`](#get-attendance) | Attendance | Staff |
| [`/get sheet`](#get-sheet) | Attendance | Organiser |
| [`/link add`](#link-add) | Attendance | Staff |
| [`/link delete`](#link-delete) | Attendance | Staff |
| [`/link missing`](#link-missing) | Attendance | Staff |
| [`/work_done`](#work_done) | Attendance | Staff |
| [`/assign_role`](#assign_role) | Tournament | Admin, Manage Roles |
| [`/auto_room run`](#auto_room-run) | Tournament | Organiser |
| [`/auto_room stop`](#auto_room-stop) | Tournament | Organiser |
| [`/auto_room toggle`](#auto_room-toggle) | Tournament | Organiser |
| [`/correct_bracket`](#correct_bracket) | Tournament | Organiser |
| [`/room create`](#room-create) | Tournament | Organiser |
| [`/room available`](#room-available) | Tournament | Staff / Organiser |
| [`/team info`](#team-info) | Tournament | Public / Staff |
| [`/team list`](#team-list) | Tournament | Admin, Organiser |
| [`/tournament add`](#tournament-add) | Tournament | Admin |
| [`/tournament delete`](#tournament-delete) | Tournament | Admin |
| [`/tournament edit`](#tournament-edit) | Tournament | Admin |
| [`/tournament info`](#tournament-info) | Tournament | Admin |
| [`/tournament list`](#tournament-list) | Tournament | Admin |
| [`/upload_score`](#upload_score) | Tournament | Admin, Organiser |
| [`/schedule create`](#schedule-create) | Schedule | Admin, Organiser, Helper |
| [`/schedule delete`](#schedule-delete) | Schedule | Helper |
| [`/schedule unassigned`](#schedule-unassigned) | Schedule | Staff |
| [`/schedule refresh`](#schedule-refresh) | Schedule | Staff |
| [`/schedule resign`](#schedule-resign) | Schedule | Assigned staff |
| [`/schedule results`](#schedule-results) | Schedule | Staff, captains, tournament staff |
| [`/schedule results_delete`](#schedule-results_delete) | Schedule | Tournament organizer, helper |
| [`/settings setup`](#settings-setup) | Settings | Admin |
| [`/settings edit`](#settings-edit) | Settings | Admin |
| [`/settings show`](#settings-show) | Settings | Admin |
| [`/staff config set`](#staff-config-set) | Staff | Admin |
| [`/staff config edit`](#staff-config-edit) | Staff | Admin |
| [`/staff config view`](#staff-config-view) | Staff | Admin |
| [`/staff fire`](#staff-fire) | Staff | Admin |
| [`/staff recruit`](#staff-recruit) | Staff | Admin |
| [`/staff work`](#staff-work) | Staff | Admin |
| [`/role user`](#role-user) | Role | Organiser |
| [`/role add all`](#role-add-all) | Role | Organiser |
| [`/role remove all`](#role-remove-all) | Role | Organiser |
| [`/role list`](#role-list) | Role | Organiser |
| [`/server info`](#server-info) | Server | Public |
| [`/server banlist`](#server-banlist) | Server | Organiser |
| [`/sheet headers`](#sheet-headers) | Sheet | Public |
| [`/sheet validate`](#sheet-validate) | Sheet | Admin |
| [`/ticket close`](#ticket-close) | Ticket | Organiser |
| [`/ticket reopen`](#ticket-reopen) | Ticket | Organiser |
| [`/ticket delete`](#ticket-delete) | Ticket | Organiser |
| [`/bot about`](#bot-about) | Bot | Public |
| [`/bot help`](#bot-help) | Bot | Public |

### Convención de documentación {#convencion-documentacion}

Cada comando incluye, según aplique, las mismas secciones en este orden:

| Sección | Contenido |
|---|---|
| **Description** | What the command does (English — matches Discord) |
| **Permissions** | Who can run it |
| **Purpose** | Why it exists and when to use it |
| **Prerequisite** | Prior requirements (e.g. setup before edit) |
| **Options** | Table: `Name` · `Type` · `Required` · `Description` |
| **Behavior** | What the bot does on execution |
| **Workflow** | Internal step-by-step flow |
| **Validation** | Input and permission rules |
| **Audit logging** | Log channel used (guild config write commands) |
| **Success response** | Embed or message shown to the user |
| **Database** | Tables and columns affected |
| **Features** | Related capabilities |
| **Notes** | Operational clarifications |

Guild configuration groups follow **setup/set** (full) → **edit** (partial) → **show/view** (read-only). All subsections under each command heading are written in English.

---

## Attendance

### `/attendance mark`

**Description:** Mark attendance for the current match ticket.

**Channel restriction:** Match ticket channels only.

**Permissions:** Staff with configured **Judge** or **Recorder** role (server admin and organiser may override).

**Options:**

| Name | Type | Required |
|---|---|---|
| judge | USER | Yes |
| recorder | USER | Yes |
| team1_score | INTEGER | Yes |
| team2_score | INTEGER | Yes |
| remark | STRING (Autocomplete) | No |
| link | STRING | No |

**Autocomplete — `remark`:** `DW` (default win / disqualification).

**Validation:**

- A **schedule** must exist for the match in this ticket.
- Current time must be **on or after** `schedules.scheduled_at`.
- No active attendance may already exist for the match.
- Optional `link` must be a valid **YouTube** URL (counts as link 1 of up to 7).
- Selected `judge` / `recorder` users must hold the configured Judge / Recorder roles.

**Behavior:**

- Creates one row in `attendance` linked to `tournament_id`, `match_id`, and `ticket_channel_id`.
- Posts the **same public embed** in the ticket channel and in `tournaments.attendance_channel_id`.
- Stores Discord message IDs for both embeds (`ticket_message_id`, `attendance_channel_message_id`) for later sync.

**Metrics rule:** 1 attendance = **1 round**; **matches** = `team1_score + team2_score`.

**Default win (`remark = DW`):** excluded from salary/work stats by default; organiser may include via `/staff work include_default_wins` or `/get sheet include_default_win_salary`.

---

### `/attendance delete`

**Description:** Delete attendance record for the current match ticket.

**Channel restriction:** Match ticket channels only.

**Permissions:** Attendance **creator** or **organiser** only.

**Options:**

| Name | Type | Required |
|---|---|---|
| confirm | BOOLEAN | Yes |
| reason | STRING | No |

**Behavior:**

- Soft-deletes the attendance row (`deleted_at`, optional `deleted_reason`).
- Updates both attendance embeds (ticket + attendance channel) to a deleted state.
- Reverts staff work counts for that record.
- No `/attendance edit` — corrections require delete + re-mark.

---

### `/get attendance`

**Description:** View attendance records for a user in a tournament.

**Permissions:** Staff (judge, recorder, main staff role, organiser, or admin).

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| user | USER | Yes |

**Response:** Match records, staff role, match score, recording link count. Pagination (5 per page).

**Database:** `attendance`, `tournaments`, `matches`.

---

### `/get sheet`

**Description:** Generate Excel report with attendance, work statistics, salary estimates, and tournament configuration.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| tournament_type | STRING (Choice) | Yes |
| include_default_win_salary | BOOLEAN | Yes |

**Choices — `tournament_type`:**

- 1v1/2v2/3v3 (Per Match)
- 4v4/5v5 (Per Game)

**Output:** XLSX workbook (ephemeral attachment).

**Sheets:** Attendance Records · Work Count · Salary Estimate · Tournament Info.

**Salary rates:**

| Format | Judge | Recorder | Dual (same person + link) |
|---|---|---|---|
| 1v1/2v2/3v3 (per event) | 450 gold | 450 gold | 575 gold |
| 4v4/5v5 (per game) | 325 gold | 325 gold | 425 gold |

**Link rules for pay:** Recorder salary requires ≥1 YouTube link. Dual-role salary requires ≥1 link; otherwise counts/pays as **Judge only**.

---

### `/link add`

**Description:** Add a recording link to an attendance record.

**Channel restriction:** Any channel.

**Permissions:** **Recorder assigned to that attendance** only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| match | STRING (Autocomplete) | Yes |
| link | STRING | Yes |

**Validation:**

- Match must have an active attendance record.
- Only the attendance `recorder_discord_id` may add links.
- URL must be **YouTube**; max **7** links per attendance.
- Updates both attendance embeds after success.

**Database:** `attendance.recording_links` (JSON array).

---

### `/link delete`

**Description:** Delete all recording links from an attendance record.

**Permissions:** Assigned recorder; organiser/admin may override.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| match | STRING (Autocomplete) | Yes |

**Behavior:** Removes all links at once, syncs embeds, audit log.

---

### `/link missing`

**Description:** View attendance records missing recording links.

**Permissions:** Staff.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | No |

**Behavior:**

- **Without `tournament`:** lists matches where the **invoker** is recorder and links are missing.
- **With `tournament`:** lists **all** matches in the tournament missing links, responsible recorder, and **days since attendance was marked**.

---

### `/work_done`

**Description:** View work statistics of a staff member in a tournament.

**Permissions:** Staff.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| user | USER | Yes |
| tournament_type | STRING (Choice) | Yes |

**Output:** Judge / Recorder / Judge & Recorder rounds and matches, default wins, missing links.

**Database:** `attendance`, `matches`.

---

### `/staff work`

**Description:** View staff work statistics for a tournament using attendance records.

**Permissions:** **Admin only** (server Administrator or configured admin role).

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| tournament | STRING (Autocomplete) | Yes | Tournament to generate statistics for |
| include_default_wins | BOOLEAN | No | Include attendance from default wins (default: `False`) |

**Behavior:**

- Loads active attendance from `attendance` joined with `matches`.
- When `include_default_wins = False`: excludes rows with `remark = DW`.
- Classifies each attendance into **Judges**, **Recorders**, or **Judge & Recorder**:
  - Different people → judge section + recorder section.
  - Same person + ≥1 YouTube link → **Judge & Recorder**.
  - Same person + **no link** → **Judges only** (dual pay downgraded).
- **Rounds** = count of attendances in that section; **matches** = sum of `team1_score + team2_score`.
- Reply: **three public embeds** (red / green / blue sections).
- If any link-related payment downgrades exist: **ephemeral `.txt`** attachment listing expected vs applied pay and discounts (admin-only visibility).

**Database:** `attendance`, `matches`, `tournaments`.

---

## Sheet utilities

### `/sheet headers`

**Description:** Show copy-paste header rows for tournament registration Google Sheets.

**Permissions:** Public.

**Options:**

| Name | Type | Required |
|---|---|---|
| format | STRING (Choice) | Yes |

**Choices — `format`:** `1vs1`, `2vs2`, `3vs3`, `4vs4`, `5vs5`, `all`.

**Behavior:** Returns an embed with the required column headers for the selected format. `all` posts one embed per format.

---

### `/sheet validate`

**Description:** Validate participant registration data on a Google Sheet **before** creating a tournament (`/tournament add`).

**Permissions:** Server Administrator or configured admin role.

**Options:**

| Name | Type | Required |
|---|---|---|
| sheet_link | STRING | Yes |

**Environment:** `BANNED_PLAYERS_SHEET_URL` — public Google Sheet listing banned in-game IDs (MW ban database).

**Validation checks:**

| # | Rule |
|---|---|
| 1 | In-game ID must not appear on the banned players sheet |
| 2 | Discord ID and in-game ID must be unique across the entire sheet |
| 3 | Discord account must be older than 2 months |
| 4 | Discord IDs (17–20 digit snowflakes) and in-game IDs (8–32 hex characters) must be valid |
| 5 | Participant must not have staff, judge, or recorder roles (`/staff config`) |
| 6 | Participant must be a member of the current server |
| 7 | Discord tag/username in the sheet must match the Discord ID |
| 8 | If the Discord ID is **missing or invalid**, resolve the user by tag when it belongs to exactly one server member (still flagged so the sheet can be corrected) |

**Behavior:**

1. Validates sheet layout and required headers (same as `/tournament add`).
2. Loads all participant rows and runs checks per player.
3. Replies **in channel** (public) with pass/fail embeds.
4. On failure: **paginated embeds** (summary + one section per issue category, `◀` / `▶` buttons, 2 min timeout) and attaches `sheet-validation-report.txt`.

**Dependencies:** Google Sheets (public read), guild member cache, `guilds` staff role IDs, `BANNED_PLAYERS_SHEET_URL`.

**Features:** Pre-tournament QA, duplicate detection, ban list cross-check, staff role guard, tag verification.

---

## Tournament management

### `/assign_role`

**Description:** Assign tournament roles to participants with MW ban-database verification.

**Permissions:** Admin, Manage Roles.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| header | STRING (Choice) | Yes |
| role | ROLE | Yes |
| banned_role | ROLE | No |

**Choices — `header`:**

- Captain Discord Tag
- Captain In-game name

**External dependencies:** MW Ban Database Google Sheet.

**Validation:**

- Detect banned game IDs
- Detect banned server users
- Validate Discord IDs
- Validate guild membership
- Prevent duplicate roles

**Reports:** Successfully added, invalid IDs, missing IDs, not in server, banned users, banned game IDs.

**Features:** Mass role assignment, ban verification pipeline, audit logging, dynamic column matching, error reporting.

---

### `/auto_room run`

**Description:** Enable automatic room creation for a tournament and immediately process open matches.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |

**Behavior:**

- Sets `tournaments.auto_room_enabled = true`
- Syncs matches from Challonge into `matches`
- Creates ticket channels for eligible open matches (up to **25** per manual run)
- Background worker continues processing (up to **3** rooms per minute per tournament)

**Eligibility rules:**

| Condition | Rule |
|---|---|
| Challonge match state | Must be **`open`** (not `pending` or `completed`) |
| Participants | Both team names must be real (not `TBD`, `Winner of`, etc.) |
| Existing room | No row in `match_rooms` and no `ticket_channel_id` on the match |
| Single-stage tournament | Challonge state `underway` or `awaiting_review` |
| Two-stage — group phase | Only matches labeled as group stage while `group_stages_underway` |
| Two-stage — after groups | Only elimination-stage matches (`Stage 2`, `Round N`, etc.) when main bracket is active |

**Two-stage note:** When the group stage ends, the bot does **not** create rooms for projected/`pending` bracket slots. Run `/auto_room run` again when the final bracket stage is started manually on Challonge.

**Validation:** Duplicate prevention (per-tournament lock, DB unique on `match_id`, pre-insert checks), category capacity (50 channels/category, overflow to `ticket_open_category_2`–`4`).

**Responses:** Rooms created embed, automation enabled with no pending rooms, or partial warnings/errors.

**Dependencies:** Tournament configuration, Challonge API, Google Sheet (captain lookup), ticket categories.

**Database:** `tournaments`, `matches`, `match_rooms`.

**Features:** Match synchronization, permission automation, welcome embed in ticket, audit log on creation.

---

### `/auto_room stop`

**Description:** Stop automatic room creation for a tournament.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |

**Behavior:**

- Disables automatic room creation
- Stops background bracket scanning
- Prevents future auto-created rooms

**Does NOT:** Close active rooms, delete channels, affect ongoing matches.

**Responses:** Automation stopped confirmation, already disabled warning.

**Database:** `tournaments` — field updated: `auto_room_enabled = false`.

**Features:** Automation control, queue preservation, manual room creation still supported, audit logging.

---

### `/auto_room toggle`

**Description:** Enable or disable automatic tournament room creation.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |

**Behavior:**

- Toggles automatic room creation state
- Enables or disables bracket room automation
- Updates tournament automation status

**Does NOT:** Delete active rooms, close channels, affect ongoing matches.

**Responses:** Enabled confirmation, disabled confirmation.

**Embed states:** Green = Enabled · Red = Disabled.

**Dependencies:** Tournament configuration, auto-room worker system.

**Database:** `tournaments` — field updated: `auto_room_enabled`.

**Features:** Automation control, queue preservation, manual room creation compatibility, status tracking, audit logging.

---

### `/correct_bracket`

**Description:** Correct incorrect scores uploaded to the tournament bracket.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| match | STRING (Autocomplete) | Yes |
| score1 | INTEGER | Yes |
| score2 | INTEGER | Yes |

**Behavior:**

- Fetches selected match
- Replaces incorrect bracket score
- Recalculates winner
- Updates bracket system

**Validation:** Match must exist, prevent invalid scores, prevent unsupported draws.

**Dependencies:** Tournament bracket API, attendance records.

**Database:** `matches`, `bracket_corrections`.

**Features:** Match autocomplete, score correction logging, bracket synchronization, winner recalculation.

---

### `/room create`

**Description:** Manually create tournament match rooms for open bracket matches.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| category | CHANNEL (Category) | Yes |
| limit | INTEGER (1–25) | Yes |
| group | STRING (Autocomplete) | No |

**Behavior:**

- Syncs matches from Challonge
- Lists open matches without rooms (same rules as auto-room: **`status = open`**, both participants ready)
- Creates up to `limit` ticket rooms in the selected category
- Uses the same creation pipeline as auto-room (shared lock + duplicate guards)

**Validation:** Ignore completed matches, skip matches that already have a room, respect category limits, require configured tournament.

**Responses:** Rooms created embed with created/skipped/warnings/errors.

**Dependencies:** Tournament configuration, match bracket system, ticket categories, Google Sheet for captain mentions.

**Database:** `tournaments`, `matches`, `match_rooms`.

**Features:** Optional group filter, manual room management, permission automation, match synchronization.

---

### `/room available`

**Description:** Show open tournament matches available for room creation.

**Permissions:** Staff / Organiser.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| group | STRING (Autocomplete) | No |

**Behavior:**

- Syncs matches from Challonge
- Lists matches that are **`open`**, have both participants, and have no ticket yet
- Optional filter by bracket group/stage label
- Paginated embed when the list is long; if empty, may show existing rooms vs pending placeholders

**Validation:** Ignore completed matches, ignore matches that already have rooms.

**Responses:** Available match list, or empty-state breakdown (existing rooms / pending bracket slots).

**Dependencies:** Tournament bracket system, match room tracking.

**Database:** `matches`, `match_rooms`.

**Features:** Queue inspection, group filtering, match synchronization, room availability tracking.

---

### `/team info`

**Description:** Get detailed information about a tournament participant/team.

**Permissions:** Public / Staff.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| user | USER | No* |
| gameid_username | STRING | No* |

*Requires either `user` OR `gameid_username`.

**Validation:** Tournament must exist, participant must exist in configured sheet.

**Behavior:** Searches participant registration data, matches using Discord ID or Game ID.

**Output:** Discord tag, Discord ID, in-game name, in-game ID, current title, match source.

**Dependencies:** Tournament participant sheet, tournament configuration panel.

**Database:** `tournaments`, `participants`.

**Features:** Discord lookup, game ID lookup, registration verification, participant analytics.

---

### `/team list`

**Description:** Display all tournament participant/team information in the current channel.

**Permissions:** Admin, Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| header | STRING (Choice) | Yes |

**Choices — `header`:**

- Captain Discord Tag
- Captain Discord ID
- Captain In-game name
- Captain In-game ID

**Behavior:** Loads participant data from configured tournament sheet, posts tournament summary embed and all participant/team information.

**Output:** Tournament summary, team/player embeds, seed information, Discord/Game IDs, current titles.

**Dependencies:** Tournament participant sheet, tournament configuration panel.

**Database:** `tournaments`, `participants`.

**Features:** Tournament summary, registration viewer, team analytics, seed tracking, public participant listing.

---

### `/tournament add`

**Description:** Add and configure a tournament inside the bot system.

**Permissions:** Admin only.

**Options:**

| Name | Type | Required |
|---|---|---|
| name | STRING | Yes |
| id | STRING | Yes |
| key | STRING | Yes |
| sheet_link | STRING | Yes |
| admin_role | ROLE | Yes |
| helper_role | ROLE | Yes |
| attendance_channel | CHANNEL | Yes |
| transcript_channel | CHANNEL | Yes |
| rules_channel | CHANNEL | Yes |
| deadline_channel | CHANNEL | Yes |
| result_channel | CHANNEL | Yes |
| closed_ticket_category | CATEGORY | Yes |
| ticket_open_category_1 | CATEGORY | Yes |
| ticket_open_category_2 | CATEGORY | Yes |
| auto_room_creation | BOOLEAN | Yes |
| close_ticket_category_2 | CATEGORY | No |
| ticket_open_category_3 | CATEGORY | No |
| ticket_open_category_4 | CATEGORY | No |

**Behavior:**

- Registers tournament configuration
- Validates Challonge credentials and Google Sheet headers
- Connects bracket API and stores encrypted key
- Configures ticket system channels and categories
- Sets initial `auto_room_enabled` from `auto_room_creation` (rooms are only created after `/auto_room run` if automation should stay off at add time, set `auto_room_creation` to `false`)

**Features:** Auto-room support, category overflow handling, transcript automation, attendance logging, results channel, bracket integration.

**Dependencies:** Challonge API, Google Sheets, Discord channel/category structure.

**Database:** `tournaments`.

---

### `/tournament delete`

**Description:** Delete a tournament configuration from the bot system.

**Permissions:** Admin only.

**Options:**

| Name | Type | Required |
|---|---|---|
| id | STRING (Autocomplete) | Yes |

**Behavior:**

- Removes tournament configuration
- Stops automation systems
- Clears tournament cache
- Removes autocomplete references

**Does NOT:** Delete Discord channels, delete transcripts, delete Google Sheets, delete external brackets.

**Validation:** Tournament must exist, prevent deletion during active matches.

**Dependencies:** Tournament database, automation workers.

**Database:** `tournaments`, `match_rooms`, `attendance_cache`.

**Features:** Tournament cleanup, automation shutdown, cache clearing, audit logging.

---

### `/tournament edit`

**Description:** Edit an existing tournament configuration inside the bot system.

**Permissions:** Admin only.

**Purpose:** Modify tournament settings, update channels/categories, update bracket API credentials, change automation settings, reconfigure ticket system, update staff roles.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| id | STRING (Autocomplete) | Yes | Tournament ID to edit |
| name | STRING | No | New tournament name |
| key | STRING | No | New Challonge API key |
| sheet_link | STRING | No | New Google Sheet link |
| admin_role | ROLE | No | New tournament admin role |
| helper_role | ROLE | No | New tournament helper role |
| attendance_channel | CHANNEL | No | New attendance channel |
| transcript_channel | CHANNEL | No | New transcript archive channel |
| rules_channel | CHANNEL | No | New tournament rules channel |
| deadline_channel | CHANNEL | No | New deadline/info channel |
| result_channel | CHANNEL | No | New tournament result channel |
| closed_ticket_category | CATEGORY | No | New primary closed ticket category |
| close_ticket_category_2 | CATEGORY | No | New fallback closed ticket category |
| ticket_open_category_1 | CATEGORY | No | New first ticket category |
| ticket_open_category_2 | CATEGORY | No | New second ticket category |
| ticket_open_category_3 | CATEGORY | No | New third ticket category |
| ticket_open_category_4 | CATEGORY | No | New fourth ticket category |
| auto_room_creation | BOOLEAN | No | Enable/disable automatic room creation |

**Behavior:**

- Loads the selected tournament configuration
- Updates **only** provided fields
- Keeps all untouched values unchanged
- Refreshes tournament cache/configuration
- Updates room automation settings instantly
- Applies category/channel changes immediately

**Partial update:** If only `helper_role` is provided, only the helper role changes — everything else remains untouched.

**Auto-room logic:** Changing `auto_room_creation` immediately affects the auto room worker, automatic room creation, and bracket monitoring. No restart required.

**Ticket category overflow:** Category 1 full → Category 2 → Category 3 → Category 4 (Discord limit: 50 channels per category).

**Validation:**

- Tournament must exist
- If key updated: validates Challonge API access
- If sheet updated: validates Google Sheet access and required headers
- Bot validates send message, manage channel, and category accessibility permissions

**Success response embed:**

| Field | Description |
|---|---|
| Title | Tournament Updated: `{Tournament Name}` |
| Description | Tournament updated successfully |
| ID | Tournament internal ID |
| Changes | Modified fields (recommended: `@OldRole → @NewRole`) |
| Timestamp | Update time |

**Internal workflow:**

```text
Select Tournament → Load Current Config → Apply Provided Changes
→ Validate New Values → Update Database → Refresh Automation → Send Success Embed
```

---

### `/tournament info`

**Description:** View the complete configuration and current setup of a tournament registered in the bot system.

**Permissions:** Admin only.

**Purpose:** View tournament configuration, verify channels/categories, check automation settings, review staff roles, validate bracket integration, inspect ticket system setup.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| tournament | STRING (Autocomplete) | Yes | Tournament registered in the bot |

**Behavior:**

- Loads the selected tournament configuration
- Fetches all saved tournament settings
- Displays complete tournament setup, automation state, channels/categories, staff roles, bracket/key references

**Workflow:**

```text
Select Tournament → Load Tournament Config → Fetch Database Information
→ Generate Tournament Embed → Display Current Configuration
```

---

### `/tournament list`

**Description:** Display all tournaments currently registered in the bot system for the server.

**Permissions:** Admin only (recommended) or staff access depending on server configuration.

**Purpose:** View all active tournaments, check tournament IDs, verify auto-room status, quickly inspect registered tournament configurations.

**Options:** None.

**Behavior:**

- Fetches all tournaments stored in the database
- Displays tournament names, internal IDs, auto-room automation status
- Sends an ephemeral summary embed

**Workflow:**

```text
Run Command → Fetch Tournament List → Load Tournament Configurations
→ Generate Tournament Summary → Display Tournament Embed
```

---

### `/upload_score`

**Description:** Upload match results from the **current ticket channel** to Challonge, finalize the ticket, archive transcript, and optionally trigger auto-room for the next matches.

**Permissions:** Tournament admin role, helper role, or guild manager (see `guards/tournament-permissions.ts`).

**Restrictions:** Must be run inside a match ticket channel linked to `matches.ticket_channel_id`.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| score1 | INTEGER | Yes | Team/Player 1 score |
| score2 | INTEGER | Yes | Team/Player 2 score |
| note | STRING | No | Optional match/result note |

**Behavior:**

- Resolves tournament and match from the ticket channel topic / DB
- Reports score to Challonge API
- Marks match `completed` in `matches`
- Renames and moves ticket to closed category
- Posts result embed and archives HTML transcript to `transcript_channel_id`
- If `auto_room_enabled` for the tournament, runs auto-room follow-up (same eligibility rules as `/auto_room run`, max 3 rooms)

**Workflow:**

```text
Run In Ticket → Validate Permissions → Report Challonge Score
→ Mark Match Completed → Close Ticket → Archive Transcript
→ [If auto_room_enabled] Sync & Create Next Open Rooms
```

**Database:** `matches`, `match_rooms`, `tournaments`, `bracket_corrections` (via `/correct_bracket` only).

**Features:** Winner detection from scores (ties rejected), Challonge logs, auto-room chain reaction.

## Schedule management

### `/schedule create`

**Description:** Create and publish an official tournament match schedule with automatic player notifications, generated thumbnails, schedule embeds, and staff assignments.

**Permissions:** Admins, Organisers, Helpers.

**Restrictions:**

- Match ticket channels only
- Bot denies usage outside match tickets
- Server must configure a **schedule channel** via `/staff config` before use

**Usage example:**

```bash
/schedule create hour:15 minute:0 day:21 month:5 year:2026
```

**Options:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| hour | INTEGER | Yes | Match hour (UTC) |
| minute | INTEGER | Yes | Match minute |
| day | INTEGER | Yes | Match day |
| month | INTEGER | Yes | Match month |
| year | INTEGER | Yes | Match year |
| judge | USER | No | Pre-assign a staff member with the Judge role |
| recorder | USER | No | Pre-assign a staff member with the Recorder role |
| remark | STRING | No | Optional note (max 130 characters) |

**Features:**

- Automatic UTC & local time conversion
- Auto-generated match thumbnail/banner
- Team/player mentions, judge/recorder assignment support
- Schedule embed creation and notification system
- Posts schedule embed to the **match ticket** and to the guild **schedule channel** (`/staff config`)
- Optional thumbnail/banner posted to the guild **thumbnail channel** (`/settings`)
- Renames match channel with `🔴` prefix after creation
- Supports cleanup via `/schedule delete`

**Channel rename:**

```text
Before: semi2_haideptrai9061_vs_souelkady
After:  🔴semi2_haideptrai9061_vs_souelkady
```

**Bot workflow:**

1. Staff uses `/schedule create`
2. Bot validates permissions and match ticket channel
3. Bot generates embed, thumbnail, UTC/local time (Sheet lookup for captains)
4. Bot posts embed to match ticket and schedule channel (staff lines empty if not yet assigned)
5. Bot renames channel with `🔴`
6. If `judge` and/or `recorder` were provided: assigns staff, posts assignment messages, **updates embed** with Judge/Recorder (after publish — avoids blocking the initial post on staff/Sheet work)
6. Bot notifies participants and staff

**Success response:**

> ✅ Match scheduled successfully.  
> 🖼️ Thumbnail generated automatically.  
> 🔴 Match channel marked as scheduled.  
> 🔔 Notifications sent successfully.

**Notes:** Only one active schedule per match ticket. Staff assignments can be updated later via assignment buttons.

---

### Staff reminder flow (automático)

**Description:** 10 minutes before `scheduled_at`, the bot posts a reminder in the **match ticket** with the same schedule data and **Confirmed** buttons for assigned Judge/Recorder. At match time, unconfirmed staff are removed from the ticket and an urgent replacement post is sent to the guild **schedule channel**.

**Timeline:**

| Time | Action |
|---|---|
| T-10 min | Reminder embed + confirm buttons in ticket (only if at least one staff is assigned) |
| T-10 → T-0 | Assigned staff click **Confirmed** for their role |
| T-0 (match time) | Unconfirmed staff removed; urgent ping + red embed + assign buttons in schedule channel |

**Urgent ping:** Only `@Judge` and/or `@Recorder` guild roles for roles still missing (unassigned or failed to confirm).

**Reschedule:** Changing `scheduled_at` via `/schedule update` resets reminder/urgent state and deletes prior reminder/urgent messages.

**Worker:** `bot/src/workers/schedule-reminder.ts` — 60s tick, same pattern as auto-room.

---

### `/schedule delete`

**Description:** Delete an existing scheduled match and remove all associated schedule data, embeds, notifications, and scheduled indicators.

**Permissions:** Helpers only.

**Restrictions:** Match ticket channels only. Requires manual confirmation.

**Usage example:**

```bash
/schedule delete confirm:True reason:Wrong match timing
```

**Options:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| confirm | BOOLEAN | Yes | Must be `True` to confirm deletion |
| reason | STRING | No | Reason for deleting the schedule |

**Confirmation:**

- `confirm = False` → deletion cancelled
- `confirm = True` → schedule permanently deleted

**Bot actions on confirm:**

- Deletes schedule entry and embeds (schedules channel + match ticket + reminder + urgent posts)
- Removes schedule notifications
- Removes `🔴` prefix from channel name
- Updates internal schedule records

**Channel rename:**

```text
Before: 🔴semi2_haideptrai9061_vs_souelkady
After:  semi2_haideptrai9061_vs_souelkady
```

**Success response:**

> ✅ Schedule deleted successfully.  
> 🗑️ Schedule embeds removed successfully.  
> 🔴 Match indicator removed successfully.

**Notes:** Deleted schedules cannot be recovered. Recommended to provide a reason for moderation logs.

---

### `/schedule unassigned`

**Description:** View all scheduled matches missing assigned staff (Judges or Recorders).

**Permissions:** Staff only.

**Usage examples:**

```bash
/schedule unassigned filter:all
/schedule unassigned filter:missing_judge
/schedule unassigned filter:missing_recorder
/schedule unassigned filter:any
```

**Options:**

| Parameter | Type | Description |
|---|---|---|
| filter | STRING | Filter by missing staff type |

**Filters:**

| Filter | Description |
|---|---|
| all | All unassigned matches |
| missing_judge | Matches missing Judge only |
| missing_recorder | Matches missing Recorder only |
| any | Matches missing either Judge or Recorder |

**Output:** Tournament name, match time, match channel, missing staff type, schedule post link. Pagination support.

**If all staffed:**

> ✅ All Matches Staffed — No pending matches are missing staff.

**If missing staff:**

> ⚠️ Unassigned Matches Found — Staff assignments are still pending.

---

### `/schedule refresh`

**Description:** Refresh schedule information, sync schedule buttons, and retrieve the latest schedule link for a scheduled match.

**Permissions:** Staff only.

**Restrictions:** Scheduled matches only. Match selected from dropdown menu.

**Dropdown example:**

```txt
haideptrai9061 vs Souelkady | The Brave Sailor Season 3 | 2026-05-21 15:00 UTC
```

**Features:**

- Refreshes schedule buttons and syncs schedule posts
- Provides latest schedule link
- Displays match name, tournament, local/UTC time, match ID
- Updates interaction components

**Bot workflow:**

1. Staff uses `/schedule refresh`
2. Bot displays scheduled matches dropdown
3. Staff selects target match
4. Bot refreshes buttons, status, links, components
5. Bot sends refreshed schedule embed

**Success response:**

> ♻️ Schedule Refreshed — Buttons have been refreshed and synced across schedule posts.

**Notes:** Does not modify match timings. Useful when schedule buttons stop responding.

---

### `/schedule resign`

**Description:** Resign from assigned staff role for a scheduled match directly from the match ticket.

**Permissions:** Assigned staff only.

**Restrictions:** Match ticket channels only. Staff must currently be assigned to the selected role.

**Options:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| role | STRING | No | Judge · Recorder · Both |
| reason | STRING | No | Reason for resignation (use `.` if private) |
| regenerate_image | BOOLEAN | No | Generate new thumbnail after resignation |

**Bot workflow:**

1. Staff uses `/schedule resign` in match ticket
2. Bot validates channel and assignment
3. Staff selects role to resign from
4. Bot removes assignments and updates schedule
5. Bot optionally regenerates thumbnail

**Success response:**

> ✅ Staff resignation completed successfully.  
> 🗑️ Selected role assignments removed.  
> 🖼️ Match thumbnail regenerated successfully. (if `regenerate_image = True`)

**Examples:**

```bash
/schedule resign role:Judge reason:Busy today
/schedule resign role:Recorder reason:Internet issues
/schedule resign role:Both reason:.
/schedule resign role:Judge regenerate_image:True
```

**Notes:** Resigning may cause the match to appear in `/schedule unassigned`.

---

### `/schedule results`

**Description:** Record match results for a scheduled ticket after the match time has passed. Posts a results embed with proof images to the tournament **results channel**.

**Channel:** Match ticket only.

**Permissions:** Server admin, organiser, tournament admin/helper, assigned Judge/Recorder, or team captains.

**Syntax:**

```
/schedule results team_1_score:0 team_2_score:3 notes:ggwp image1:<attachment>
```

| Option | Type | Required | Description |
|---|---|---|---|
| team_1_score | INTEGER | Yes | Team 1 score (0–99) |
| team_2_score | INTEGER | Yes | Team 2 score (0–99) |
| notes | STRING | No | Additional notes about the match (max 500) |
| image1–image10 | ATTACHMENT | No* | Screenshot proof of match result |

\* At least one proof image is required.

**Validation:**

- A schedule must exist for the ticket
- Current time must be **after** `scheduled_at`
- Scores cannot be tied
- Tournament must have `result_channel_id` configured
- Only one result per schedule

**Output:** Results embed + proof images posted to `#tournament-results`. Ephemeral confirmation in the ticket.

---

### `/schedule results_delete`

**Description:** Delete the declared result for the current scheduled match, including the message in the tournament results channel.

**Channel:** Match ticket only.

**Permissions:** Tournament organizer (admin role) or helper only. Server admin/organiser override.

**Syntax:**

```
/schedule results_delete confirm:True reason:Wrong score entered
```

| Option | Type | Required | Description |
|---|---|---|---|
| confirm | BOOLEAN | Yes | Must be `True` to confirm deletion |
| reason | STRING | No | Reason for deleting the result |

**Notes:** Does not modify the schedule itself. Use `/schedule delete` to remove the full schedule.

---

## Settings

Server-wide configuration (`guilds` table): bot admin role, log channels, transcript archive, and thumbnail publication. Does **not** replace per-tournament config in `tournaments` (`/tournament add|edit`).

| Command | Usage |
|---|---|
| `/settings setup` | **Initial full setup** — 5 required fields |
| `/settings edit` | **Partial update** — only provided fields |
| `/settings show` | View current configuration (read-only) |

**Field ownership (guild):**

| Area | Fields | Command |
|---|---|---|
| Admin and global logging | `admin_role`, `challonge_logs`, `transcript_logs`, `bot_logs`, `thumbnail_channel` | `/settings` |
| Staff and schedules | operational roles, `challonge_mod`, `schedule_channel`, staff channels | [`/staff config`](#staff-config-set) |

**Log channels:**

| Option | Bot usage |
|---|---|
| `bot_logs` | Bot events, config changes, moderation, tickets |
| `challonge_logs` | Bracket and Challonge actions |
| `transcript_logs` | Ticket transcript HTML files (not audit logs) |

Audit logs use structured **embeds** in English (`Triggered By`, `UTC Time`, event fields).

---

### `/settings setup`

**Description:** Configure all global bot settings required for logging, transcripts, thumbnails, and server-wide admin permissions.

**Permissions:** Admin only.

**Purpose:** Define the server-wide configuration on **first setup** — admin role, log channels, transcript archive, and thumbnail publication.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| admin_role | ROLE | Yes | Tournament organiser/admin role for bot commands |
| challonge_logs | CHANNEL | Yes | Channel where Challonge actions and bracket changes are logged |
| transcript_logs | CHANNEL | Yes | Channel used to archive ticket transcripts |
| bot_logs | CHANNEL | Yes | Channel used for bot events, errors, and moderation logs |
| thumbnail_channel | CHANNEL | Yes | Channel used to publish generated schedule thumbnails |

**Behavior:**

- Saves the **complete** settings configuration into the database
- Creates the guild row if it does not exist yet
- Overwrites all settings fields in a single operation; does **not** modify staff columns
- Validates all roles and channels belong to the current server
- Verifies bot channel permissions before saving
- Refreshes the internal configuration cache
- Applies changes immediately to dependent modules

**Workflow:**

```text
Run Command → Validate Permissions → Validate Roles → Validate Channels
→ Verify Bot Access → Save Configuration → Refresh Internal Cache
→ Apply Changes → Post Audit Log → Send Success Embed
```

**Validation:**

- All five options are required
- All roles must belong to the current server
- All channels must belong to the current server
- Bot must have: View Channel, Send Messages, Embed Links on log channels
- Bot must have: View Channel, Send Messages, Embed Links, Attach Files on `thumbnail_channel`

**Audit logging:** Posts a structured embed to `bot_logs` on success. Failures to send the log do not affect the command result.

**Success response:**

```text
✅ Bot settings updated successfully.

👑 Admin Role: @Organizer
📋 Challonge Logs: #logs-challonge
📜 Transcript Logs: #logs-server
🤖 Bot Logs: #tourney-master-bot-logs
🖼️ Thumbnail Channel: #thumbnail
```

**Database:** `guilds` — fields updated: `admin_role_id`, `challonge_logs_channel_id`, `transcript_logs_channel_id`, `bot_logs_channel_id`, `thumbnail_channel_id`.

**Features:** Centralized bot configuration, logging channel setup, transcript automation support, thumbnail publishing support, runtime configuration refresh, audit logging, multi-tournament compatibility.

**Notes:** Run once when onboarding a new server. For subsequent changes, use `/settings edit`.

---

### `/settings edit`

**Description:** Edit the existing bot configuration for the server without resetting unaffected settings.

**Permissions:** Admin only.

**Purpose:** Update specific settings fields **after initial setup** while preserving all other configured values.

**Prerequisite:** Server must be fully configured via `/settings setup`. If not, the bot directs the user to run setup first.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| admin_role | ROLE | No | Tournament organiser/admin role for bot commands |
| challonge_logs | CHANNEL | No | Channel where Challonge actions and bracket changes are logged |
| transcript_logs | CHANNEL | No | Channel used to archive ticket transcripts |
| bot_logs | CHANNEL | No | Channel used for bot events, errors, and moderation logs |
| thumbnail_channel | CHANNEL | No | Channel used to publish generated schedule thumbnails |

**Behavior:**

- Loads the current server configuration
- Updates **only** provided fields
- Leaves all unspecified settings unchanged; does **not** modify staff columns
- Validates provided roles and channels
- Verifies bot channel permissions before saving
- Refreshes the internal configuration cache
- Applies changes immediately to dependent modules

**Workflow:**

```text
Run Command → Validate Permissions → Load Current Settings
→ Validate Provided Values → Verify Bot Access → Save Configuration
→ Refresh Internal Cache → Apply Changes → Post Audit Log → Send Success Embed
```

**Validation:**

- At least one option must be provided
- All roles must belong to the current server
- All channels must belong to the current server
- Bot must have required permissions on each provided channel (same rules as setup)

**Audit logging:** Posts a structured embed to `bot_logs` listing modified fields. Failures to send the log do not affect the command result.

**Partial update examples:**

```bash
/settings edit bot_logs:#tourney-master-bot-logs
/settings edit thumbnail_channel:#thumbnail
```

**Success response:**

```text
✅ Settings Updated Successfully

Modified Settings:

🤖 Bot Logs
#tourney-master-bot-logs

🕒 Updated At:
2026-06-13 22:35 UTC
```

**Database:** `guilds` — fields potentially updated: same as `/settings setup`.

**Features:** Partial configuration updates, channel migration support, runtime configuration refresh, audit logging, validation system, zero-downtime configuration changes.

**Notes:** Prefer this command over re-running setup to avoid overwriting unrelated fields.

---

### `/settings show`

**Description:** Display the current global bot configuration for the server.

**Permissions:** Admin only.

**Purpose:** Verify settings completeness, troubleshoot configuration issues, and review active log channels without modifying any values.

**Options:** None.

**Behavior:**

- Loads the current server configuration from the database
- Retrieves all configured roles and channels
- Validates whether configured resources still exist in Discord
- Displays the configuration in a structured embed
- Highlights missing, deleted, or inaccessible resources
- Does not modify any settings

**Workflow:**

```text
Run Command → Validate Permissions → Load Guild Configuration
→ Fetch Roles → Fetch Channels → Validate Resources
→ Generate Settings Embed → Display Current Configuration
```

**Information displayed:**

| Section | Fields |
|---|---|
| Roles | Admin |
| Logging channels | Challonge logs, Transcript logs, Bot logs |
| Publication | Thumbnail channel |

**Example output:**

```text
⚙️ Current Bot Settings

👑 Admin Role
@Organizer

📋 Challonge Logs
#logs-challonge

📜 Transcript Logs
#logs-server

🤖 Bot Logs Channel
#tourney-master-bot-logs

🖼️ Thumbnail Channel
#thumbnail
```

**Validation display:**

- Deleted role → `❌ Deleted Role`
- Deleted channel → `❌ Deleted Channel`
- No configuration → `⚠️ No configuration found. Use /settings setup to configure the bot before using tournament commands.`

**Database:** `guilds` — fields read: same as `/settings setup`.

**Features:** Configuration overview, setup validation, missing resource detection, logging channel verification, read-only operation, troubleshooting support.

**Notes:** Staff roles and schedule channel are shown via `/staff config view`, not here.

---

## Staff

Staff hierarchy, operational roles, and internal channels (`guilds` table). Complements [`/settings`](#settings-setup) with tier roles, Challonge moderator, schedule channel, and staff communication channels.

| Command | Usage |
|---|---|
| `/staff config set` | **Initial full setup** — 15 required fields |
| `/staff config edit` | **Partial update** — only provided fields |
| `/staff config view` | View current staff configuration (read-only) |

> Requires `bot_logs` from `/settings setup` for staff change audit logs.

---

### `/staff config set`

**Description:** Configure all staff management roles and channels used by the bot for tournament administration, internal communication, staff coordination, announcements, and scheduling.

**Permissions:** Admin only.

**Purpose:** Define the staff hierarchy, operational roles, schedule channel, and communication channels on **first setup**.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| staff_role | ROLE | Yes | Main tournament staff role |
| judge_role | ROLE | Yes | Judge role used for match assignments |
| recorder_role | ROLE | Yes | Recorder role used for match recordings |
| t1_admin_role | ROLE | Yes | Tier 1 tournament administrator role |
| t2_admin_role | ROLE | Yes | Tier 2 tournament administrator role |
| best_staff_role | ROLE | Yes | Recognition role for outstanding staff members |
| server_helper_role | ROLE | Yes | General helper/support staff role |
| manager_role | ROLE | Yes | Staff management role |
| challonge_mod | ROLE | Yes | Staff role allowed to manage Challonge-related actions |
| schedule_channel | CHANNEL | Yes | Channel used for schedule announcements |
| staffchat_channel | CHANNEL | Yes | Main staff communication channel |
| staff_announcement_channel | CHANNEL | Yes | Staff announcements channel |
| staff_instructions_channel | CHANNEL | Yes | Staff instructions and guidelines channel |
| staff_details_channel | CHANNEL | Yes | Staff information and documentation channel |
| event_rules_channel | CHANNEL | Yes | Event rules and procedures channel |

**Behavior:**

- Saves the **complete** staff configuration into the database
- Creates the guild row if it does not exist yet
- Overwrites all staff fields in a single operation; does **not** modify settings columns
- Validates all roles and channels belong to the current server
- Verifies bot channel permissions before saving
- Refreshes the internal configuration cache
- Applies changes immediately to staff-related commands and guards

**Workflow:**

```text
Run Command → Validate Permissions → Validate Roles → Validate Channels
→ Verify Bot Access → Save Configuration → Refresh Internal Cache
→ Apply Changes → Post Audit Log → Send Success Embed
```

**Validation:**

- All fifteen options are required
- All roles must belong to the current server
- All channels must belong to the current server
- Bot must have: View Channel, Send Messages, Embed Links on all staff channels

**Audit logging:** Posts a structured embed to `bot_logs` (from `/settings setup`) on success. Failures to send the log do not affect the command result.

**Success response:**

```text
✅ Staff Configuration Updated Successfully

👑 Manager Role: @Organizer
⚙️ Staff Role: @Staff
⚖️ Judge Role: @Judge
🎥 Recorder Role: @Recorder
🏆 T1 Admin: @T1 Admin
🥈 T2 Admin: @T2 Admin
⭐ Best Staff: @Best Staff
🛠️ Server Helper: @Helper
🏆 Challonge Role: @Bracket Admin
📅 Schedule Channel: #calendario-schedules
💬 Staff Chat: #staff-chat
📢 Announcements: #staff-announcements
📖 Instructions: #staff-rules
📋 Details: #staff-info
📜 Event Rules: #rules
```

**Database:** `guilds` — fields updated: `staff_role_id`, `judge_role_id`, `recorder_role_id`, `t1_admin_role_id`, `t2_admin_role_id`, `best_staff_role_id`, `server_helper_role_id`, `manager_role_id`, `challonge_mod_role_id`, `schedule_channel_id`, `staff_chat_channel_id`, `staff_announcement_channel_id`, `staff_instructions_channel_id`, `staff_details_channel_id`, `event_rules_channel_id`.

**Features:** Centralized staff configuration, staff hierarchy management, schedule channel setup, internal communication setup, runtime configuration refresh, permission validation, audit logging, multi-tournament support.

**Notes:** Run once when onboarding staff configuration. For subsequent changes, use `/staff config edit`.

---

### `/staff config edit`

**Description:** Edit the existing staff configuration for the server without resetting unaffected settings.

**Permissions:** Admin only.

**Purpose:** Update specific staff roles or channels **after initial setup** while preserving all other configured values.

**Prerequisite:** Staff must be fully configured via `/staff config set`. If not, the bot directs the user to run set first.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| staff_role | ROLE | No | Main tournament staff role |
| judge_role | ROLE | No | Judge role used for match assignments |
| recorder_role | ROLE | No | Recorder role used for match recordings |
| t1_admin_role | ROLE | No | Tier 1 tournament administrator role |
| t2_admin_role | ROLE | No | Tier 2 tournament administrator role |
| best_staff_role | ROLE | No | Recognition role for outstanding staff members |
| server_helper_role | ROLE | No | General helper/support staff role |
| manager_role | ROLE | No | Staff management role |
| challonge_mod | ROLE | No | Staff role allowed to manage Challonge-related actions |
| schedule_channel | CHANNEL | No | Channel used for schedule announcements |
| staffchat_channel | CHANNEL | No | Main staff communication channel |
| staff_announcement_channel | CHANNEL | No | Staff announcements channel |
| staff_instructions_channel | CHANNEL | No | Staff instructions and guidelines channel |
| staff_details_channel | CHANNEL | No | Staff information and documentation channel |
| event_rules_channel | CHANNEL | No | Event rules and procedures channel |

**Behavior:**

- Loads the current staff configuration
- Updates **only** provided fields
- Leaves all unspecified settings unchanged; does **not** modify settings columns
- Validates provided roles and channels
- Verifies bot channel permissions before saving
- Refreshes the internal configuration cache
- Applies changes immediately to staff-related commands and guards

**Workflow:**

```text
Run Command → Validate Permissions → Load Current Settings
→ Validate Provided Values → Verify Bot Access → Save Configuration
→ Refresh Internal Cache → Apply Changes → Post Audit Log → Send Success Embed
```

**Validation:**

- At least one option must be provided
- All roles must belong to the current server
- All channels must belong to the current server
- Bot must have: View Channel, Send Messages, Embed Links on each provided channel

**Audit logging:** Posts a structured embed to `bot_logs` listing modified fields. Failures to send the log do not affect the command result.

**Partial update examples:**

```bash
/staff config edit judge_role:@Judge recorder_role:@Recorder
/staff config edit schedule_channel:#schedules
/staff config edit challonge_mod:@BracketAdmin
```

**Success response:**

```text
✅ Staff Configuration Updated Successfully

Modified Settings:

⚖️ Judge Role
@Judge

🕒 Updated At:
2026-06-13 22:35 UTC
```

**Database:** `guilds` — fields potentially updated: same as `/staff config set`.

**Features:** Partial configuration updates, dynamic role reassignment, channel migration support, runtime configuration refresh, audit logging, validation system, zero-downtime configuration changes.

**Notes:** Prefer this command over re-running set to avoid overwriting unrelated fields.

---

### `/staff config view`

**Description:** Display the current staff management configuration for the server.

**Permissions:** Admin only.

**Purpose:** Review and verify the staff setup without modifying any configuration.

**Options:** None.

**Behavior:**

- Loads the current staff configuration from the database
- Retrieves all configured roles and channels
- Validates whether configured resources still exist in Discord
- Displays the information in a structured embed
- Highlights missing, deleted, or inaccessible resources
- Does not modify any settings

**Workflow:**

```text
Run Command → Validate Permissions → Load Staff Configuration
→ Fetch Roles → Fetch Channels → Validate Resources
→ Generate Configuration Embed → Display Configuration
```

**Information displayed:**

| Section | Fields |
|---|---|
| Staff roles | Manager, Staff, Judge, Recorder, T1 Admin, T2 Admin, Best Staff, Server Helper, Challonge mod |
| Staff channels | Schedule, Staff Chat, Announcements, Instructions, Details, Event Rules |

**Example output:**

```text
🏅 Staff Configuration

👑 Manager Role
@Organizer

⚙️ Staff Role
@Staff

⚖️ Judge Role
@Judge

🎥 Recorder Role
@Recorder

🏆 T1 Admin
@T1 Admin

🥈 T2 Admin
@T2 Admin

⭐ Best Staff
@Best Staff

🛠️ Server Helper
@Helper

🏆 Challonge Role
@Bracket Admin

📅 Schedule Channel
#calendario-schedules

💬 Staff Chat
#staff-chat

📢 Announcements
#staff-announcements

📖 Instructions
#staff-rules

📋 Details
#staff-info

📜 Event Rules
#rules
```

**Validation display:**

- Deleted role → `❌ Deleted Role`
- Deleted channel → `❌ Deleted Channel`
- No configuration → `⚠️ No staff configuration found. Use /staff config set to configure the staff system.`

**Database:** `guilds` — fields read: same as `/staff config set`.

**Features:** Configuration overview, resource validation, missing role/channel detection, staff hierarchy inspection, read-only operation, troubleshooting support.

**Notes:** Global log channels and admin role are shown via `/settings show`, not here.

---

### `/staff fire`

**Description:** Remove one or more staff roles from a user based on the selected position.

**Permissions:** Administrator only.

**Restrictions:**

- Only users with Discord Administrator permission can use this command
- Target user must be a member of the server
- Staff roles must be configured using `/staff config set`
- Bot role must be higher than all removable staff roles

**Purpose:** Remove staff positions, demote staff members, remove helper access, remove tournament administration roles, remove all staff permissions from a user.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| user | USER | Yes | Staff member to modify |
| role | STRING (Choice) | Yes | Staff position to remove |

**Choices — `role`:**

| Choice | Roles removed |
|---|---|
| Judge | Judge role |
| Recorder | Recorder role |
| T1 Admin | T1 Admin role |
| T2 Admin | T2 Admin role |
| Best Staff | Best Staff role |
| Server Helper | Server Helper role |
| T1 Admin + Helper + Best Staff | T1 Admin, Server Helper, Best Staff roles |
| T2 Admin + Helper + Best Staff | T2 Admin, Server Helper, Best Staff roles |
| Complete | All configured staff roles (Staff, Judge, Recorder, T1/T2 Admin, Best Staff, Server Helper, Manager) |

**Behavior:**

- Loads staff configuration from `/staff config set`
- Resolves role IDs for the selected position
- Validates Discord role hierarchy (bot and executor)
- Removes corresponding role(s) from the target user
- Skips roles the user does not currently have

**Workflow:**

```text
Run Command → Validate Administrator → Load Staff Config
→ Resolve Position Roles → Validate Hierarchy → Remove Roles
→ Send Confirmation Embed
```

**Validation:**

- Staff configuration must exist
- Bot role must be above all target roles
- Discord hierarchy rules apply to every role removal

**Success response:**

```text
✅ Staff role removal processed successfully.

Staff Removal Updated

@User staff role removal processed.

Removed Position:
Recorder

Roles Removed:
Recorder Role
```

**Database:** None — Discord role changes only. Role IDs sourced from `guilds` staff columns.

**Features:** Staff demotion system, selective role removal, bulk staff role removal, complete staff removal option, role hierarchy validation.

**Notes:** The `Complete` option removes every configured staff role from the selected user. Intended for staff demotions, removals, and restructuring.

---

### `/staff recruit`

**Description:** Recruit a staff member by assigning a staff position and automatically sending a welcome message in the configured Staff Chat channel.

**Permissions:** Administrator only.

**Restrictions:**

- Only users with Discord Administrator permission can use this command
- Target user must be a member of the server
- Staff roles must be configured using `/staff config set`
- Bot role must be higher than all assignable staff roles
- Staff Chat channel should be configured for welcome messages

**Purpose:** Recruit new staff members, assign tournament positions, assign helper positions, assign administration positions, automatically onboard new staff members.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| user | USER | Yes | User to recruit |
| role | STRING (Choice) | Yes | Staff position to assign |

**Choices — `role`:**

| Choice | Roles assigned |
|---|---|
| Judge | Judge role, Staff role |
| Recorder | Recorder role, Staff role |
| T1 Admin | T1 Admin role, Server Helper role, Staff role |
| T2 Admin | T2 Admin role, Server Helper role, Staff role |
| Best Staff | Best Staff role |
| Server Helper | Server Helper role, Staff role |
| Manager | Manager role, Staff role |

**Behavior:**

- Assigns corresponding role(s) from staff configuration
- Detects and skips roles the user already has
- Posts a welcome message in `staffchat_channel` (from `/staff config set`)
- Welcome message includes assigned position and links to Announcements, Instructions, Details, and Event Rules channels

**Welcome message example:**

```text
Welcome @User!

You've been assigned as:
Recorder

Important Channels:

• Announcements: #staff-announcements
• Instructions: #staff-rules
• Details Submission: #staff-info
• Event Rules: #rules

We're excited to have you on board!
```

**Workflow:**

```text
Run Command → Validate Administrator → Load Staff Config
→ Resolve Position Roles → Validate Hierarchy → Assign Roles
→ Post Staff Chat Welcome → Send Confirmation Embed
```

**Validation:**

- Staff configuration must exist
- Bot role must be above all assignable roles
- Discord hierarchy rules apply

**Success response:**

```text
✅ Staff recruitment processed successfully.

Staff Recruitment Updated

@User recruitment roles processed.

Assigned Position:
Recorder

Roles Added:
Recorder Role

Notes:
Already had Staff Role
```

**Database:** None — Discord role changes only. Channel IDs sourced from `guilds` staff columns.

**Features:** Staff recruitment system, automatic role assignment, duplicate role detection, automatic onboarding message, Staff Chat integration.

**Notes:** Existing roles are automatically detected and skipped. Welcome message channel links are pulled from staff configuration.

---

### `/staff work`

**Description:** View staff work statistics for a tournament using attendance records collected through the attendance system.

**Permissions:** **Admin only** (server Administrator or configured admin role).

**Restrictions:**

- Tournament must exist
- Attendance data must be available
- Statistics are generated from attendance records
- Results depend on attendance submissions and validations

**Purpose:** Track staff activity, monitor Judge and Recorder performance, view staff workload distribution, evaluate staff contributions, support staff promotions and rewards.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| tournament | STRING (Autocomplete) | Yes | Tournament to generate statistics for |
| include_default_wins | BOOLEAN | No | Include attendance from default wins (default: `False`) |

**Behavior:**

- Loads attendance records for the selected tournament from `attendance`
- Joins match data for round grouping
- When `include_default_wins = False`: excludes rows with `remark = DW`
- When `include_default_wins = True`: counts every attendance entry
- Classifies each attendance: **Judges** / **Recorders** / **Judge & Recorder** (same person + link)
- Dual role **without** link → counted in **Judges** only; payment downgrade listed in ephemeral `.txt`
- **Rounds** = 1 per attendance in section; **matches** = `team1_score + team2_score`
- Reply: three public embeds (Judges · Recorders · Judge & Recorder)
- Ephemeral `.txt` with link payment discounts when applicable

**Workflow:**

```text
Run Command → Validate Admin → Load Attendance Records
→ Apply DW Filter → Classify Judge/Recorder/Dual → Aggregate Rounds/Matches
→ Build Three Embeds → Optional Ephemeral Discount TXT
```

**Output sections:**

| Section | Description |
|---|---|
| Judges | Staff who worked exclusively as Judges, or dual-role downgraded to judge (no link) |
| Recorders | Staff who worked exclusively as Recorders |
| Judge & Recorder | Same person on both roles **with** ≥1 YouTube link |

**Salary reference:**

| Format | Judge | Recorder | Dual (+ link) |
|---|---|---|---|
| 1v1/2v2/3v3 | 450 gold / event | 450 gold / event | 575 gold / event |
| 4v4/5v5 | 325 gold / game | 325 gold / game | 425 gold / game |

**Success response:**

> ✅ Staff work statistics generated successfully.

**Database:** `attendance`, `matches`, `tournaments`.

**Features:** Tournament-specific statistics, Judge/Recorder/dual tracking, link-based pay downgrade report, default win filtering.

**Notes:** Discount `.txt` is **ephemeral** and **only** sent from this command. Useful for staff evaluations, promotions, rewards, and payroll review.

---

## Role management

Discord role utilities for organisers. No database persistence — all changes apply directly via the Discord API.

> **Organiser role:** configured as `manager_role` via [`/staff config set`](#staff-config-set). Users with Discord Administrator permission may also run these commands.

---

### `/role user`

**Description:** Add or remove a role from a specific user. If the user already has the role, the role will be removed. If the user does not have the role, the role will be added.

**Permissions:** Organiser only.

**Restrictions:**

- Only users with the configured Organiser role can use this command
- Bot role must be higher than the target role
- User cannot manage roles equal to or higher than their highest role
- Bot cannot manage administrator-managed roles above its role position
- Target role must be assignable by the bot

**Purpose:** Assign server roles, remove server roles, manage tournament roles, manage staff roles, manage event roles, quickly update member permissions.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| target | USER | Yes | User to modify |
| role | ROLE | Yes | Role to add or remove |

**Usage example:**

```bash
/role user target:@User role:@Helper
```

**Behavior:**

- Validates Organiser permission and Discord role hierarchy
- Checks if the target user already has the selected role
- Adds the role if absent; removes the role if present (toggle)
- Sends a result message confirming the action

**Workflow:**

```text
Run Command → Validate Organiser → Validate Hierarchy
→ Check Current Role State → Add or Remove Role → Send Result
```

**Validation failure responses:**

- User hierarchy violation → `❌ You cannot manage roles higher than or equal to your highest role.`
- Bot hierarchy violation → `❌ I cannot manage this role because it is higher than or equal to my highest role.`

**Success responses:**

- Role added → `✅ Role **{Role Name}** has been added to **{Username}**.`
- Role removed → `✅ Role **{Role Name}** has been removed from **{Username}**.`

**Features:** Role assignment system, role removal system, automatic role toggle, Discord role hierarchy validation, Organiser-only protection.

**Notes:** Acts as a role toggle. Discord role hierarchy rules always apply. The bot's highest role must remain above all manageable roles.

---

### `/role add all`

**Description:** Add a selected role to all eligible members in the server.

**Permissions:** Organiser only.

**Restrictions:**

- Only users with the configured Organiser role can use this command
- Bot role must be higher than the target role
- Bot cannot assign roles higher than or equal to its highest role
- Discord role hierarchy rules apply
- Members who already have the role are skipped automatically

**Purpose:** Mass role assignments, tournament role distribution, event role distribution, community role management, server-wide role updates.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| role | ROLE | Yes | The role to add to all eligible members |

**Usage example:**

```bash
/role add all role:@English
```

**Behavior:**

- Validates Organiser permission and role hierarchy
- Scans all server members
- Skips members who already have the role
- Assigns the role to all eligible members
- Sends completion statistics

**Workflow:**

```text
Run Command → Validate Organiser → Validate Hierarchy
→ Fetch All Members → Skip Existing → Bulk Assign → Send Statistics
```

**Validation failure response:**

> ❌ I cannot assign this role because it is higher than or equal to my highest role.

**Success response:**

```text
✅ Role assignment completed.

Role: @English
Added To: 742 members
Skipped: 158 members (already had role)
```

**Features:** Server-wide role assignment, automatic duplicate checking, role hierarchy validation, Organiser-only protection, bulk member processing, progress tracking.

**Notes:** Large servers may take longer to process. Members who already have the role are automatically skipped.

---

### `/role remove all`

**Description:** Remove a selected role from all members who currently have that role.

**Permissions:** Organiser only.

**Restrictions:**

- Only users with the configured Organiser role can use this command
- Bot role must be higher than the target role
- Bot cannot remove roles higher than or equal to its highest role
- Discord role hierarchy rules apply
- Members who do not have the selected role are skipped automatically

**Purpose:** Mass role removal, event role cleanup, tournament role cleanup, community role management, server-wide role updates.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| role | ROLE | Yes | The role to remove from all members |

**Usage example:**

```bash
/role remove all role:@MW Tournament Support
```

**Behavior:**

- Validates Organiser permission and role hierarchy
- Scans all server members
- Skips members who do not have the role
- Removes the role from all eligible members
- Sends completion statistics

**Workflow:**

```text
Run Command → Validate Organiser → Validate Hierarchy
→ Fetch All Members → Filter Holders → Bulk Remove → Send Statistics
```

**Validation failure response:**

> ❌ I cannot remove this role because it is higher than or equal to my highest role.

**Success response:**

```text
✅ Role removal completed.

Role: @MW Tournament Support
Removed From: 125 members
Skipped: 875 members (did not have role)
```

**Features:** Server-wide role removal, automatic member filtering, role hierarchy validation, Organiser-only protection, bulk member processing, progress tracking.

**Notes:** This action cannot be undone automatically. Large servers may take longer to process.

---

### `/role list`

**Description:** View detailed information about a specific role, including member counts, human users, bot users, and member lists.

**Permissions:** Organiser only.

**Restrictions:**

- Only users with the configured Organiser role can use this command
- The selected role must exist in the server
- Large roles may generate a CSV file instead of displaying all members directly

**Purpose:** View role statistics, audit role membership, verify tournament staff assignments, export role member lists, review server role distribution.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| role | ROLE | Yes | The role to retrieve information about |

**Usage example:**

```bash
/role list role:@Server Head
```

**Behavior:**

- Validates Organiser permission
- Scans all members with the selected role
- Calculates total, human, and bot member counts
- Displays members inline in the embed when the list is small
- Generates and attaches a CSV file when the member list exceeds the embed limit

**Information displayed:**

| Field | Description |
|---|---|
| Role Name | Name of the selected role |
| Role ID | Discord snowflake ID |
| Total Members | All members with the role |
| Human Members | Non-bot members |
| Bot Members | Bot accounts |

**Small role example:**

```text
Role: Server Head

Total Members: 1
Human Members: 1
Bot Members: 0

Members:
Timmy (@timmy_2507)
```

**Large role behavior:**

- Generates CSV with columns: `Username`, `Display Name`, `User ID`, `Is Bot`
- Attaches CSV to the response
- Displays role statistics in the embed

**Success responses:**

- Inline display → `✅ Role information retrieved successfully.`
- CSV export → `✅ Role information retrieved successfully.` + `📄 Member list exported as CSV.`

**Features:** Role information display, member counting, human/bot separation, member list display, automatic CSV export for large roles, Organiser-only protection, role auditing support.

**Notes:** CSV files are generated automatically when the member list becomes too large to display. Member counts are calculated in real time.

---

## Server

Server information and moderation utilities. No database persistence — data retrieved from the Discord API.

---

### `/server info`

**Description:** Display detailed information and statistics about the current Discord server.

**Permissions:** Available to all users.

**Restrictions:**

- Command can only be used inside a server
- Cannot be used in Direct Messages (DMs)

**Purpose:** View server statistics, check member counts, view role statistics, view channel statistics, view emoji statistics, view boost information, view server creation information.

**Options:** None.

**Behavior:**

- Retrieves current server information from Discord
- Calculates member, role, channel, and emoji statistics in real time
- Retrieves boost information, owner information, creation date, and server assets
- Generates a structured information embed with server icon and banner (when available)

**Information displayed:**

| Section | Fields |
|---|---|
| Basic | Server name, Server ID, Server owner |
| Members | Total members, Human members, Bot members |
| Roles | Total roles |
| Channels | Text channels, Voice channels, Categories |
| Emojis | Total emojis, Animated emojis, Static emojis |
| Boosts | Boost level, Boost count, Boosters |
| Creation | Server creation date and timestamp |
| Visual | Server icon, Server banner (if available) |

**Example output:**

```text
Name: Liga Hispana
ID: 1036107463516237925
Owner: newvapety

Total: 4842 | Humans: 4814 | Bots: 28
Roles: 74
Text: 120 | Voice: 8 | Categories: 30
Emojis: 187 (39 animated, 148 static)
Boost Level: 2 | Boost Count: 9 | Boosters: 5
Created: Sun Oct 30 2022 04:41:09 GMT+0200
```

**Success response:**

> ✅ Server information retrieved successfully.

**Features:** Server information display, member statistics, role statistics, channel statistics, emoji statistics, boost statistics, server creation details, server icon and banner display.

**Notes:** Statistics are generated in real time. Member counts separate humans and bots. Useful for server administration, audits, and general information lookup.

---

### `/server banlist`

**Description:** View all banned users in the server and optionally export the ban list as an Excel spreadsheet.

**Permissions:** Organiser only.

**Restrictions:**

- Only users with the configured Organiser role can use this command
- Command can only be used inside a server
- Cannot be used in Direct Messages (DMs)
- Requires the bot to have permission to view bans

**Purpose:** Review banned users, audit server moderation actions, export ban records, verify ban information, generate ban reports.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| excel | BOOLEAN | No | Export ban list as an Excel file (default: `False`) |

**Usage examples:**

```bash
/server banlist
/server banlist excel:True
```

**Behavior:**

- Validates Organiser permission and ban viewing permission
- Retrieves all banned users from Discord in real time
- When `excel = False`: displays ban list directly in the channel (username and user ID)
- When `excel = True`: generates and uploads an `.xlsx` file with columns `Username` and `User ID`

**Inline display example:**

```text
Total banned users: 468

remixprime (285208032806174730)
xxxxxxxx6204 (361385003247992844)
lord438 (381826416230268940)
```

**Excel export response:**

```text
📊 Total banned users: 468
📄 Excel file generated successfully.
```

**Success responses:**

- Inline → `✅ Ban list retrieved successfully.`
- Excel → `✅ Ban list retrieved successfully.` + `📄 Excel file generated and uploaded successfully.`

**Features:** Total banned user count, username and ID listing, Excel export support, ban record auditing, Organiser-only protection, real-time ban retrieval.

**Notes:** Ban information is retrieved in real time from Discord. Useful for moderation audits, server management, and record keeping.

---

## Ticket management

Match ticket channel lifecycle commands. Tickets are private match channels linked via `matches.ticket_channel_id` and `match_rooms`.

> **Organiser role:** configured as `manager_role` via [`/staff config set`](#staff-config-set).

---

### `/ticket close`

**Description:** Close the current match ticket and prevent further conversation until it is reopened.

**Permissions:** Organiser only.

**Restrictions:**

- Command can only be used inside valid match ticket channels
- Bot automatically denies usage outside match tickets
- Only users with the configured Organiser role can use this command
- Ticket must currently be open

**Purpose:** Close completed match tickets, prevent further messages, mark tickets as inactive, prepare tickets for archiving or deletion.

**Options:** None.

**Behavior:**

- Validates Organiser permission and match ticket channel context
- Moves the channel to `closed_category_id` (from guild settings) when configured
- Restricts messaging permissions for the ticket channel
- Updates internal ticket status

**Workflow:**

```text
Run Command → Validate Organiser → Validate Match Ticket Channel
→ Verify Open Status → Close Ticket → Update Status → Send Confirmation
```

**Success response:**

> ✅ Ticket closed successfully.

**Database:** `matches`, `match_rooms` — ticket status read. Channel move uses `guilds.closed_category_id`.

**Features:** Match ticket validation, Organiser-only protection, ticket status management, prevents accidental usage outside tickets.

**Notes:** Only works inside match ticket channels. Closed tickets can be reopened using `/ticket reopen`.

---

### `/ticket reopen`

**Description:** Reopen a previously closed match ticket and restore access to the channel.

**Permissions:** Organiser only.

**Restrictions:**

- Command can only be used inside valid match ticket channels
- Bot automatically denies usage outside match tickets
- Only users with the configured Organiser role can use this command
- Ticket must currently be closed

**Purpose:** Reopen closed tickets, resume match discussions, restore ticket access, continue match management.

**Options:** None.

**Behavior:**

- Validates Organiser permission and match ticket channel context
- Verifies the ticket is currently closed
- Restores channel access and messaging permissions
- Moves the channel back to its original open category when known

**Workflow:**

```text
Run Command → Validate Organiser → Validate Match Ticket Channel
→ Verify Closed Status → Reopen Ticket → Restore Access → Send Confirmation
```

**Success response:**

> ✅ Ticket reopened successfully.

**Database:** `matches`, `match_rooms` — original category from `match_rooms.category_id`.

**Features:** Match ticket validation, Organiser-only protection, ticket status restoration.

**Notes:** Only closed tickets can be reopened. Reopened tickets can be closed again using `/ticket close`.

---

### `/ticket delete`

**Description:** Permanently delete the current match ticket channel.

**Permissions:** Organiser only.

**Restrictions:**

- Command can only be used inside valid match ticket channels
- Bot automatically denies usage outside match tickets
- Only users with the configured Organiser role can use this command

**Purpose:** Remove completed match tickets, clean up unused ticket channels, maintain ticket category organization.

**Options:** None.

**Behavior:**

- Validates Organiser permission and match ticket channel context
- Deletes the ticket channel permanently
- Clears `matches.ticket_channel_id` and related `match_rooms` records
- Logs the action to `bot_logs` when configured

**Workflow:**

```text
Run Command → Validate Organiser → Validate Match Ticket Channel
→ Delete Channel → Clean Database Records → Log Action → Send Confirmation
```

**Success response:**

> ✅ Ticket deleted successfully.

**Database:** `matches` (`ticket_channel_id` cleared), `match_rooms` (record removed).

**Features:** Match ticket validation, Organiser-only protection, permanent ticket removal.

**Notes:** Deleted tickets cannot be recovered automatically. Use carefully.

---

## Bot

General bot information and command reference.

---

### `/bot about`

**Description:** Display detailed information, statistics, and runtime data about the bot.

**Permissions:** Available to all users.

**Restrictions:** Command can only be used inside a server.

**Purpose:** View bot information, view bot statistics, check uptime, check memory usage, view version information, verify bot status.

**Options:** None.

**Behavior:**

- Retrieves bot information and runtime statistics
- Calculates global server and member counts across all guilds
- Displays uptime since last bot start, memory usage, platform, Node.js version, and bot version
- Shows a dynamic server header using the current guild name

**Dynamic header example:**

```text
Created with 💖 for 『Liga Hispana』
```

**Information displayed:**

| Section | Fields |
|---|---|
| Bot | Name, ID, Creation date |
| Global | Total servers, Total members |
| Runtime | Uptime, Memory usage |
| System | Platform, Node.js version, Bot version |

**Example output:**

```text
Created with 💖 for 『Liga Hispana』

Name: Tourney Master
ID: 1408470636195483840
Created On: Fri Aug 22 2025

Servers: 45
Members: 103032

Uptime: 7d 11h 35m 24s
Memory Usage: 153.78 MB

Platform: Linux
Node: v24.16.0
Bot Version: 1.0.0
```

**Success response:**

> ✅ Bot information retrieved successfully.

**Features:** Bot information display, runtime statistics, server statistics, member statistics, uptime tracking, memory usage monitoring, platform information, version information.

**Notes:** Server count and member count are calculated globally. Uptime is calculated since the bot was last started. Memory usage is displayed in real time.

---

### `/bot help`

**Description:** Display a categorized list of all available commands supported by the bot, including command descriptions and permission requirements.

**Permissions:** Available to all users.

**Restrictions:** Command can only be used inside a server.

**Purpose:** Learn available commands, view command categories, check permission requirements, discover bot features, access quick command references.

**Options:** None.

**Behavior:**

- Loads all registered slash commands
- Groups commands into categories
- Displays permission requirements per command
- Generates one or more help embeds for browsing

**Command categories:**

| Category | Commands |
|---|---|
| 📋 Attendance | `/attendance mark`, `/attendance delete`, `/get attendance`, `/get sheet`, `/link add`, `/link delete`, `/link missing`, `/work_done` |
| 📅 Schedule | `/schedule create`, `/schedule delete`, `/schedule unassigned`, `/schedule refresh`, `/schedule resign`, `/schedule results`, `/schedule results_delete` |
| 🏆 Result | `/result declare`, `/result delete` |
| 👥 Role | `/role user`, `/role add all`, `/role remove all`, `/role list` |
| 🌐 Server | `/server info`, `/server banlist` |
| 🎫 Ticket | `/ticket close`, `/ticket reopen`, `/ticket delete` |
| ⚙️ Settings | `/settings setup`, `/settings edit`, `/settings show` |
| 👨‍💼 Staff | `/staff config set`, `/staff config edit`, `/staff config view`, `/staff recruit`, `/staff fire`, `/staff work` |
| 🤖 Bot | `/bot about`, `/bot help` |

**Permission indicators:**

- ⚠️ Staff only
- ⚠️ Organiser only
- ⚠️ Administrator only
- ⚠️ Judge only / Helper only (where applicable)

**Success response:**

> ✅ Command list generated successfully.

**Features:** Categorized command list, permission indicators, command descriptions, tournament management commands, staff management commands, ticket management commands, attendance management commands, server management commands.

**Notes:** Command availability depends on permissions and server configuration. Categories are automatically updated as new commands are added. Serves as the central documentation hub for all bot features.

---

## Notas generales

- Los comandos prefix (`[]command`) se documentarán en una fase posterior si aplican equivalentes a estos slash commands.
- Permisos como **Admin** se mapean al permiso Discord Administrator o al rol `admin_role` configurado en [`/settings setup`](#settings-setup).
- Permisos **Organiser** se mapean al rol `manager_role` configurado en [`/staff config set`](#staff-config-set), salvo que el comando indique lo contrario.
- Comandos de **Role**, **Server info** y **Server banlist** operan sobre la API de Discord; **Ticket** usa `matches` / `match_rooms` y la categoría cerrada del torneo (`tournaments.closed_ticket_category_id`).
- **Auto-room:** no crea salas para matches `pending` en Challonge; torneos de 2 etapas filtran por fase (`utils/auto-room-stage.ts`). Duplicados bloqueados por mutex + `UNIQUE` en `match_rooms.match_id`.
- **Staff fire** y **Staff recruit** requieren permiso Discord Administrator; **Staff work** lee `attendance` filtrado por torneo.
- Referencias a Google Sheets y MW Ban Database son dependencias externas a validar contra la API en el diseño final.
- Guild config commands (`/settings`, `/staff config`) follow the [documentation convention](#convencion-documentacion) and the setup/set → edit → show/view pattern. All command subsections are documented in English.
