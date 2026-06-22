# Nexo Support

Bot monolítico de Discord para gestionar torneos competitivos de **Modern Warships**. Acceso directo a **Supabase**, participantes vía **Google Sheets**, sin API REST ni frontend de registro.

> Documentación → [`docs/INDEX.md`](./docs/INDEX.md)

---

## Requisitos

| Herramienta | Versión |
|---|---|
| [Node.js](https://nodejs.org/) | 20 LTS+ |
| [Bun](https://bun.sh) | Latest |
| [Supabase](https://supabase.com/) | Proyecto con PostgreSQL |
| [Discord Developer](https://discord.com/developers/applications) | Bot token + Application ID |
| Google Cloud | Service account con acceso a Sheets (fase participantes) |

---

## Instalación

```bash
cd bot
bun install
```

---

## Configuración

### 1. Variables del bot

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_GUILD_ID` | Guild de dev (registro instantáneo de comandos) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — **solo servidor**, nunca cliente |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON del service account (fase participantes) |
| `CHALLONGE_KEY_ENCRYPTION_SECRET` | Clave para encriptar API keys de Challonge en DB |

### 2. Variables de Prisma (migraciones)

```bash
cp ../prisma/.env.example ../prisma/.env
```

En Supabase → **Settings → Database → Connection string**:

| Variable | Connection string | Uso |
|---|---|---|
| `DATABASE_URL` | Transaction pooler (puerto `6543`) | Prisma migrate |
| `DIRECT_URL` | Session/direct (puerto `5432`) | Migraciones |

### 3. Base de datos — primera vez

Desde `bot/`:

```bash
bun run db:push      # desarrollo — schema completo
# o, con migraciones versionadas:
bun run db:migrate   # producción — incluye UNIQUE en match_rooms.match_id
```

Schema y tablas: [`docs/DATABASE.md`](./docs/DATABASE.md).

---

## Desarrollo

```bash
cd bot
bun run dev
```

El bot registra slash commands en `DISCORD_GUILD_ID` si está definido. Comando de prueba: `/ping` (latencia + conexión Supabase).

---

## Scripts

| Comando | Descripción |
|---|---|
| `bun run dev` | Bot con watch |
| `bun run start` | Bot sin watch |
| `bun run build` | Compilar TypeScript |
| `bun run lint` | `tsc --noEmit` |
| `bun run db:push` | Sincronizar schema con Supabase (dev) |
| `bun run db:migrate` | Aplicar migraciones (prod) |
| `bun run db:generate` | Generar Prisma client (opcional — bot no lo usa en runtime) |

---

## Arquitectura

```text
bot/      → discord.js + supabase-js (runtime)
prisma/   → Prisma CLI (solo migraciones)
docs/     → Documentación
```

- **Runtime:** `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY`
- **Migraciones:** Prisma — el bot **no** importa `@prisma/client`
- **Participantes:** Google Sheets (`tournaments.sheet_link`)
- **Comandos:** spec en [`docs/COMMANDS.md`](./docs/COMMANDS.md)

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/CONTEXT.md`](./docs/CONTEXT.md) | Arquitectura y roadmap |
| [`docs/AGENTS.md`](./docs/AGENTS.md) | Reglas de desarrollo |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Schema Supabase |
| [`docs/COMMANDS.md`](./docs/COMMANDS.md) | Slash commands |
