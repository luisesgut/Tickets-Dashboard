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

### Two applications, one build

`App.js` renders **two different products**, chosen by the signed-in person's role:

```
login → GET /auth/yo → perfil.es_ti ?  dashboard de TI (the work queue)
                                     :  <PortalUsuario/>  (raise + follow my tickets)
```

- `perfil` — `{email, nombre, rol, area, whatsapp, es_ti}`; filled by `/auth/yo` on boot
  or by the login/registro response.
- `esTI` — derived once, right next to `perfil`. **It gates the TI-only effects**: the
  sentinel polling and the browser notifications. Without that gate the portal would fire
  a 403 request every 10 seconds.
- The render branch (`if (perfil && !perfil.es_ti) return <PortalUsuario/>`) only *picks a
  view*. The real authorization is the backend's 403 — never rely on the branch for it.
- Boot validates the stored token against **`/auth/yo`, not `/stats`**: `/stats` is IT-only
  now and would 403 an administrative user with a perfectly good session, bouncing them to
  the login screen on every reload.

### Login and the forced password change

People sign in with their **username** from the previous help desk (`usuarioInput` →
`POST /auth/login {usuario, password}`). The screen (`bf-lg-*`, shared by IT and users)
says so up front, and has a show-password toggle (`verPassword`). **There is no "create
account" in the UI** (Luis, 2026-10-26): accounts come from the old catalog, and whoever
didn't have one asks IT ("¿No tenías cuenta…? Contáctanos"). `POST /auth/registro` still
exists in the backend. If `perfil.debe_cambiar_password` is true, `<CambiarPassword>`
replaces the whole app until `POST /mi/password` succeeds. Tests: `Login.test.js`.

### PortalUsuario — what an administrative user sees

Designed as "propuesta C" in the "Portal de tickets móvil" canvas. **Responsive, and it
changes shape, not just size** (`useEsEscritorio`, `ESCRITORIO = (min-width: 960px)`):

- **Phone / tablet**: one screen at a time (`vista`), the flows below.
- **Computer**: a top bar (brand, name · area, Salir) over a two-column grid — the flow in
  `.bf-pt-principal` and "Mis tickets" always visible in the `<aside>` (`contenidoMis`,
  the same JSX the phone's "mis" screen uses). `vistaPrincipal` maps `"mis"` to `"tema"`
  there, since the list is already on the side; a ticket opens in the main column and is
  marked in the list (`FilaPortal seleccionado`). Styles: `.escritorio …` overrides.
  The admins use it on desktop as much as on phones (Luis, 2026-10-26) — don't regress
  it to a centered phone column.

```
tema (home: "¿Qué está fallando?")  → detalles (paso 2) → enviado → vincular
   └ "Mis tickets" → mis (Abiertos / Resueltos) → detalle
```

| Piece | Why it's there |
|---|---|
| `TEMAS_PORTAL` | The 6 tiles of step 1, in people's words ("Mi equipo", not "Hardware"). Each maps to a backend category (`CATEGORIAS_PORTAL`); "No sé / otro" sends none and the backend infers it. A category the backend no longer lists is dropped, not sent. Each tema carries quick `sugerencias` (tap = written into the text) and an `ayuda` prompt |
| One required field | The old system was a single input. Step 1 is one tap (and "No sé" is always there); only `descripcion` (≥ 10 chars) is required. The area is asked only when the profile has none |
| `ESTADO_USUARIO` | Translates machine states into the user's language. `WAITING_FOR_USER` reads "Te preguntaron"; the raw state is **never** shown. Each entry carries `sigue` — whose court the ball is in |
| `Avance` | 4-step bar (Recibido → Asignado → En proceso → Resuelto) from `avanceDe(estado)`; `WAITING_FOR_USER` counts as "En proceso" |
| `asignado_nombre` | The technician's name, not their id. "Carlos Méndez lo está atendiendo" prevents most "¿cómo va mi ticket?" interruptions |
| Waiting first | In "Mis tickets" and as the home's bottom banner, a `WAITING_FOR_USER` ticket comes first ("Carlos necesita tu respuesta para seguir →") |
| Folio on success | A big `BFX-0301` the user can quote |
| Linking, after sending | The WhatsApp invitation is no longer a banner on every visit: it's asked on the "enviado" screen (the moment they want to hear back) and as a small card in "Mis tickets". Copy promises only what the backend does: the *resolved* notice + buttons reach WhatsApp; assignment goes by email when there is one |
| `vincular` screen | Requests the code on entry, counts down `expira_minutos`, and polls `/mi/perfil` every 4 s (and on `visibilitychange`, i.e. coming back from WhatsApp) so it flips to "Tu WhatsApp quedó ligado" by itself. Fallback: `numero_bot` formatted by `numeroLegible` |
| 20s refresh | One person's tickets, not the whole queue, so no sentinel needed. Pauses on `document.hidden` like the IT dashboard |

Portal styles are the `bf-pt-*` block at the end of the `CSS` string. Its primary orange
is **#B9531F**, not `C.naranja`: white on #D06430 is 3.8:1 and fails WCAG AA; #B9531F is
4.9:1. Muted text is #566F6D (passes on both white and `C.bg`). Inputs are 16 px so iOS
Safari doesn't zoom on focus.

### Role-aware test mocks

`global.fetch` **must answer `/auth/yo`** or the app can't decide which view to render and
every dashboard test renders the portal into an empty div. `App.test.js` and
`Conversacion.test.js` return `es_ti: true`; `Portal.test.js` returns `es_ti: false` and
asserts the portal never touches an IT endpoint (filtering out `/mi/*`, which also ends in
`/tickets`).

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

### Loading states (required for every endpoint call)

Every control that hits the API must show it is working. Two primitives at the top of
App.js cover all of them — **use these instead of adding another ad-hoc `useState`**:

- **`<BotonAccion>`** — drop-in replacement for `<button>`. Disables itself and swaps its
  label for a spinner while `onClick`'s promise is pending, so double-clicks can't fire a
  second POST. Props beyond a normal button:
  - `cargandoTexto` — text shown next to the spinner. Omit to reuse `children`; pass `""`
    for icon-only buttons.
  - `confirmar` — a string; runs `window.confirm` with it before executing.
- **`useAccion()`** — returns `[cargando, ejecutar]` for controls that aren't buttons
  (`<select>`, `<input type="file">`). `BotonAccion` is built on it.

Both guard against `setState` on an unmounted component: deleting a ticket unmounts its
own panel while the request is still in flight.

**`onClick` must return the promise** — `() => onPatch(...)`, not `() => { onPatch(...) }` —
or the spinner disappears immediately. For the same reason every handler in App awaits its
refetch (`await fetchData()`), so the spinner covers the refresh too, not just the mutation.

Exception that manages its own indicator: the header's Sincronizar button (`syncing` +
`bf-spin`).

### Casos activos: the queue model

The tickets view is a **work queue grouped by urgency**, not a chronological list.
`grupoDe(t)` assigns every ticket to exactly one group — the order of its `if`s is the rule:

| group | rule |
|---|---|
| `sin_atender` | active and `!asignado_a` — nobody owns it |
| `esperando` | assigned and `WAITING_FOR_USER` |
| `en_progreso` | assigned, any other active state |
| `resueltos` | terminal state |

`filtro` holds the **selected** group (default `sin_atender`), picked in the sidebar. The
list renders **only that group** with `<FilaExpandida>` (age, area, inline
Tomar/Asignar/Recordar) — the other groups don't peek in, so the queue doesn't get crowded
(Luis's call). An empty group shows "Nada en «…»" even when other groups have tickets.

**Waiting time is the primary metric.** `edadMs`/`textoEdad`/`colorEdad` read `fecha_iso`
(UTC, from `Ticket.fecha`) — never the display string `fecha`, which renders UTC as if it
were local. `colorEdad` ramps amber → orange → red at 1 h and 4 h. A 30-second `ahora`
tick keeps the ages moving without any network call.

The **sidebar is a filter rail, not navigation**: the four groups with counts, area chips
built from active tickets (`areaFiltro`), and per-agent load bars. Configuración
lives in a secondary footer block. (The Guías view was removed from the dashboard.) There are no KPI cards — the counts live in the rail,
and `GET /stats` is no longer fetched on sync.

**"Tomar yo"** appears only when `localStorage.bf_nombre` matches an agent's `nombre`
(`miAgenteId`); dashboard users and the `agentes` table are separate, so the match is by
name and the button simply hides when there is none. `Asignar a…` always works.

### Phone layout (≤ 720 px)

Technicians work the queue from their phones, so the IT dashboard can't hide its
navigation behind "rotate your phone":

- **The sidebar becomes a drawer.** `.bf-mtop` (sticky top bar, only shown ≤ 720 px) has
  the ☰ button with the *sin atender* count; `menuAbierto` slides `.bf-sidebar` in over a
  `.bf-scrim`. Any `button` clicked inside the drawer closes it (one `onClick` on the
  `<aside>` with `closest("button")`), so new sidebar controls get that for free.
- **List *or* detail, never stacked** (≤ 1080 px, where the grid is one column):
  `.bf-cola-work.con-detalle` hides the list, otherwise the detail is hidden. Opening a
  ticket scrolls to the top; the detail's ✕ goes back. `.bf-main.con-detalle` hides the
  search/sync header ≤ 720 px. The Configuración view also uses `.bf-work` but not
  `.bf-cola-work`, so it simply stacks its two panels.
- `.bf-work` is `minmax(0,1fr)` in one column — plain `1fr` lets the longest nowrap text
  widen the page past the viewport.
- The list body drops its fixed `max-height` on phones: the page scrolls, not a box.

### Sync model (sentinel polling)

`fetchData()` is no longer on a blind 10-second timer. Every `POLL_MS` the app hits
`GET /tickets/version` (~40 bytes) and only calls `fetchData()` when the signature changed;
polling also pauses while `document.hidden` and resumes on `visibilitychange`.

Consequences to keep in mind when editing:

- `versionRef` is refreshed **inside `fetchData`** (it fetches `/tickets/version` alongside
  the rest), so any action that calls `fetchData` leaves the sentinel in sync — no redundant
  refetch on the next tick.
- **The ticket list has no `historial`.** It carries `preview`; `ultimoMensaje()` reads that
  and only falls back to `historial` for the full detail object. The conversation comes from
  `fetchTicketDetalle()` → `ticketDetalle`, and `ticketSeleccionado` merges the list row
  (source of truth for every scalar field) with `historial` from the detail.
- `fetchData` re-fetches the open ticket's detail (`selectedIdRef`) so the conversation stays
  live. Image blobs are **not** re-downloaded on every sync — `imgsCargadasRef` compares the
  image id list and only rebuilds the object URLs when it actually changed.
- While the detail is in flight, `cargandoHistorial` shows a spinner instead of the
  "Aún no hay mensajes" empty state, which would otherwise flash on every open.

### Components

| Component | Description |
|---|---|
| `App` | Root. All state, all fetching, polling every 10s. |
| `EstadoBadge` | Status pill — looks up `ESTADO_META` dynamically. |
| `DetalleTicket` | Right-panel detail view. `key={ticket.id}` resets local state on ticket change. |
| `GestorCuentas` | **Admin only** (`perfil.rol === "admin"`, sidebar "Cuentas"). Accounts (search, active/deactivated, role filter, inline edit, new account with initial password) + the area catalog (create, rename, deactivate). Loads its own data from `/personas` and `/areas-cuenta`, like the portal does; the backend validates everything and its `detail` is shown as-is. Deactivate, never delete. Tests: `Cuentas.test.js` |
| `GestorConfig` | Configuration view: agents panel (name, WhatsApp, email, and two independent toggles **Avisos por correo / Avisos por WhatsApp** — each covers new-ticket and assignment notices) + whitelist panel side by side. |
| `AvisosAgente` | The per-channel pills on an agent row. A channel that's on but has no address/number shows as off-colored ("correo: falta el correo"), because nothing actually reaches them. |
| `PortalUsuario` | The end-user app, one screen at a time (`vista`): pick a tema, describe, folio, link WhatsApp, Mis tickets, detail. Rendered instead of everything above when `rol === "usuario"`. |
| `Avance` | The 4-step progress bar of a ticket, for the user. |
| `FilaPortal` | One card in "Mis tickets" — folio, user-facing state, age, progress, who's on it (or that they're waiting for your answer), channel. |
| `DetallePortal` | Ticket detail for the requester: status in plain words, progress, conversation, reply box (hidden on terminal states). |

### App State

#### Auth
- `token` / `autenticado` / `loginChecking` — auth flow; token stored in `localStorage` as `bf_token`
- `perfil` — `{email, nombre, rol, area, whatsapp, es_ti}` or null; decides which app renders
- `esTI` — derived from `perfil.es_ti`; gates polling and notifications

#### Tickets
- `tickets` — `{[id]: ticket}` object; updated by 10s polling
- `stats` — `{total, abiertos, cerrados}` from `/stats`
- `agentes` — `{[id]: {nombre, whatsapp, email, avisos_correo, avisos_whatsapp, notificar, activo}}` from `/agentes` (`notificar` = either channel on; kept for old backends, the UI falls back to it with `??`)
- `selectedId` — selected ticket ID; `ticketSeleccionado` derived from this
- `auditLog` — state-change events for selected ticket; refreshed on `selectedId` change
- `selectedImagenes` — `[{id, mime_type, analisis, fecha, blobUrl}]` for selected ticket; blob URLs revoked on ticket change
- `filtro` — `"todos" | "abierto" | "cerrado"`
- `busqueda` — search string (filters by number or ticket ID)
- `syncing` — true during active fetch

#### Navigation
- `vista` — `"tickets" | "cuentas" | "config"` — determines which workspace to render

#### Configuration
- `configAgentes` — same shape, from `/agentes?todos=true`
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
| `fetchConfigAgentes()` | Fetches `/agentes?todos=true` |
| `fetchConfigUsuarios()` | Fetches `/usuarios` |
| `transicionarTicket(ticketId, nuevoEstado)` | `POST /tickets/{id}/transicion` |
| `patchTicket(ticketId, campos)` | `PATCH /tickets/{id}` |
| `asignarTicket(ticketId, agenteId)` | `PUT /tickets/{id}/asignar` |
| `cerrarTicket(id)` | `PUT /tickets/{id}/cerrar` |
| `enviarMensaje(ticketId, texto, actor)` | `POST /tickets/{id}/mensaje` |
| `crearAgente / actualizarAgente` | `POST/PATCH /agentes` |
| `agregarUsuario / desactivarUsuario` | `POST/DELETE /usuarios` |

### Browser Notifications

On authenticate: requests `Notification` permission. During each poll, if a ticket appears with `estado === "OPEN"` and `asignado_a === null` that wasn't in the previous poll set → fires `new Notification(...)` with the ticket ID and number. Uses `tag: t.id` to prevent duplicate stacking. First load is skipped (only detects changes in subsequent polls).

### Backend API

Base URL: `REACT_APP_API_URL` env var.

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/health` | Public health check |
| POST | `/auth/login` | `{usuario, password}` → `{token, nombre, rol, usuario, email, area, whatsapp, debe_cambiar_password}` |
| POST | `/mi/password` | `{actual, nueva}` |
| POST | `/auth/registro` | `{usuario, email, nombre, password, area?}` — enforces the company domain |
| GET | `/auth/yo` | Who am I + `es_ti`; called on boot to validate the token and pick the view |
| GET | `/mi/perfil` | Portal: account + linking status + category list |
| POST | `/mi/vinculacion` | Portal: linking code + `wa.me` link |
| DELETE | `/mi/vinculacion` | Portal: unlink |
| GET | `/mi/tickets` | Portal: my tickets, both channels, with `asignado_nombre` |
| GET | `/mi/tickets/:id` | Portal: one of mine (404 if it isn't) |
| POST | `/mi/tickets` | Portal: `{descripcion, categoria?, area?}` (the dashboard no longer captures or shows the machine) |
| POST | `/mi/tickets/:id/mensaje` | Portal: reply to IT |
| GET | `/personas` | Admin only: list accounts |
| POST | `/personas` | Admin only: new account `{usuario, nombre, password, email?, area?, whatsapp?, rol?}` |
| PATCH | `/personas/:id` | Admin only: `nombre`, `rol`, `area`, `email`, `whatsapp` (`""` unlinks), `activo` |
| GET/POST/PATCH | `/areas-cuenta` | Area catalog; reads for anyone, changes admin only |
| GET | `/tickets` | `?estado&prioridad&page&limit` — **IT only (403 for `rol: usuario`)** |
| GET | `/tickets/:id` | Single ticket + `imagenes: [{id, mime_type, analisis, fecha}]` |
| PATCH | `/tickets/:id` | `notas_internas`, `prioridad`, `resumen_ia`, `pasos_intentados` |
| POST | `/tickets/:id/transicion` | `{estado, actor?, notas?}` |
| GET | `/tickets/:id/eventos` | Audit log |
| PUT | `/tickets/:id/cerrar` | → RESOLVED + user notification |
| PUT | `/tickets/:id/asignar` | `{agente_id}` |
| POST | `/tickets/:id/mensaje` | `{texto, actor?}` — sends WhatsApp + records in historial |
| GET | `/stats` | `{total, abiertos, cerrados}` |
| GET | `/imagenes/:id` | Raw image bytes (auth required; use blob URL pattern) |
| GET | `/agentes` | `{[id]: {nombre, whatsapp, email, avisos_correo, avisos_whatsapp, notificar, activo}}`; `?todos=true` for inactive |
| POST | `/agentes` | `{id, nombre, whatsapp, email, avisos_correo, avisos_whatsapp}` |
| PATCH | `/agentes/:id` | `nombre`, `whatsapp`, `email`, `avisos_correo`, `avisos_whatsapp`, `activo` |
| GET | `/usuarios` | `{usuarios, whitelist_activa}` |
| POST | `/usuarios` | `{numero, nombre, area?}` |
| DELETE | `/usuarios/:numero` | Soft-delete |

### Ticket data shape

```js
{
  id: string,                  // "BFX-0001"
  numero: string,              // WhatsApp number (display as +{numero}); "" for portal
                               // tickets with no linked WhatsApp — check before using it
  nombre: string,
  categoria: string,
  descripcion: string | null,
  resumen_ia: string | null,
  prioridad: "baja" | "normal" | "alta" | "urgente",
  canal: string,               // "whatsapp"
  pasos_intentados: string | null,
  notas_internas: string | null,
  historial: [{ role: "user" | "assistant", content: string }],
  solicitante_email: string | null,  // joins a person's tickets across both channels
  asignado_nombre?: string | null,   // only on /mi/* — the technician's name, for the user
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
