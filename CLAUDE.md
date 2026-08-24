# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Dev server (http://localhost:3000)
npm run build    # Production build
npm test         # Run tests (Jest, watch mode by default)
npm test -- --watchAll=false  # Run tests once
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `REACT_APP_API_URL` | Backend base URL (default: Railway production URL hardcoded in App.js) |

## Architecture

Single-page Create React App (React 19). No routing, no state management library. The entire application lives in **`src/App.js`** — there is intentionally **no component file split**.

### Module-level constants

| Constant | Purpose |
|---|---|
| `C` | Corporate color palette — use these for all new UI |
| `ESTADO_META` | Maps ticket `estado` → `{label, bg, color, dot}` for all 7 states |
| `TRANSICIONES_UI` | Maps ticket `estado` → `[{estado, label}]` buttons shown in detail panel |
| `TRANS_COLOR` | Maps target estado → button accent color |
| `ESTADOS_ACTIVOS_SET` | Set of active states: OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_USER, REOPENED |
| `ESTADOS_TERMINALES_SET` | Set of terminal states: RESOLVED, CLOSED |
| `TEMPLATES_RAPIDOS` | Array of `{label, texto}` quick-reply templates for direct WhatsApp messaging |

### Components

| Component | Description |
|---|---|
| `App` | Root. All state, all fetching, polling every 10s. |
| `EstadoBadge` | Status pill — looks up `ESTADO_META` dynamically. |
| `DetalleTicket` | Right-panel detail view. `key={ticket.id}` resets local state on ticket change. |
| `GestorGuias` | Guide management view: list panel + editor panel side by side. |
| `EditorGuia` | Guide step editor: metadata, step list with inline edit, image upload per step. |
| `GestorConfig` | Configuration view: agents panel + whitelist panel side by side. |

### App State

#### Auth
- `token` / `autenticado` / `loginChecking` — auth flow; token stored in `localStorage` as `bf_token`

#### Tickets
- `tickets` — `{[id]: ticket}` object; updated by 10s polling
- `stats` — `{total, abiertos, cerrados}` from `/stats`
- `agentes` — `{[id]: {nombre, whatsapp, notificar, activo}}` from `/agentes`
- `selectedId` — selected ticket ID; `ticketSeleccionado` derived from this
- `auditLog` — state-change events for selected ticket; refreshed on `selectedId` change
- `selectedImagenes` — `[{id, mime_type, analisis, fecha, blobUrl}]` for selected ticket; blob URLs revoked on ticket change
- `filtro` — `"todos" | "abierto" | "cerrado"`
- `busqueda` — search string (filters by number or ticket ID)
- `syncing` — true during active fetch

#### Navigation
- `vista` — `"tickets" | "guias" | "config"` — determines which workspace to render

#### Guides
- `guias` — `[{id, titulo, activo}]` list; loaded when `vista === "guias"`
- `guiaSelId` — selected guide ID
- `guiaDetalle` — full guide `{id, titulo, descripcion_ticket, activo, pasos: [{id, orden, texto, tiene_imagen}]}`

#### Configuration
- `configAgentes` — `{[id]: {nombre, whatsapp, notificar, activo}}` from `/agentes?todos=true`
- `configUsuarios` — `[{numero, nombre, area, activo}]` from `/usuarios`
- `whitelistActiva` — bool from `/usuarios` response

#### Refs (no re-render)
- `blobUrlsRef` — tracks blob URLs to revoke on ticket change
- `notifGranted` — bool; true if Notification permission is granted
- `prevTicketIds` — Set of ticket IDs from last poll (for new-ticket detection)
- `initialLoadDone` — bool; prevents notifications on first load

### DetalleTicket local state

- `notas` — copy of `ticket.notas_internas`; "Guardar notas" appears when dirty
- `pasos` — copy of `ticket.pasos_intentados`; "Guardar pasos" appears when dirty
- `prioridad` — saved immediately on change via `PATCH /tickets/{id}`
- `imgExpanded` — imagen object for lightbox, `null` when closed
- `msgTexto` — draft text for direct WhatsApp message
- `msgEnviando` — bool; disables send button during request
- `msgFeedback` — `"ok" | "error" | null`; auto-clears after 2.5–3s

### Key Functions in App

| Function | What it does |
|---|---|
| `fetchData()` | Polls `/tickets`, `/stats`, `/agentes`; detects new OPEN tickets for browser notifications |
| `fetchAuditLog(ticketId)` | Fetches `/tickets/{id}/eventos` |
| `fetchTicketImagenes(ticketId)` | Fetches `/tickets/{id}` for imagenes list, then fetches each `/imagenes/{id}` as blob URL |
| `fetchGuias()` | Fetches `/guias` |
| `fetchGuiaDetalle(id)` | Fetches `/guias/{id}` |
| `fetchConfigAgentes()` | Fetches `/agentes?todos=true` |
| `fetchConfigUsuarios()` | Fetches `/usuarios` |
| `transicionarTicket(ticketId, nuevoEstado)` | `POST /tickets/{id}/transicion` |
| `patchTicket(ticketId, campos)` | `PATCH /tickets/{id}` |
| `asignarTicket(ticketId, agenteId)` | `PUT /tickets/{id}/asignar` |
| `cerrarTicket(id)` | `PUT /tickets/{id}/cerrar` |
| `enviarMensaje(ticketId, texto, actor)` | `POST /tickets/{id}/mensaje` |
| `crearGuia / actualizarGuia` | `POST/PUT /guias` |
| `crearPaso / actualizarPaso / eliminarPaso` | `POST/PUT/DELETE /guias/{id}/pasos` |
| `subirImagenPaso(guiaId, pasoId, file)` | `POST /guias/{id}/pasos/{paso_id}/imagen` (multipart) |
| `crearAgente / actualizarAgente` | `POST/PATCH /agentes` |
| `agregarUsuario / desactivarUsuario` | `POST/DELETE /usuarios` |

### Browser Notifications

On authenticate: requests `Notification` permission. During each poll, if a ticket appears with `estado === "OPEN"` and `asignado_a === null` that wasn't in the previous poll set → fires `new Notification(...)` with the ticket ID and number. Uses `tag: t.id` to prevent duplicate stacking. First load is skipped (only detects changes in subsequent polls).

### Backend API

Base URL: `REACT_APP_API_URL` env var.

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/health` | Public health check |
| GET | `/tickets` | `?estado&prioridad&page&limit` |
| GET | `/tickets/:id` | Single ticket + `imagenes: [{id, mime_type, analisis, fecha}]` |
| PATCH | `/tickets/:id` | `notas_internas`, `prioridad`, `resumen_ia`, `pasos_intentados` |
| POST | `/tickets/:id/transicion` | `{estado, actor?, notas?}` |
| GET | `/tickets/:id/eventos` | Audit log |
| PUT | `/tickets/:id/cerrar` | → RESOLVED + user notification |
| PUT | `/tickets/:id/asignar` | `{agente_id}` |
| POST | `/tickets/:id/mensaje` | `{texto, actor?}` — sends WhatsApp + records in historial |
| GET | `/stats` | `{total, abiertos, cerrados}` |
| GET | `/imagenes/:id` | Raw image bytes (auth required; use blob URL pattern) |
| GET | `/agentes` | `{[id]: {nombre, whatsapp, notificar, activo}}`; `?todos=true` for inactive |
| POST | `/agentes` | `{id, nombre, whatsapp, notificar}` |
| PATCH | `/agentes/:id` | `nombre`, `whatsapp`, `notificar`, `activo` |
| GET | `/usuarios` | `{usuarios, whitelist_activa}` |
| POST | `/usuarios` | `{numero, nombre, area?}` |
| DELETE | `/usuarios/:numero` | Soft-delete |
| GET | `/guias` | All guides (active + inactive) |
| POST | `/guias` | `{id, titulo, descripcion_ticket?}` |
| GET | `/guias/:id` | Guide + steps |
| PUT | `/guias/:id` | `titulo`, `descripcion_ticket`, `activo` |
| POST | `/guias/:id/pasos` | `{texto}` |
| PUT | `/guias/:id/pasos/:paso_id` | `{texto}` |
| DELETE | `/guias/:id/pasos/:paso_id` | Renumbers steps |
| POST | `/guias/:id/pasos/:paso_id/imagen` | Multipart file upload |
| GET | `/guias/:id/pasos/:orden/imagen` | **Public** — no auth (WhatsApp fetches directly) |

### Ticket data shape

```js
{
  id: string,                  // "BFX-0001"
  numero: string,              // WhatsApp number (display as +{numero})
  nombre: string,
  categoria: string,
  descripcion: string | null,
  resumen_ia: string | null,
  prioridad: "baja" | "normal" | "alta" | "urgente",
  canal: string,               // "whatsapp"
  pasos_intentados: string | null,
  notas_internas: string | null,
  historial: [{ role: "user" | "assistant", content: string }],
  estado: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED" | "REOPENED",
  asignado_a: string | null,   // agente id
  fecha: string,               // "dd/mm/yyyy HH:MM"
  fecha_cierre: string | null,
  imagenes?: [{ id: number, mime_type: string, analisis: string, fecha: string }]  // only on GET /tickets/:id
}
```

### Styling conventions

- All styles in the `CSS` template string at the bottom of `App.js` — **not** in `.css` files
- Class names use `bf-` prefix (Bioflex)
- `--accent` CSS custom property per KPI card for the left accent bar
- `--tc` CSS custom property per transition button for its accent color
- `App.css` and `index.css` exist from CRA boilerplate but are unused
- Authenticated images (`/imagenes/:id`) must be fetched with auth header and converted to blob URLs — never use directly as `<img src>`
