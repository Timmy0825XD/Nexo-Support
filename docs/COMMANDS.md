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
| Schedules | `schedules`, `staff_assignments` |
| Teams / participants | Google Sheets + cache opcional `participants` |
| Transcripts | Solo Discord — no DB |

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
| [`/settings setup`](#settings-setup) | Settings | Admin |
| [`/settings edit`](#settings-edit) | Settings | Admin |
| [`/settings show`](#settings-show) | Settings | Admin |
| [`/staff config set`](#staff-config-set) | Staff | Admin |
| [`/staff config edit`](#staff-config-edit) | Staff | Admin |
| [`/staff config view`](#staff-config-view) | Staff | Admin |

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

**Permissions:** Staff.

**Options:**

| Name | Type | Required |
|---|---|---|
| judge | USER | Yes |
| recorder | USER | Yes |
| team1_score | INTEGER | Yes |
| team2_score | INTEGER | Yes |
| remark | STRING | No |
| link | STRING | No |

---

### `/attendance delete`

**Description:** Delete attendance record for the current match ticket.

**Channel restriction:** Match ticket channels only.

**Permissions:** Staff only.

**Options:**

| Name | Type | Required |
|---|---|---|
| confirm | BOOLEAN | Yes |
| reason | STRING | No |

**Behavior:**

- Deletes attendance entry
- Reverts staff work count
- Removes recording link
- Logs deletion action

---

### `/get attendance`

**Description:** View attendance records for a user in a tournament.

**Permissions:** Staff.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| user | USER | Yes |

**Response:** Match records, staff role, match score, recording link. Pagination support.

**Database:** `attendance`, `tournaments`.

**Features:** Pagination, attendance analytics, recording link tracking.

---

### `/get sheet`

**Description:** Generate Excel report with attendance, results, work statistics, and tournament configuration.

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

**Output:** XLSX workbook.

**Sheets:** Attendance Records · Work Count · Results · Tournament Info.

**Features:** Hyperlinks, proof links, staff analytics, tournament snapshot, result audit trail.

---

### `/link add`

**Description:** Add recording link to an attendance record.

**Permissions:** Staff only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| match | STRING (Autocomplete) | Yes |
| link | STRING | Yes |

**Validation:**

- Match must exist in attendance
- Only assigned judge/recorder can add link
- URL validation required

**Database:** `attendance`.

**Features:** Match autocomplete, staff authorization, recording tracking, audit logging.

---

### `/link delete`

**Description:** Delete recording link from an attendance record.

**Permissions:** Staff only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| match | STRING (Autocomplete) | Yes |

**Validation:**

- Match must contain recording link
- Only assigned judge/recorder can delete
- Organisers/Admins can override

**Database:** `attendance`.

**Features:** Match autocomplete, permission validation, audit logging, soft delete support.

---

### `/link missing`

**Description:** View attendance records missing recording links.

**Permissions:** Staff only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | No |

**Output:** Match list, assigned recorder, submission age, missing status.

**Validation:** Only shows attendance without recording links.

**Database:** `attendance`.

**Features:** Missing link tracking, staff monitoring, pagination, recorder accountability.

---

### `/work_done`

**Description:** View work statistics of a staff member in a tournament.

**Permissions:** Staff only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| user | USER | Yes |
| tournament_type | STRING (Choice) | Yes |

**Choices — `tournament_type`:**

- 1v1/2v2/3v3
- 4v4/5v5

**Output:** Judge work count, recorder work count, total matches, missing links, default wins.

**Database:** `attendance`.

**Features:** Staff analytics, work tracking, salary calculation support, tournament statistics.

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

**Description:** Manually trigger automatic tournament room creation.

**Permissions:** Organiser only.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |

**Behavior:**

- Reads tournament bracket
- Detects pending matches
- Checks available room slots
- Creates new match rooms automatically

**Validation:** Prevent duplicate rooms, ignore completed matches, respect room capacity, require tournament configuration.

**Responses:** Rooms created, queued matches, no new rooms available.

**Dependencies:** Tournament configuration, match category settings, bracket/Challonge data.

**Database:** `tournaments`, `match_rooms`.

**Features:** Automated room allocation, queue system, match synchronization, permission automation.

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
| group | STRING (Autocomplete) | Yes |
| limit | INTEGER | Yes |

**Behavior:**

- Reads open matches from bracket
- Filters matches by selected group
- Creates ticket rooms in selected category
- Applies permissions automatically

**Validation:** Ignore completed matches, prevent duplicate rooms, require configured tournament, respect room limits.

**Responses:** Rooms created, no open matches, queue/full room warnings.

**Dependencies:** Tournament configuration, match bracket system, ticket categories.

**Database:** `tournaments`, `matches`, `match_rooms`.

**Features:** Group-based room creation, manual room management, permission automation, match synchronization.

---

### `/room available`

**Description:** Show open tournament matches available for room creation.

**Permissions:** Staff / Organiser.

**Options:**

| Name | Type | Required |
|---|---|---|
| tournament | STRING (Autocomplete) | Yes |
| group | STRING (Autocomplete) | Yes |

**Behavior:**

- Reads tournament bracket
- Detects open matches
- Filters matches without rooms
- Displays available room queue

**Validation:** Ignore completed matches, ignore already-created rooms, require valid group selection.

**Responses:** Available match list, queue count, no available rooms message.

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
| closed_ticket_category | CATEGORY | Yes |
| ticket_open_category_1 | CATEGORY | Yes |
| ticket_open_category_2 | CATEGORY | Yes |
| auto_room_creation | BOOLEAN | Yes |
| close_ticket_category_2 | CATEGORY | No |
| ticket_open_category_3 | CATEGORY | No |
| ticket_open_category_4 | CATEGORY | No |
| result_channel | CHANNEL | No |

**Behavior:**

- Registers tournament configuration
- Connects bracket API
- Configures ticket system
- Enables room automation
- Sets archive/transcript channels

**Features:** Auto-room support, category overflow handling, transcript automation, attendance logging, result synchronization, bracket integration.

**Dependencies:** Bracket API, Google Sheets, Discord channel/category structure.

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

**Description:** Upload match results directly to the Challonge bracket system, finalize the match, close the ticket, archive the room, and generate a transcript automatically.

**Permissions:** Admins, Organisers.

**Purpose:** Submit official match results, update Challonge bracket scores, automatically finalize match rooms, generate and archive transcripts, move completed tickets to closed categories, mark completed matches visually.

**Options:**

| Name | Type | Required | Description |
|---|---|---|---|
| tournament | STRING (Autocomplete) | Yes | Tournament registered in the bot |
| match | STRING (Autocomplete) | Yes | Match to upload score for |
| score1 | INTEGER | Yes | Team/Player 1 score |
| score2 | INTEGER | Yes | Team/Player 2 score |
| note | STRING | No | Optional match/result note |
| winner | STRING | No | Manual winner override if required |

**Behavior:**

- Updates the Challonge bracket
- Marks the match as completed
- Detects the match winner automatically
- Renames the ticket channel with ✅
- Closes the ticket channel
- Moves the ticket to the closed category
- Generates a transcript automatically
- Archives transcript in transcript channel
- Logs responsible staff member

**Workflow:**

```text
Run Command → Validate Tournament → Validate Match → Validate Scores
→ Update Challonge Bracket → Detect Winner → Rename Channel With ✅
→ Generate Match Result Embed → Close Match Ticket
→ Move Channel To Closed Category → Generate Transcript → Archive Transcript
```

---

## Schedule management

### `/schedule create`

**Description:** Create and publish an official tournament match schedule with automatic player notifications, generated thumbnails, schedule embeds, and staff assignments.

**Permissions:** Admins, Organisers, Helpers.

**Restrictions:**

- Match ticket channels only
- Bot denies usage outside match tickets
- Server must configure a schedules channel before use

**Usage example:**

```bash
/schedule create hour:15 minute:0 day:21 month:5 year:2026
```

**Options:**

| Parameter | Type | Description |
|---|---|---|
| hour | INTEGER | Match hour (UTC) |
| minute | INTEGER | Match minute |
| day | INTEGER | Match day |
| month | INTEGER | Match month |
| year | INTEGER | Match year |

**Features:**

- Automatic UTC & local time conversion
- Auto-generated match thumbnail/banner
- Team/player mentions, judge/recorder assignment support
- Schedule embed creation and notification system
- Posts to configured schedules channel
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
3. Bot generates embed, thumbnail, UTC/local time
4. Bot posts to schedules channel
5. Bot renames channel with `🔴`
6. Bot notifies participants and staff

**Success response:**

> ✅ Match scheduled successfully.  
> 🖼️ Thumbnail generated automatically.  
> 🔴 Match channel marked as scheduled.  
> 🔔 Notifications sent successfully.

**Notes:** Only one active schedule per match ticket. Staff assignments can be updated later via assignment buttons.

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

- Deletes schedule entry and embeds (schedules channel + match ticket)
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

## Notas generales

- Los comandos prefix (`[]command`) se documentarán en una fase posterior si aplican equivalentes a estos slash commands.
- Permisos como **Admin** y **Organiser** se mapean a roles configurados en `/settings` y `/staff config`, o al permiso Discord Administrator en el primer setup.
- Referencias a Google Sheets y MW Ban Database son dependencias externas a validar contra la API en el diseño final.
- Guild config commands (`/settings`, `/staff config`) follow the [documentation convention](#convencion-documentacion) and the setup/set → edit → show/view pattern. All command subsections are documented in English.
