# Mensajes del bot — catálogo editable

Referencia de **todas las cadenas visibles al usuario** (respuestas de comandos, embeds, botones, errores de guards). Los textos del bot están en **inglés** salvo donde se indique.

> **Fuente de verdad en código:** los archivos listados en cada sección. Este documento es el mapa para encontrarlos y editarlos sin buscar en todo el repo.  
> **Mantener al día:** al cambiar un mensaje en código (manual o vía agente), actualizar la fila correspondiente aquí. Ver regla `.cursor/rules/bot-messages.mdc`.

---

## Convenciones

| Símbolo | Significado |
|---|---|
| `{done}` | Prefijo animado de éxito (`successEmbed`) — ver [`EMOJIS.md`](./EMOJIS.md) |
| `{error}` | Prefijo de error (`errorEmbed`) |
| `{var}` | Placeholder dinámico |
| 🕶️ | Respuesta ephemeral (solo quien ejecutó) |
| 📢 | Mensaje en canal (no reply al comando) |

**Helpers de embed:** [`bot/src/utils/embeds.ts`](../bot/src/utils/embeds.ts) — `successEmbed`, `errorEmbed`, `infoEmbed`.

---

## Índice por comando

| Comando | Archivo principal | Utilidades relacionadas |
|---|---|---|
| `/ping` | [`ping.ts`](../bot/src/commands/slash/ping.ts) | `embeds.ts` |
| `/bot about\|help` | [`bot.ts`](../bot/src/commands/slash/bot.ts) | `bot-info.ts`, `help-pagination.ts` |
| `/server info\|banlist` | [`server.ts`](../bot/src/commands/slash/server.ts) | `embeds.ts` |
| `/settings *` | [`settings.ts`](../bot/src/commands/slash/settings.ts) | `guild-display.ts` |
| `/staff *` | [`staff.ts`](../bot/src/commands/slash/staff.ts) | `guild-display.ts` |
| `/role *` | [`role.ts`](../bot/src/commands/slash/role.ts) | `role-hierarchy.ts` |
| `/ticket *` | [`ticket.ts`](../bot/src/commands/slash/ticket.ts) | — |
| `/tournament *` | [`tournament.ts`](../bot/src/commands/slash/tournament.ts) | `tournament-display.ts` |
| `/team info\|list` | [`team.ts`](../bot/src/commands/slash/team.ts) | `team-display.ts` |
| `/sheet *` | [`sheet.ts`](../bot/src/commands/slash/sheet.ts) | `sheet-headers-display.ts`, `sheet-validation-display.ts`, `sheet-validation-pagination.ts`, `sheet-validation.ts` |
| `/schedule *` | [`schedule.ts`](../bot/src/commands/slash/schedule.ts) | `schedule-display.ts`, `schedule-result-display.ts`, `schedules.ts`, `schedule-results.ts` |
| `/attendance *` | [`attendance.ts`](../bot/src/commands/slash/attendance.ts) | `attendance-display.ts`, `attendance.ts` (service) |
| `/link *` | [`link.ts`](../bot/src/commands/slash/link.ts) | `attendance-display.ts`, `attendance.ts` |
| `/get attendance\|sheet` | [`get.ts`](../bot/src/commands/slash/get.ts) | `attendance-display.ts`, `attendance-export.ts` |
| `/work_done` | [`work_done.ts`](../bot/src/commands/slash/work_done.ts) | `attendance-display.ts`, `staff-work-pay.ts` |
| `/staff work` | [`staff.ts`](../bot/src/commands/slash/staff.ts) | `attendance-display.ts`, `staff-work-pay.ts` |
| Botones schedule | [`schedule-buttons.ts`](../bot/src/interactions/schedule-buttons.ts) | `schedule-display.ts` |
| `/room *` | [`room.ts`](../bot/src/commands/slash/room.ts) | `match-display.ts`, `room-available-pagination.ts` |
| `/auto_room *` | [`auto_room.ts`](../bot/src/commands/slash/auto_room.ts) | `match-display.ts` |
| `/upload_score` | [`upload_score.ts`](../bot/src/commands/slash/upload_score.ts) | `match-display.ts` |
| `/correct_bracket` | [`correct_bracket.ts`](../bot/src/commands/slash/correct_bracket.ts) | `match-display.ts` |

**Guards compartidos:** [`permissions.ts`](../bot/src/guards/permissions.ts) · [`tournament-permissions.ts`](../bot/src/guards/tournament-permissions.ts) · [`schedule-permissions.ts`](../bot/src/guards/schedule-permissions.ts) · [`attendance-permissions.ts`](../bot/src/guards/attendance-permissions.ts) · [`ticket-channel.ts`](../bot/src/guards/ticket-channel.ts) · [`discord-resources.ts`](../bot/src/guards/discord-resources.ts)

**Errores globales:** [`index.ts`](../bot/src/index.ts) — `Something went wrong.` 🕶️ (botones) · `Something went wrong while executing this command.`

---

## Guards — mensajes reutilizados

Aparecen en varios comandos. Editar en el guard indicado.

### `guards/permissions.ts`

| ID | Mensaje |
|---|---|
| `guard.no_guild` | `This command can only be used inside a server.` |
| `guard.admin` | `You need the server Administrator permission or the configured admin role to run this command.` |
| `guard.organiser` | `You need the configured Organiser role or server Administrator permission to run this command.` |
| `guard.discord_admin` | `You need the server Administrator permission to run this command.` |

### `guards/tournament-permissions.ts`

| ID | Mensaje |
|---|---|
| `guard.upload_score` | `You need server admin, organiser, or tournament admin permissions to upload scores.` |
| `guard.correct_bracket` | `You need organiser or server administrator permissions to correct bracket scores.` |
| `guard.room_available` | `You need organiser or staff permissions to view available match rooms.` |
| `guard.team_list` | `You need server admin or organiser permissions to list tournament participants.` |

### `guards/schedule-permissions.ts`

| ID | Mensaje |
|---|---|
| `guard.schedule_create` | `You need server admin, organiser, or tournament helper permissions to create schedules.` |
| `guard.schedule_delete` | `You need tournament helper permissions to delete schedules.` |
| `guard.schedule_staff` | `You need organiser or staff permissions to use this schedule command.` |
| `guard.schedule_resign.not_assigned` | `You must be assigned to this schedule before you can resign.` |
| `guard.schedule_resign.wrong_channel` | `Resignation must be submitted from the match ticket channel.` |
| `guard.schedule_result_declare` | `You need to be assigned staff, a team captain, or tournament staff to declare results.` |
| `guard.schedule_result_delete` | `You need tournament organizer or helper permissions to delete schedule results.` |

### `guards/attendance-permissions.ts`

| ID | Mensaje |
|---|---|
| `guard.attendance_mark` | `You need the configured Judge or Recorder role to mark attendance.` |
| `guard.attendance_delete` | `Only the attendance creator or an organiser can delete this record.` |
| `guard.attendance_staff` | `You need staff, judge, recorder, or organiser permissions to use this command.` |
| `guard.link_add` | `Only the recorder assigned to this attendance can add recording links.` |
| `guard.link_delete` | `Only the recorder assigned to this attendance can delete recording links.` |

### `/link delete` (`link.ts`)

| ID | Tipo | Título | Descripción / cuerpo |
|---|---|---|---|
| `link.delete.success` | embed | `{done} Recording Links Deleted` | `All {n} recording link(s) were removed and attendance embeds were updated.` |

### `/link missing` (`attendance-display.ts`)

| ID | Tipo | Título | Descripción / cuerpo |
|---|---|---|---|
| `link.missing.title` | embed | `⚠️ Missing Recording Links` | — |
| `link.missing.title_expired` | embed | `⚠️ Missing Recording Links (Expired)` | — |
| `link.missing.empty` | embed | `{done} Missing Recording Links` | `No attendance records are missing recording links.` |
| `link.missing.header_tournament` | embed desc | — | `📊 **Tournament:** {tournamentName}` |
| `link.missing.header_count` | embed desc | — | `🔗 **Missing Links:** {n} match(es) need attention` |
| `link.missing.entry` | embed desc | — | `{n}. **{team1}** __VS__ **{team2}**` + blockquote `Recorder`, `Date` (`<t:R>`), `Status: Awaiting Link` |
| `link.missing.footer` | footer | — | `Page {page}/{total} • {n} total missing` (+ `Session expired` when timed out) |
| `link.missing.btn_prev` | botón | `«` | — |
| `link.missing.btn_page` | botón | `{page}/{total}` | disabled |
| `link.missing.btn_next` | botón | `»` | — |
| `link.missing.wrong_user` | plain 🕶️ | — | `Only the person who ran /link missing can browse these pages.` |

### `guards/ticket-channel.ts`

| ID | Mensaje |
|---|---|
| `guard.ticket.not_text` | `This command can only be used in a text channel.` |
| `guard.ticket.not_ticket` | `This command can only be used inside a match ticket channel.` |

### `guards/discord-resources.ts` (plantillas)

| ID | Plantilla |
|---|---|
| `guard.resource.not_found` | `{label} does not exist in this server.` |
| `guard.resource.not_text` | `{label} must be a text channel.` |
| `guard.resource.not_category` | `{label} must be a category channel.` |
| `guard.resource.wrong_guild` | `{label} must belong to this server.` |
| `guard.bot.unavailable` | `Bot member is not available in this server.` |
| `guard.bot.cannot_evaluate` | `Cannot evaluate bot permissions for {label}.` |
| `guard.bot.missing_perms` | `Bot lacks required permissions in {label}. Ensure View Channel, Send Messages, and Embed Links are granted.` |

---

## `/ping`

**Ruta:** `bot/src/commands/slash/ping.ts`

| ID | Tipo | Título | Descripción / cuerpo |
|---|---|---|---|
| `ping.healthy.title` | info embed | `Pong!` | `**All systems operational.** Response times look good.` |
| `ping.unhealthy.title` | info embed | `Pong!` | `**Attention required.** Database is not responding correctly.` |
| `ping.field.bot_latency` | field | `{botPing} Bot Latency` | `{n}ms` |
| `ping.field.websocket` | field | `{webSocket} WebSocket` | `{n}ms` |
| `ping.field.db_latency` | field | `{latency} Database Latency` | `{n}ms` |
| `ping.field.db_status` | field | `{database} Database` | `` `Connected` `` / `` `Unreachable` `` |
| `ping.field.servers` | field | `{servers} Servers` | `{n}` |

---

## `/bot`

**Ruta:** `bot/src/commands/slash/bot.ts` · subcomandos: `about`, `help`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `bot.no_guild` | * | error embed | `Server Only` | `This command can only be used inside a server.` |
| `bot.about.title` | about | info embed | `Created with ❤️ for - {guildName} -` | `✅ Bot information retrieved successfully.` |
| `bot.help.empty` | help | info embed | `Command List` | `No commands are currently registered.` |
| `bot.help.page` | help | info embed paginado | Categoría (desde `buildHelpCategories`) | Entradas por categoría |
| `bot.help.footer` | help | footer | — | `🛡️ Category {n} of {total} • {botName} Help System` |
| `bot.help.btn_prev` | help | botón | `◀` | — |
| `bot.help.btn_next` | help | botón | `▶▶` | — |
| `bot.help.wrong_user` | help | plain 🕶️ | — | `Only the person who ran /bot help can browse these pages.` |

---

## `/server`

**Ruta:** `bot/src/commands/slash/server.ts` · subcomandos: `info`, `banlist`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `server.no_guild` | * | error embed | `Server Only` | `This command can only be used inside a server.` |
| `server.info.title` | info | info embed | `Server Information` | `✅ Server information retrieved successfully.` |
| `server.banlist.denied` | banlist | error embed | `Permission Denied` | `assertOrganiser` o `You do not have permission to run this command.` |
| `server.banlist.bot_perm` | banlist | error embed | `Missing Permission` | `I need the Ban Members permission to retrieve the ban list.` |
| `server.banlist.excel` | banlist | success embed + file | `Ban List Export` | `📊 Total banned users: {n}\n📄 Excel file generated successfully.\n\n✅ Ban list retrieved successfully.\n📄 Excel file generated and uploaded successfully.` |
| `server.banlist.list` | banlist | info embed | `Banned Users` | `📋 Banned users list generated successfully.\n\n✅ Ban list retrieved successfully.` |
| `server.banlist.empty` | banlist | field | `Users` | `No banned users.` |
| `server.banlist.truncated` | banlist | field | `Users` | `{mentions}...and {n} more.` |

---

## `/settings`

**Ruta:** `bot/src/commands/slash/settings.ts` · subcomandos: `setup`, `edit`, `show`  
**Embeds:** `bot/src/utils/guild-display.ts`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `settings.no_guild` | * | error embed | `Server Only` | (guard) |
| `settings.denied` | * | error embed | `Permission Denied` | (guard admin) |
| `settings.show` | show | info embed | `⚙️ Current Bot Settings` | Sin config: `⚠️ No configuration found.\n\nUse /settings setup to configure the bot before using tournament commands.` |
| `settings.setup` | setup | success embed | `Bot settings updated successfully.` | fields de roles/canales |
| `settings.edit.no_setup` | edit | error embed | `Setup Required` | `No complete configuration found. Run /settings setup before editing settings.` |
| `settings.edit` | edit | success embed | `Settings Updated Successfully` | `Modified Settings:` + fields + `🕒 Updated At` |
| `settings.validation` | * | error embed | `Validation Failed` | `{error.message}` |
| `settings.no_fields` | * | error embed | `Invalid Input` | `At least one setting must be provided.` |

**Fallbacks en guild-display:** `Not configured` · `❌ Deleted Role` · `❌ Deleted Channel` · `❌ Deleted Category` · `❌ Unknown Member`

---

## `/staff`

**Ruta:** `bot/src/commands/slash/staff.ts`  
**Subcomandos:** `config set|edit|view`, `fire`, `recruit`, `work`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `staff.no_guild` | * | error embed | `Server Only` | — |
| `staff.config.denied` | config | error embed | `Permission Denied` | admin guard |
| `staff.config.view` | view | info embed | `🏅 Staff Configuration` | Sin config: `⚠️ No staff configuration found.\n\nUse /staff config set to configure the staff system.` |
| `staff.config.set` | set | success embed | `Staff Configuration Updated Successfully` | fields |
| `staff.config.edit.no_setup` | edit | error embed | `Setup Required` | `No complete staff configuration found. Run /staff config set before editing.` |
| `staff.config.edit` | edit | success embed | `Staff Configuration Updated Successfully` | `Modified Settings:` + fields |
| `staff.config.no_fields` | config | error embed | `Invalid Input` | `At least one staff setting must be provided.` |
| `staff.fire.denied` | fire | error embed | `Permission Denied` | Discord Administrator |
| `staff.fire.no_config` | fire | error embed | `Setup Required` | `Staff roles must be configured using /staff config set before using this command.` |
| `staff.fire.success` | fire | success embed | `Staff Removal Updated` | `✅ Staff role removal processed successfully.\n\n{details}` |
| `staff.recruit.success` | recruit | success embed | `Staff Recruitment Updated` | `✅ Staff recruitment processed successfully.\n\n{details}` |
| `staff.fire_recruit.error` | fire/recruit | error embed | `Staff Error` | `{message}` o `Failed to update staff roles.` |
| `staff.work.not_found` | work | error embed | `Tournament Not Found` | `The selected tournament does not exist.` |
| `staff.work.empty` | work | info embed | `Staff Work Statistics` | `✅ Staff work statistics generated successfully.\n\nNo attendance records found for **{tournament}**.` |
| `staff.work.data` | work | plain 📢 + 3 embeds | — | Texto: `{done} Staff Work Count for {tournament} (excluding\|including default wins)` · Embeds: **Judges** / **Recorders** / **Judge & Recorder** |

**Detalle recruit** (`buildStaffRecruitEmbed`):
```
{target} recruitment roles processed.
Assigned Position: {position}
Roles Added: {roles}
Notes: {notes}  (opcional)
```

**Detalle fire** (`buildStaffFireEmbed`):
```
{target} staff role removal processed.
Removed Position: {position}
Roles Removed: {roles}
```

**📢 Bienvenida staff** (`sendStaffWelcomeMessage` → canal staff chat):
```
**Welcome {target}!** 🎉
You've been assigned as: **{position}**
**Important Channels:**
• Announcements: …
• Instructions: …
• Details Submission: …
• Schedule Channel: …
**We're excited to have you on board!**
```

---

## `/role`

**Ruta:** `bot/src/commands/slash/role.ts` · subcomandos: `user`, `list`, `add all`, `remove all`  
**Jerarquía:** `bot/src/utils/role-hierarchy.ts`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `role.denied` | * | error embed | `Permission Denied` | organiser guard |
| `role.invalid` | * | error embed | `Invalid Role` | `The selected role no longer exists.` |
| `role.user.added` | user | success embed | `Role Updated` | `✅ Role {role} has been added to {user}.` |
| `role.user.removed` | user | success embed | `Role Updated` | `✅ Role {role} has been removed from {user}.` |
| `role.list.inline` | list | success embed | `Role Information` | `Role: …\nTotal/Human/Bot Members…\nMembers:\n{list\|No members.}\n\n📋 …\n\n✅ Role information retrieved successfully.` |
| `role.list.csv` | list | success embed + file | `Role Information` | `Member list is too large to display.\nPlease check the attached CSV file.` |
| `role.add_all` | add all | success embed | `Role Assignment Completed` | `✅ Role assignment completed.\n\nRole: …\nAdded To: {n}\nSkipped: {n} (already had role)` |
| `role.remove_all` | remove all | success embed | `Role Removal Completed` | `✅ Role removal completed.\n\nRemoved From: {n}\nSkipped: {n} (did not have role)` |
| `role.error` | * | error embed | `Role Error` | jerarquía o `Failed to manage roles.` |

**Jerarquía (`role-hierarchy.ts`):**

| ID | Mensaje |
|---|---|
| `role.hierarchy.bot_too_low` | `I cannot manage/assign/remove this role because it is higher than or equal to my highest role.` |
| `role.hierarchy.user_too_low` | `You cannot manage roles higher than or equal to your highest role.` |
| `role.hierarchy.managed` | `I cannot manage/assign/remove this role because it is managed by an integration.` |
| `role.hierarchy.bot_unavailable` | `Bot member is unavailable in this server.` |

---

## `/ticket`

**Ruta:** `bot/src/commands/slash/ticket.ts` · subcomandos: `close`, `reopen`, `delete`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `ticket.denied` | * | error embed | `Permission Denied` | organiser |
| `ticket.invalid_channel` | * | error embed | `Invalid Channel` | `This command can only be used inside a text channel.` / `This command requires a guild text channel.` |
| `ticket.invalid_ticket` | * | error embed | `Invalid Ticket` | `This command only works inside valid match ticket channels.` |
| `ticket.close.already` | close | error embed | `Already Closed` | `This ticket is already closed.` |
| `ticket.close.ok` | close | success embed | `Ticket Closed` | `✅ Ticket closed successfully.` |
| `ticket.reopen.already` | reopen | error embed | `Already Open` | `This ticket is already open.` |
| `ticket.reopen.no_category` | reopen | error embed | `Missing Category` | `Cannot reopen this ticket because the original open category is unknown.` |
| `ticket.reopen.ok` | reopen | success embed | `Ticket Reopened` | `✅ Ticket reopened successfully.` |
| `ticket.delete.ok` | delete | success embed | `Ticket Deleted` | `✅ Ticket deleted successfully.` |
| `ticket.error` | * | error embed | `Ticket Error` | incl. `No closed ticket category is configured for this tournament or guild.` |

---

## `/tournament`

**Ruta:** `bot/src/commands/slash/tournament.ts` · subcomandos: `add`, `edit`, `delete`, `info`, `list`  
**Embeds:** `bot/src/utils/tournament-display.ts`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `tournament.denied` | * | error embed | `Permission Denied` | admin |
| `tournament.list` | list | info embed 🕶️ | `Registered Tournaments` | `✅ Tournament list retrieved successfully.` / `No tournaments registered yet.` |
| `tournament.info.not_found` | info | error embed | `Tournament Not Found` | — |
| `tournament.info` | info | info embed | `🏆 Tournament Configuration: {name}` | `Current tournament setup and integration status.` |
| `tournament.add` | add | success embed | `🏆 Tournament Created: {name}` | `A new tournament has been registered on this server.` |
| `tournament.edit` | edit | success embed | `Tournament Updated: {name}` | `✅ Tournament updated successfully.` |
| `tournament.delete` | delete | success embed | `Tournament Deleted` | `✅ Tournament **{name}** was removed from the bot.` |
| `tournament.validation` | * | error embed | `Validation Failed` | `{message}` |
| `tournament.blocked.max` | * | error embed | `Operation Blocked` | `This server already has the maximum of {n} tournaments configured.` |
| `tournament.blocked.active` | delete | error embed | `Operation Blocked` | `Cannot delete this tournament while active match rooms or open matches exist.` |
| `tournament.duplicate` | * | error embed | `Duplicate Tournament` | conflicto nombre/Challonge/sheet |
| `tournament.integration` | * | error embed | `Integration Error` | Challonge/Sheets/Encryption |
| `tournament.no_fields` | edit | error embed | `Invalid Input` | `At least one valid tournament field must be provided.` |

---

## `/team`

**Ruta:** `bot/src/commands/slash/team.ts` · subcomandos: `info`, `list`  
**Embeds:** `bot/src/utils/team-display.ts`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `team.no_guild` | * | error embed | `Server Only` | — |
| `team.list.denied` | list | error embed | `Permission Denied` | team_list guard |
| `team.not_found` | * | error embed | `Tournament Not Found` | — |
| `team.no_participants` | * | error embed | `No Participants` | `The tournament sheet does not contain any registered participants yet.` |
| `team.info.no_lookup` | info | error embed | `Missing Lookup` | `Provide either a **user** or **gameid_username** to search the participant sheet.` |
| `team.info.not_found` | info | error embed | `Participant Not Found` | `No participant matched that lookup in the configured Google Sheet.` |
| `team.info` | info | info embed | `Team Info — {name}` | `**{tournament}**` + player fields |
| `team.list` | list | plain + embed | `content`: menciones | embed por equipo: **{teamName}** + fields |
| `team.error` | * | error embed | `Participant Lookup Failed` | Sheets/network |

**Campos de jugador:**

| ID | Plantilla |
|---|---|
| `team.player.discord` | `Discord: {mention\|Not provided}` |
| `team.player.ingame` | `In-game: {name} · {id}` |
| `team.player.title` | `Title: {value\|None}` |
| `team.player.captain` | `👑 Captain` |
| `team.player.n` | `🎮 Player {n}` |

---

## `/sheet`

**Ruta:** `bot/src/commands/slash/sheet.ts` · subcomando: `headers`  
**Embeds:** `bot/src/utils/sheet-headers-display.ts`

| ID | Tipo | Título | Descripción |
|---|---|---|---|
| `sheet.invalid_format` | error embed | `Invalid Format` | `Select a supported tournament format.` |
| `sheet.headers` | info embed | `Sheet Headers — {format}` | Instrucciones copy-paste + code block + fields Columns / Bracket name column |
| `sheet.headers.all` | info embed + followUp | Un embed por formato (1vs1–5vs5) | — |
| `sheet.validate.denied` | validate | error embed 🕶️ | `Permission Denied` | `assertAdmin` message |
| `sheet.validate.guild` | validate | error embed 🕶️ | `Guild Only` | `This command can only be used inside a server.` |
| `sheet.validate.pass` | validate | success embed 📢 | `Sheet Validation Passed` | All players/teams passed |
| `sheet.validate.fail` | validate | paginated embeds 📢 + `.txt` | Summary + sections | `◀` / section label / `▶` buttons (2 min), full report in attachment |
| `sheet.validate.pagination.denied` | validate | plain 🕶️ | — | `Only the person who ran /sheet validate can browse these pages.` |
| `sheet.validate.error` | validate | error embed 🕶️ | `Sheet Validation Error` | Sheets / banned list / network errors |

---

## `/schedule`

**Ruta:** `bot/src/commands/slash/schedule.ts`  
**Subcomandos:** `create`, `delete`, `unassigned`, `refresh`, `resign`  
**Servicio:** `bot/src/services/schedules.ts` · **Embeds canal:** `bot/src/utils/schedule-display.ts`

### Respuestas al comando

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `schedule.denied` | * | error embed | `Permission Denied` | guards |
| `schedule.invalid_input` | * | error embed | `Invalid Input` | `Invalid schedule input.` o Zod |
| `schedule.error` | * | error embed | `Schedule Error` | ver tabla servicio abajo |
| `schedule.match_not_found` | * | error embed | `Match Not Found` | `No match found for Match ID \`{id}\` from this channel topic.` |
| `schedule.tournament_not_found` | * | error embed | `Tournament Not Found` | `Could not resolve the tournament for this ticket.` |
| `schedule.delete.cancelled` | delete | error embed | `Deletion Cancelled` | `Schedule deletion was cancelled.` |
| `schedule.create.ok` | create | *(no reply — deleted)* | — | Success is logged via `logScheduleCreated` only |
| `schedule.update.ok` | update | *(no reply — deleted)* | — | Success is logged via `logScheduleUpdated` only |
| `schedule.show.ok` | show | info embed | Schedule channel embed preview |
| `schedule.delete.ok` | delete | ephemeral plain text | — | `The Schedule **{team1} vs {team2}** has been deleted successfully. Reason: {reason\|Not provided}` |
| `schedule.unassigned.pending` | unassigned | info embed | `⚠️ Unassigned Matches Found` | `Filter: **{filter}**` + bloques |
| `schedule.unassigned.empty` | unassigned | info embed | `All Matches Staffed` | `No pending matches are missing staff.` |
| `schedule.unassigned.btn_prev` | unassigned | botón | `Previous` | — |
| `schedule.unassigned.btn_next` | unassigned | botón | `Next` | — |
| `schedule.unassigned.wrong_user` | unassigned | plain 🕶️ | — | `Only the person who ran /schedule unassigned can browse these pages.` |
| `schedule.refresh.ok` | refresh | success embed | `♻️ Schedule Buttons Refreshed` | `Assignment buttons on the schedule channel post were refreshed for **10 minutes**. Filled roles stay disabled.` |
| `schedule.resign.ok` | resign | *(no reply — deleted)* | — | Success is logged via `logScheduleResign`; ticket gets `schedule.notify.resigned` |
| `schedule.results.ok` | results | ephemeral plain text 🕶️ | — | `✅ Match result posted to {#results}.` |
| `schedule.results_delete.cancelled` | results_delete | error embed | `Deletion Cancelled` | `Schedule result deletion was cancelled.` |
| `schedule.results_delete.ok` | results_delete | ephemeral plain text 🕶️ | — | `The result for **{team1} vs {team2}** has been deleted successfully. Reason: {reason\|Not provided}` |

### Errores de servicio (`schedules.ts`)

| ID | Mensaje |
|---|---|
| `schedule.svc.already_exists` | `An active schedule already exists for match {matchId}.` |
| `schedule.svc.not_found` | `No schedule was found for this match ticket.` |
| `schedule.svc.selected_not_found` | `Selected schedule was not found.` |
| `schedule.svc.no_match_id_topic` | `This channel topic must include a Match ID (e.g. "Match ID: 123456789").` |
| `schedule.svc.no_channel` | `No schedule channel is configured. Set one with /staff config set or /staff config edit…` |
| `schedule.svc.channel_unavailable` | `The configured schedule channel is unavailable.` |
| `schedule.svc.ticket_unavailable` | `The match ticket channel is unavailable.` |
| `schedule.svc.user_not_member` | `The selected {judge\|recorder} user is not a member of this server.` |
| `schedule.svc.missing_role` | `The selected user does not have the Judge\|Recorder role required for this assignment.` |
| `schedule.svc.role_taken` | `A {role} is already assigned to this schedule.` |
| `schedule.svc.no_post` | `This schedule has no post in the schedule channel. Create or restore it before refreshing buttons.` |
| `schedule.svc.not_assigned_role` | `You are not assigned to the selected role(s) on this schedule.` |
| `schedule.svc.tournament_gone` | `Tournament for this schedule was not found.` |
| `schedule.svc.match_gone` | `Match for this schedule was not found.` |
| `schedule.svc.invalid_datetime` | `The provided date and time is not a valid UTC datetime.` |

### Errores de resultados (`schedule-results.ts`)

| ID | Texto |
|---|---|
| `schedule.result.too_early` | `Results cannot be declared before the scheduled match time has passed.` |
| `schedule.result.already_exists` | `A result has already been declared for this schedule.` |
| `schedule.result.not_found` | `No result was found for this schedule.` |
| `schedule.result.no_channel` | `This tournament has no results channel configured. Set one with /tournament edit.` |
| `schedule.result.channel_unavailable` | `The tournament results channel is unavailable.` |
| `schedule.result.no_proof` | `Attach at least one proof image (image1–image10).` |
| `schedule.result.invalid_proof` | `Invalid proof image "{name}". Only PNG, JPEG, WEBP, and GIF are allowed.` |
| `schedule.result.tied_scores` | `Scores cannot be tied. Provide a winner override if needed.` *(from matches.ts)* |

### 📢 Embed de resultados (`schedule-result-display.ts`)

Publicado en el canal de resultados del torneo con capturas adjuntas.

| ID | Ubicación | Texto |
|---|---|---|
| `schedule.result.embed.title` | título | `[🏆 {TEAM1} 🆚 {TEAM2}]({transcriptMessageUrl})` — en canal de resultados; en ticket, enlace al mismo mensaje del ticket |
| `schedule.result.embed.utc` | descripción | `**Result UTC Time:** {YYYY-MM-DD HH:mm}` — usa `schedules.scheduled_at` |
| `schedule.result.embed.local` | descripción | `**Result Local Time:** <t:{unix}:f> (<t:{unix}:R>)` — usa `schedules.scheduled_at` |
| `schedule.result.embed.tournament` | descripción | `**__Tournament:__** {name}` |
| `schedule.result.embed.channel` | descripción | `**Channel:** {#ticket}` |
| `schedule.result.embed.captain1` | descripción | `**Team 1 Captain:**` — 1vs1: `@username` · 2vs2+: `{@user} ({team name})` |
| `schedule.result.embed.captain2` | descripción | `**Team 2 Captain:**` — 1vs1: `@username` · 2vs2+: `{@user} ({team name})` |
| `schedule.result.embed.results` | descripción | `🏆 {T1} {S1} —🆚 —{S2}{T2}` (team 1 win) · `{T1} {S1} —🆚 —{S2}🏆 {T2}` (team 2 win) |
| `schedule.result.embed.footer` | footer | `Uploaded by @{username}•{DD/MM/YYYY HH:mm}` |
| `schedule.result.notify.ticket` | 📢 ticket | `{@captain1} {@captain2} — The results of the Schedule have been **Uploaded**, please **Check**.` |
| `schedule.result.notify.ticket.generic` | 📢 ticket (sin capitanes) | `The results of the Schedule have been **Uploaded**, please **Check**.` |
| `schedule.result.embed.remarks` | descripción | `**Remarks:** {notes}` |

### 📢 Embeds publicados en canales (`schedule-display.ts`)

Descripción en markdown (sin fields). Mismo layout en ticket y schedule channel; el canal de schedules añade la línea **Channel**.

| ID | Elemento | Texto |
|---|---|---|
| `schedule.embed.title` | título | `{TEAM1} VS {TEAM2}` |
| `schedule.embed.utc` | descripción | `**UTC Time:** {YYYY-MM-DD HH:mm}` |
| `schedule.embed.local` | descripción | `**Local Time:** <t:{unix}:f> (<t:{unix}:R>)` |
| `schedule.embed.tournament` | descripción | `**__Tournament:__** {name}` |
| `schedule.embed.round` | descripción | `**__Round:__** {round\|TBD}` |
| `schedule.embed.channel` | descripción (solo schedule channel) | `**Channel:** {#ticket}` |
| `schedule.embed.captain1` | descripción | `**Team 1 Captain:**` — 1vs1: `@username` · 2vs2+: `{@user} ({team name})` |
| `schedule.embed.captain2` | descripción | `**Team 2 Captain:**` — 1vs1: `@username` · 2vs2+: `{@user} ({team name})` |
| `schedule.embed.staffs_header` | descripción | `**__Staffs:__**` |
| `schedule.staff.judge` | descripción | `:man_judge: **Judge:** {@user\|*(vacío)*}` |
| `schedule.staff.recorder` | descripción | `:video_camera: **Recorder:** {@user\|*(vacío)*}` |
| `schedule.embed.footer` | footer | `Created by {username}•{DD/MM/YYYY HH:mm}` |
| `schedule.btn.judge` | botón | `👨‍⚖️ Judge` (Success / green) |
| `schedule.btn.recorder` | botón | `🎥 Recorder` (Success / green) |
| `schedule.staff_chat.create` | 📢 staff chat (solo al crear) | `{@judge} - {@recorder} **New schedule**, [take on a role.](https://tenor.com/view/check-schedule-f1livegp-gif-25992214)` |
| `schedule.notify.ticket` | 📢 ticket (mismo mensaje que el embed) | `{captain mentions} — Your schedule has been created or modified, please check the date and time.` |
| `schedule.notify.ticket.generic` | 📢 ticket (sin capitanes) | `Your schedule has been created or modified, please check the date and time.` |
| `schedule.notify.assigned` | 📢 ticket | `{user} assigned as **Judge\|Recorder** {emoji}` |
| `schedule.notify.resigned` | 📢 ticket | `{user} has resigned as **Judge\|Recorder** for this match.\n⏳ These positions are now available…` |
| `schedule.reminder.content` | 📢 ticket (T-10) | `{captain + staff mentions} — Please make sure to read and follow the rules stated in {#rules}.` |
| `schedule.reminder.content.no_rules` | 📢 ticket (T-10, sin rules channel) | `{mentions} — Please make sure to read and follow the tournament rules before the match.` |
| `schedule.reminder.footer` | footer embed recordatorio | `Staff Confirmation Required \| Confirm before match time` |
| `schedule.reminder.btn.judge` | botón | `👨‍⚖️ Confirmed` (Success / green) |
| `schedule.reminder.btn.recorder` | botón | `🎥 Confirmed` (Success / green) |
| `schedule.urgent.content` | 📢 schedule channel | `{@judgeRole} {@recorderRole} — 🚨 URGENT STAFF REPLACEMENT NEEDED!` (solo roles faltantes) |
| `schedule.urgent.header` | descripción embed urgente | `🚨 **URGENT: Staff Replacement Needed!**` |
| `schedule.urgent.match_starts` | descripción embed urgente | `Match starts <t:{unix}:R>!` |
| `schedule.urgent.failure` | descripción embed urgente | `{emoji} **Judge\|Recorder** {@user} failed to confirm presence` |
| `schedule.urgent.unassigned` | descripción embed urgente | `{emoji} **Judge\|Recorder** — No staff assigned` |
| `schedule.urgent.footer` | footer embed urgente | `🚨 IMMEDIATE ACTION REQUIRED — Match starts <t:{unix}:R>` |

---

## Botones de schedule

**Ruta:** `bot/src/interactions/schedule-buttons.ts` — 🕶️ **todas ephemeral**

| ID | Tipo | Título | Descripción |
|---|---|---|---|
| `schedule.btn.no_guild` | error embed | `Server Only` | `This button can only be used inside a server.` |
| `schedule.btn.no_role` | error embed | `Assignment Failed` | `You need the Judge\|Recorder role to take this assignment.` |
| `schedule.btn.gone` | error embed | `Assignment Failed` | `This schedule no longer exists.` |
| `schedule.btn.not_found` | error embed | `Assignment Failed` | tournament/match not found |
| `schedule.btn.ok` | plain 🕶️ | — | `**Assignment Complete:** You are now assigned as **Judge\|Recorder** for this match.` |
| `schedule.btn.error` | error embed | `Assignment Failed` | `Something went wrong while processing this assignment.` |
| `schedule.btn.role_taken` | error embed | `Assignment Failed` | `A {role} is already assigned to this schedule.` |
| `schedule.btn.expired` | error embed | `Assignment Failed` | `Assignment buttons have expired. Use \`/schedule refresh\` to re-enable them.` |
| `schedule.btn.confirm.ok` | plain 📢 | — | `{@user} Attendance confirmed as Judge\|Recorder for this match.` |
| `schedule.btn.confirm.not_assigned` | plain 🕶️ | — | `Only the assigned {role} can confirm attendance for this match.` |
| `schedule.btn.confirm.already` | plain 🕶️ | — | `Attendance has already been confirmed for this role.` |
| `schedule.btn.confirm.closed` | plain 🕶️ | — | `The confirmation window for this match has closed.` |
| `schedule.btn.confirm.no_role` | plain 🕶️ | — | `No {role} is currently assigned to this schedule.` |

---

## `/room`

**Ruta:** `bot/src/commands/slash/room.ts` · subcomandos: `create`, `available`  
**Embeds:** `bot/src/utils/match-display.ts` · paginación: `room-available-pagination.ts`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `room.denied` | * | error embed | `Permission Denied` / `Tournament Not Found` | — |
| `room.create.ok` | create | success embed | `Rooms Created` | `buildRoomsCreatedEmbed` (ver abajo) |
| `room.available.ok` | available | success embed | `Available Rooms for {tournament}` | paginado |
| `room.available.empty` | available | warning embed | `No Available Matches` | detalles existing / TBD / Challonge |
| `room.available.wrong_user` | available | plain 🕶️ | — | `Only the person who ran /room available can browse these pages.` |
| `room.error` | * | error embed | `Room Error` | `MatchRoomError` messages |

**`buildRoomsCreatedEmbed`** (`match-display.ts`):

| ID | Texto |
|---|---|
| `room.created.summary` | `These **tickets have been Successfully Created**` + lista `- {channel} — \`{name}\`` / `*No new tickets were created.*` |
| `room.created.skipped` | `⏭️ Skipped **{n}** match(es) that already had a room.` |
| `room.created.warnings` | `⚠️ *Warnings:*` |
| `room.created.errors` | `❌ *Errors:*` |

**`/room available` paginado** (`room-available-pagination.ts`):

| ID | Texto |
|---|---|
| `room.available.header` | `Showing **{start} - {end}** of **{total}** available matches.` |
| `room.available.match` | `🆚 **Match {n}**` + `*{group/round}*` + `{team1} vs {team2}` |
| `room.available.page` | Footer: `Page {current}/{total}` |

**Match ticket welcome** (`match-ticket-welcome.ts`) — mensaje al crear sala (auto-room / `/room create`):

| ID | Tipo | Texto |
|---|---|---|
| `room.ticket.content` | plain | `**Greetings, Captains.** Your ticket has been created. {captain mentions}` + blockquote `:alarm_clock: Please agree on a **date and time** for your Schedule, and remember to ping {helper role} once the schedule has been finalized.` |
| `room.ticket.embed.author` | embed | Logo del servidor + `{tournament name}` → enlace `https://challonge.com/{slug}` |
| `room.ticket.embed.field.match` | embed field | `Match` → `{TEAM1} VS {TEAM2}` |
| `room.ticket.embed.field.captain1` | embed field | `Captain Team 1` → `{mention}` |
| `room.ticket.embed.field.captain2` | embed field | `Captain Team 2` → `{mention}` |
| `room.ticket.embed.field.stage` | embed field | `Round — Group` → `{group label}` si fase de grupos · `Round {n}` si no |
| `room.ticket.embed.field.rules` | embed field | `Rules` → `{rules channel}` |
| `room.ticket.embed.field.deadline` | embed field | `Deadline` → `{deadline channel}` |
| `room.ticket.embed.footer` | embed | `Match ID: {id} • Created at: {dd/mm/yyyy hh:mm}` |

**MatchRoomError:**

| ID | Mensaje |
|---|---|
| `room.err.categories_full` | `All configured open ticket categories are full. Add another category or close unused tickets.` |
| `room.err.bot_unavailable` | `Bot member is unavailable in this guild.` |
| `room.err.no_manage_channels` | `Bot lacks Manage Channels permission in category {name}.` |
| `room.err.invalid_category` | `Selected category is invalid or unavailable.` |

---

## `/auto_room`

**Ruta:** `bot/src/commands/slash/auto_room.ts` · subcomandos: `run`, `stop`, `toggle`

| ID | Sub | Tipo | Título | Descripción |
|---|---|---|---|---|
| `auto_room.denied` | * | error embed | `Permission Denied` / `Tournament Not Found` | — |
| `auto_room.stop` | stop | success embed | `Auto Room Disabled` | `⏹️ *Creación automática desactivada* para **{name}**.` |
| `auto_room.toggle.on` | toggle | success embed | `Auto Room Enabled` | `✅ *Creación automática activada*…` |
| `auto_room.toggle.off` | toggle | success embed | `Auto Room Disabled` | (mismo título que stop) |
| `auto_room.run.created` | run | success embed | `Rooms Created` | `buildRoomsCreatedEmbed` |
| `auto_room.run.idle` | run | success/info embed | `Auto Room Enabled` | `{tournament}\n\nAutomatic room creation is **enabled**.` + group stage note + `No new ready matches needed rooms right now.` |
| `auto_room.run.partial` | run | success/info embed | `Auto Room Enabled` | `*Some matches could not be processed this run.*` |
| `auto_room.error` | * | error embed | `Auto Room Error` | `{message}` |

---

## `/upload_score`

**Ruta:** `bot/src/commands/slash/upload_score.ts`  
**Embed éxito:** `buildScoreUploadedEmbed` en `match-display.ts`

| ID | Tipo | Título | Descripción |
|---|---|---|---|
| `upload.no_guild` | error embed | `Server Only` | — |
| `upload.wrong_channel` | error embed | `Ticket Channel Required` | `Run /upload_score inside the match ticket channel you want to finalize.` |
| `upload.invalid_ticket` | error embed | `Invalid Ticket` | `This channel is not linked to a tournament match…` |
| `upload.not_found` | error embed | `Tournament Not Found` / `Match Not Found` | — |
| `upload.denied` | error embed | `Permission Denied` | upload_score guard |
| `upload.completed` | error embed | `Match Completed` | — |
| `upload.tie` | error embed | `Invalid Scores` | `Scores cannot be tied. Provide a winner override if needed.` |
| `upload.ok` | success embed | `Score Uploaded` | ver abajo |
| `upload.error` | error embed | `Upload Failed` | `{message}` |

**`buildScoreUploadedEmbed`** — mezcla ES/EN:

| ID | Texto |
|---|---|
| `upload.embed.desc` | `✅ *Resultado subido correctamente a Challonge.*` |
| `upload.embed.archived` | `📁 Ticket archivado en {channel}.` (**español**) |
| Fields | Partido, Marcador final, Ganador, Llave, Torneo, Match ID, Nota |

---

## `/correct_bracket`

**Ruta:** `bot/src/commands/slash/correct_bracket.ts`

| ID | Tipo | Título | Descripción |
|---|---|---|---|
| `correct.denied` | error embed | `Permission Denied` | correct_bracket guard |
| `correct.not_found` | error embed | `Tournament Not Found` / `Match Not Found` | — |
| `correct.tie` | error embed | `Invalid Scores` | (empate) |
| `correct.ok` | success embed | `Bracket Corrected` | `✅ *Marcador actualizado en Challonge.*` + Marcador anterior/nuevo |
| `correct.error` | error embed | `Correction Failed` | `{message}` |

---

## Challonge audit logs (`guild-logs.ts` · `log-embeds.ts`)

Canal: `challonge_logs` (configurado en `/settings setup`).

**Match updated** (`buildChallongeMatchUpdatedLogEmbed`) — `/upload_score`, `/correct_bracket`:

| ID | Campo | Texto |
|---|---|---|
| `challonge.log.match.title` | embed | `:white_check_mark: Match Updated Successfully` |
| `challonge.log.match.intro` | embed | `The match has been updated with the following details:` |
| `challonge.log.match.tournament` | embed | `**__Tournament:__** [{name}](https://challonge.com/{slug})` |
| `challonge.log.match.match` | embed | `**__Match:__** {team1} __vs__ {team2}` |
| `challonge.log.match.channel` | embed | `**__Channel:__** {ticket channel}` |
| `challonge.log.match.score` | embed | `**__Score:__** {score}` — corrección: `{old} / {new}` |
| `challonge.log.match.winner` | embed | `**__Winner:__** **{team}**` |
| `challonge.log.match.datetime` | embed | `**__Date & Time:__** {dd/mm/yyyy hh:mm}` |
| `challonge.log.match.triggered` | embed | `**__Triggered By:__** {user mention}` |

**Tournament linked** (`buildChallongeTournamentLinkedLogEmbed`):

| ID | Texto |
|---|---|
| `challonge.log.linked.title` | `:white_check_mark: Tournament Linked to Challonge` |

**Credentials updated** (`buildChallongeCredentialsUpdatedLogEmbed`):

| ID | Texto |
|---|---|
| `challonge.log.credentials.title` | `:key: Tournament Credentials Updated` |

---

## Integraciones — errores que llegan al usuario

### Challonge (`services/challonge.ts`)

| ID | Mensaje |
|---|---|
| `challonge.unreachable` | `Unable to reach the Challonge API…` |
| `challonge.invalid_key` | `Invalid Challonge API key…` |
| `challonge.not_found` | `The requested Challonge resource was not found.` |
| `challonge.rate_limit` | `Challonge rate limit reached…` |
| `challonge.unexpected` | `Challonge API returned an unexpected error ({status}).` |
| `challonge.missing_participants` | `Cannot report score: match participant IDs are missing from Challonge.` |

### Google Sheets (`services/sheets.ts`)

| ID | Mensaje |
|---|---|
| `sheets.invalid_link` | `Invalid Google Sheet link…` |
| `sheets.invalid_headers` | `Team sheet must include Player 1 through Player N headers…` |
| `sheets.unrecognized` | `Unrecognized sheet layout…` |
| `sheets.unreachable` | `Unable to reach Google Sheets…` |
| `sheets.not_found` | `Google Sheet not found…` |
| `sheets.http_error` | `Failed to read Google Sheet (HTTP {status}).` |
| `sheets.not_public` | `Google Sheet is not publicly readable…` |
| `sheets.empty` | `Google Sheet is empty or missing a header row.` |
| `sheets.missing_headers` | `Google Sheet ({format}) is missing required headers: {list}` |

---

## Cómo editar un mensaje

1. Busca el comando en el **índice** o por ID (`schedule.create.ok`, etc.).
2. Abre la **ruta** indicada y localiza la cadena (o el builder en `*-display.ts`).
3. Cambia el texto en código.
4. Actualiza la fila en este documento con el nuevo texto.
5. Si cambias prefijos de embed, revisa también [`EMOJIS.md`](./EMOJIS.md).

**Pedir cambios al agente:** indica el ID (ej. `schedule.embed.title`) o el comando + situación (ej. "error de `/team info` cuando no hay participantes") y el texto deseado.
