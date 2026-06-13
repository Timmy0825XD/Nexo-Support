# Comandos del bot

Referencia de todos los slash commands del bot. Este documento se amplía durante el desarrollo.

> **Arquitectura:** bot monolítico (`bot/`) — fuente de verdad para implementación.  
> **Idioma del bot:** inglés (nombres, descripciones y respuestas en Discord).  
> **Estado:** lista inicial — algunos comandos pueden cambiar antes de implementarse.

### Fuera de alcance

Esta spec **no incluye** registro web personalizado (`tournament registration open/close/validate`, URLs `REGISTER_BASE_URL` / `WEB_BASE_URL`). Participantes se gestionan vía **Google Sheets** (`sheet_link` en `/tournament add`).

### Mapeo rápido comando → persistencia

| Área | Tabla / servicio |
|---|---|
| Attendance, links, work | `attendance` ([`DATABASE.md`](./DATABASE.md)) |
| Tournament config | `tournaments`, `guilds` |
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

## Notas generales

- Los comandos prefix (`[]command`) se documentarán en una fase posterior si aplican equivalentes a estos slash commands.
- Permisos como **Admin** y **Organiser** se mapearán a los roles del proyecto (Organizer, Helper, etc.) durante la implementación.
- Referencias a Google Sheets y MW Ban Database son dependencias externas a validar contra la API en el diseño final.
