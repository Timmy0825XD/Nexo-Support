# Nexo Support

Bot monolítico de Discord para gestionar torneos competitivos de **Modern Warships**. Acceso directo a **Supabase**, participantes vía **Google Sheets**, sin API REST ni frontend de registro.

> Documentación → [`docs/INDEX.md`](./docs/INDEX.md)

---

## Requisitos

| Herramienta | Versión |
|---|---|
| [Node.js](https://nodejs.org/) | 20 LTS+ |
| [npm](https://www.npmjs.com/) | Incluido con Node 20+ |
| [Supabase](https://supabase.com/) | Proyecto con PostgreSQL |
| [Discord Developer](https://discord.com/developers/applications) | Bot token + Application ID |
| Google Cloud | Service account con acceso a Sheets (fase participantes) |

---

## Instalación

Desde la raíz del repositorio:

```bash
npm install
```

---

## Configuración

### 1. Variables del bot

```bash
cp bot/.env.example bot/.env
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
cp prisma/.env.example prisma/.env
```

En Supabase → **Settings → Database → Connection string**:

| Variable | Connection string | Uso |
|---|---|---|
| `DATABASE_URL` | Transaction pooler (puerto `6543`) | Prisma migrate |
| `DIRECT_URL` | Session/direct (puerto `5432`) | Migraciones |

### 3. Base de datos — primera vez

Desde la raíz:

```bash
npm run db:push      # desarrollo — schema completo
# o, con migraciones versionadas:
npm run db:migrate   # producción — incluye UNIQUE en match_rooms.match_id
```

Schema y tablas: [`docs/DATABASE.md`](./docs/DATABASE.md).

---

## Desarrollo

```bash
npm run dev
```

El bot registra slash commands en `DISCORD_GUILD_ID` si está definido. Comando de prueba: `/ping` (latencia + conexión Supabase).

---

## Despliegue (Wispbyte)

1. Imagen Docker: **Node.js** (20+).
2. Sube el repositorio completo (raíz con `package.json` e `index.js`). No subas `node_modules` ni `.env`.
3. En **Startup**: comando `npm start` (o `node index.js`).
4. Pega las variables de entorno en el panel (las mismas de `bot/.env.example`).
5. Arranca el servidor: el panel ejecuta `npm install` y luego el comando de inicio.

Migraciones de base de datos (una vez, con `DATABASE_URL` / `DIRECT_URL`): `npm run db:migrate`.

---

## Despliegue (Hidden Cloud / Pterodactyl)

El egg de este host **no clona GitHub al reinstalar**: solo deja `startup.js`. El clone lo hace ese archivo al arrancar.

1. Imagen: **Nodejs 20+** (23 sirve).
2. **Main file:** `startup.js` (no `index.js`).
3. **User uploaded files:** da igual; deja el `startup.js` que crea el egg o pega el de este repo.
4. **Git repo address:** `https://github.com/Timmy0825XD/Nexo-Support.git`
5. **Install branch:** `chore/npm-start-wispbyte` (hasta mergear a `develop`).
6. **Auto update:** ON
7. Start. El bootstrap clona en `nexo-support/`, corre `npm install` y arranca el bot.
8. En Files crea `nexo-support/bot/.env` con las variables de `bot/.env.example`. Reinicia.

---

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Bot con watch |
| `npm start` | Bot en producción (Node + TypeScript) |
| `npm run build` | Compilar TypeScript |
| `npm run lint` | `tsc --noEmit` |
| `npm run db:push` | Sincronizar schema con Supabase (dev) |
| `npm run db:migrate` | Aplicar migraciones (prod) |
| `npm run db:generate` | Generar Prisma client (opcional — bot no lo usa en runtime) |

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
