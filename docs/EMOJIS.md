# Custom Emojis — Bot embeds

Referencia de emojis personalizados usados en las respuestas del bot. **Siempre importar desde código** — no hardcodear IDs en cada comando.

> Implementación en código: [`bot/src/constants/emojis.ts`](../bot/src/constants/emojis.ts)

---

## Reglas de uso

- Respuestas del bot en **inglés**, claras y coherentes.
- Preferir **embeds** sobre texto plano para respuestas informativas.
- Usar el emoji según su **propósito**, no decorar al azar.
- Éxito → `done` · Error → `error` · Métricas → emoji correspondiente.
- Si se agrega un emoji nuevo, actualizar **esta tabla** y `emojis.ts`.

---

## Catálogo

| Key | Markdown | ID | Propósito |
|---|---|---|---|
| `done` | `<a:done:1514103465851359243>` | `1514103465851359243` | Proceso finalizado con éxito |
| `error` | `<:error:1514105588949454949>` | `1514105588949454949` | Ocurrió un error |
| `latency` | `<:latency:1514106143448891535>` | `1514106143448891535` | Info general de ping / latencia |
| `webSocket` | `<:web_socket:1514106335493619742>` | `1514106335493619742` | WebSocket ping |
| `botPing` | `<a:bot_ping:1513762217147895919>` | `1513762217147895919` | Bot latency |
| `database` | `<:database:1514106679753707672>` | `1514106679753707672` | Estado o info de base de datos |
| `servers` | `<:servers:1514107674554531850>` | `1514107674554531850` | Info de servidores (guilds) |

---

## Ejemplo en embed

```typescript
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';

embed.addFields({
  name: `${CUSTOM_EMOJIS.botPing} Bot Latency`,
  value: `${botLatency}ms`,
  inline: true,
});
```

---

## Notas

- Los emojis deben existir en un servidor donde el bot tenga acceso, o como emojis de la aplicación.
- Este catálogo se ampliará conforme se implementen más comandos.
