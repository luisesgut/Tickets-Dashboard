import { useState, useEffect, useMemo } from "react";

const API = "https://bot-tickets-bioflex-production.up.railway.app";

/* ──────────────────────────────────────────────────────────────
   Paleta corporativa
   ────────────────────────────────────────────────────────────── */
const C = {
  azulDark: "#153E3E",
  azulLight: "#85B6C4",
  naranja: "#D06430",
  amarillo: "#E2A343",
  rojo: "#B01A30",

  // Neutrales derivados (para que los colores de marca respiren)
  bg: "#F3F6F6",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFCFC",
  border: "#E2EAEA",
  borderStrong: "#D2DEDE",
  text: "#16302F",
  textMuted: "#5E7B79",
  textFaint: "#90A6A4",

  // Estados (versiones legibles sobre fondo claro)
  openText: "#B5781C",
  openBg: "rgba(226,163,67,0.14)",
  doneText: "#2E6E69",
  doneBg: "rgba(46,110,105,0.12)",
  urgentText: "#B01A30",
  urgentBg: "rgba(176,26,48,0.10)",
};

/* Helpers ------------------------------------------------------- */
const j = (url, opts) => fetch(url, opts).then((r) => r.json());

const iniciales = (nombre = "") =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

const AVATAR_COLORS = ["#D06430", "#2E6E69", "#B5781C", "#5C8A95", "#A03455"];
const colorPara = (key = "") => {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const ultimoMensaje = (t) => {
  const h = t?.historial;
  if (!h || !h.length) return "Sin mensajes todavía";
  const m = h[h.length - 1];
  const prefijo = m.role === "user" ? "" : "Bot: ";
  return prefijo + (m.content || "");
};

const TITULOS = {
  todos: "Bandeja de entrada",
  abierto: "Casos activos",
  cerrado: "Casos resueltos",
};

/* Iconos (SVG inline, trazo limpio) ----------------------------- */
const Icon = ({ d, size = 18, stroke = "currentColor", fill = "none", ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d}
  </svg>
);
const IcInbox = (p) => <Icon {...p} d={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>} />;
const IcPulse = (p) => <Icon {...p} d={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />} />;
const IcCheck = (p) => <Icon {...p} d={<path d="M20 6 9 17l-5-5" />} />;
const IcCheckCircle = (p) => <Icon {...p} d={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m22 4-10 10.01-3-3" /></>} />;
const IcRefresh = (p) => <Icon {...p} d={<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>} />;
const IcSearch = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />;
const IcPhone = (p) => <Icon {...p} d={<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />} />;
const IcClock = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />;
const IcUser = (p) => <Icon {...p} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />;
const IcX = (p) => <Icon {...p} d={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />;
const IcChat = (p) => <Icon {...p} d={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />} />;
const IcSliders = (p) => <Icon {...p} d={<><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>} />;

/* ──────────────────────────────────────────────────────────────
   Componente
   ────────────────────────────────────────────────────────────── */
function App() {
  const [tickets, setTickets] = useState({});
  const [stats, setStats] = useState({ total: 0, abiertos: 0, cerrados: 0 });
  const [agentes, setAgentes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [syncing, setSyncing] = useState(false);

  // El ticket seleccionado se deriva del estado actual → se mantiene
  // sincronizado con el polling (mensajes nuevos, cambio de estado, etc.)
  const ticketSeleccionado = selectedId ? tickets[selectedId] : null;

  const fetchData = async () => {
    setSyncing(true);
    try {
      const [ticketsRes, statsRes, agentesRes] = await Promise.all([
        j(`${API}/tickets`),
        j(`${API}/stats`),
        j(`${API}/agentes`),
      ]);
      setTickets(ticketsRes.tickets || {});
      setStats(statsRes || { total: 0, abiertos: 0, cerrados: 0 });
      setAgentes(agentesRes || {});
    } catch (e) {
      console.error("Error al sincronizar", e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const asignarTicket = async (ticketId, agenteId) => {
    try {
      await fetch(`${API}/tickets/${ticketId}/asignar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agente_id: agenteId }),
      });
      fetchData();
    } catch (e) {
      console.error("Error al asignar ticket", e);
    }
  };

  const cerrarTicket = async (id) => {
    try {
      await fetch(`${API}/tickets/${id}/cerrar`, { method: "PUT" });
      fetchData();
    } catch (e) {
      console.error("Error al cerrar ticket", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  /* Derivados ---------------------------------------------------- */
  const arr = useMemo(() => Object.values(tickets || {}), [tickets]);
  const nAbiertos = arr.filter((t) => t.estado === "abierto").length;
  const nCerrados = arr.filter((t) => t.estado === "cerrado").length;
  const nSinAsignar = arr.filter((t) => t.estado === "abierto" && !t.asignado_a).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return arr
      .filter((t) => filtro === "todos" || t.estado === filtro)
      .filter((t) =>
        !q ? true : String(t.numero).includes(q) || String(t.id).toLowerCase().includes(q)
      )
      .sort((a, b) =>
        a.estado === b.estado ? 0 : a.estado === "abierto" ? -1 : 1
      );
  }, [arr, filtro, busqueda]);

  const navItems = [
    { id: "todos", label: "Bandeja", icon: IcInbox, count: arr.length },
    { id: "abierto", label: "Activos", icon: IcPulse, count: nAbiertos },
    { id: "cerrado", label: "Resueltos", icon: IcCheck, count: nCerrados },
  ];

  const kpis = [
    { label: "Total recibidos", value: stats.total ?? arr.length, color: C.azulDark, tint: "rgba(21,62,62,0.08)", icon: IcInbox },
    { label: "Casos activos", value: stats.abiertos ?? nAbiertos, color: C.amarillo, tint: C.openBg, icon: IcPulse },
    { label: "Resueltos", value: stats.cerrados ?? nCerrados, color: C.doneText, tint: C.doneBg, icon: IcCheckCircle },
    { label: "Sin asignar", value: nSinAsignar, color: C.rojo, tint: C.urgentBg, icon: IcUser },
  ];

  /* Render ------------------------------------------------------- */
  return (
    <div className="bf-app">
      <style>{CSS}</style>

      {/* ───── Sidebar ───── */}
      <aside className="bf-sidebar">
        <div className="bf-brand">
          <div className="bf-logo">b</div>
          <div>
            <div className="bf-brand-name">bioflex</div>
            <div className="bf-brand-tag">Mesa de Soporte TI</div>
          </div>
        </div>

        <nav className="bf-nav">
          {navItems.map((item) => {
            const active = filtro === item.id;
            return (
              <button
                key={item.id}
                className={`bf-nav-item${active ? " is-active" : ""}`}
                onClick={() => setFiltro(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                <span className="bf-nav-count">{item.count}</span>
              </button>
            );
          })}
        </nav>

        <div className="bf-side-section">
          <div className="bf-side-label">Equipo TI</div>
          <div className="bf-team">
            {Object.keys(agentes).length === 0 ? (
              <p className="bf-team-empty">Sin agentes registrados</p>
            ) : (
              Object.entries(agentes).map(([id, agente]) => (
                <div key={id} className="bf-team-row">
                  <div className="bf-avatar" style={{ background: colorPara(id) }}>
                    {iniciales(agente.nombre)}
                    <span className="bf-online" />
                  </div>
                  <div className="bf-team-info">
                    <span className="bf-team-name">{agente.nombre}</span>
                    <span className="bf-team-role">Disponible</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bf-side-footer">
          <span className={`bf-live-dot${syncing ? " is-busy" : ""}`} />
          <span>Sincronización en vivo · 10s</span>
        </div>
      </aside>

      {/* ───── Main ───── */}
      <main className="bf-main">
        {/* Header */}
        <header className="bf-header">
          <div>
            <h1 className="bf-title">{TITULOS[filtro]}</h1>
            <p className="bf-subtitle">
              {visibles.length} {visibles.length === 1 ? "ticket" : "tickets"} · canal WhatsApp
            </p>
          </div>
          <div className="bf-header-actions">
            <div className="bf-search">
              <IcSearch size={16} className="bf-search-ic" />
              <input
                placeholder="Buscar por número o folio…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button className="bf-sync" onClick={fetchData} disabled={syncing}>
              <IcRefresh size={16} className={syncing ? "bf-spin" : ""} />
              {syncing ? "Sincronizando" : "Sincronizar"}
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section className="bf-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="bf-kpi" style={{ "--accent": k.color }}>
              <div className="bf-kpi-icon" style={{ background: k.tint, color: k.color }}>
                <k.icon size={20} />
              </div>
              <div>
                <div className="bf-kpi-label">{k.label}</div>
                <div className="bf-kpi-value">{k.value}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Workspace */}
        <section className="bf-work">
          {/* Lista */}
          <div className="bf-panel bf-list">
            <div className="bf-panel-head">
              <IcSliders size={16} />
              <span>Tickets ({visibles.length})</span>
            </div>

            <div className="bf-list-body bf-scroll">
              {loading ? (
                [0, 1, 2, 3].map((i) => <div key={i} className="bf-skel" />)
              ) : visibles.length === 0 ? (
                <div className="bf-empty">
                  <div className="bf-empty-ic"><IcCheckCircle size={28} /></div>
                  <p className="bf-empty-title">Bandeja al día</p>
                  <p className="bf-empty-text">
                    {busqueda
                      ? "Ningún ticket coincide con tu búsqueda."
                      : "Los tickets aparecen aquí en automático cuando el bot necesita un humano."}
                  </p>
                </div>
              ) : (
                visibles.map((ticket) => {
                  const isSelected = selectedId === ticket.id;
                  const abierto = ticket.estado === "abierto";
                  const agente = agentes[ticket.asignado_a];
                  const sinAsignar = abierto && !ticket.asignado_a;
                  return (
                    <button
                      key={ticket.id}
                      className={`bf-card${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <div className="bf-card-top">
                        <span className="bf-card-id">#{ticket.id}</span>
                        <EstadoBadge estado={ticket.estado} />
                      </div>

                      <p className="bf-card-preview">{ultimoMensaje(ticket)}</p>

                      <div className="bf-card-foot">
                        <span className="bf-card-meta">
                          <IcPhone size={13} /> +{ticket.numero}
                        </span>
                        {agente ? (
                          <span className="bf-card-agent">
                            <span className="bf-avatar bf-avatar-sm" style={{ background: colorPara(ticket.asignado_a) }}>
                              {iniciales(agente.nombre)}
                            </span>
                            {agente.nombre.split(" ")[0]}
                          </span>
                        ) : sinAsignar ? (
                          <span className="bf-pill-urgent">Sin asignar</span>
                        ) : (
                          <span className="bf-card-date"><IcClock size={12} /> {ticket.fecha}</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Detalle */}
          <div className="bf-panel bf-detail">
            {!ticketSeleccionado ? (
              <div className="bf-detail-empty">
                <div className="bf-empty-ic"><IcChat size={30} /></div>
                <p className="bf-empty-title">Selecciona un ticket</p>
                <p className="bf-empty-text">Elige un caso de la bandeja para ver la conversación y asignarlo.</p>
              </div>
            ) : (
              <DetalleTicket
                ticket={ticketSeleccionado}
                agentes={agentes}
                onClose={() => setSelectedId(null)}
                onAsignar={asignarTicket}
                onResolver={cerrarTicket}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* Subcomponentes ------------------------------------------------ */
function EstadoBadge({ estado }) {
  const abierto = estado === "abierto";
  return (
    <span
      className="bf-badge"
      style={{
        background: abierto ? C.openBg : C.doneBg,
        color: abierto ? C.openText : C.doneText,
      }}
    >
      <span className="bf-badge-dot" style={{ background: abierto ? C.amarillo : "#4F9089" }} />
      {abierto ? "Abierto" : "Resuelto"}
    </span>
  );
}

function DetalleTicket({ ticket, agentes, onClose, onAsignar, onResolver }) {
  const abierto = ticket.estado === "abierto";
  const agente = agentes[ticket.asignado_a];

  return (
    <>
      <div className="bf-detail-head">
        <div>
          <div className="bf-detail-id">
            Caso #{ticket.id} <EstadoBadge estado={ticket.estado} />
          </div>
          <p className="bf-detail-sub">Origen · WhatsApp Business</p>
        </div>
        <button className="bf-icon-btn" onClick={onClose} aria-label="Cerrar detalle">
          <IcX size={18} />
        </button>
      </div>

      <div className="bf-meta-grid">
        <div className="bf-meta">
          <span className="bf-meta-k"><IcPhone size={13} /> Usuario</span>
          <span className="bf-meta-v">+{ticket.numero}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k"><IcClock size={13} /> Apertura</span>
          <span className="bf-meta-v">{ticket.fecha}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k"><IcUser size={13} /> Asignado</span>
          <span className="bf-meta-v">{agente ? agente.nombre : "—"}</span>
        </div>
      </div>

      <div className="bf-chat-label">Historial de la conversación</div>
      <div className="bf-chat bf-scroll">
        {(!ticket.historial || ticket.historial.length === 0) && (
          <p className="bf-chat-empty">Aún no hay mensajes en este ticket.</p>
        )}
        {ticket.historial?.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={i} className={`bf-msg-row ${isUser ? "is-user" : "is-bot"}`}>
              <div className={`bf-bubble ${isUser ? "is-user" : "is-bot"}`}>
                <span className="bf-bubble-author">{isUser ? "Empleado" : "Bot Bioflex"}</span>
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bf-assign">
        <label className="bf-assign-label">Miembro de TI asignado</label>
        <div className="bf-select-wrap">
          <select
            value={ticket.asignado_a || ""}
            onChange={(e) => onAsignar(ticket.id, e.target.value)}
          >
            <option value="" disabled>Selecciona un agente…</option>
            {Object.entries(agentes).map(([id, a]) => (
              <option key={id} value={id}>{a.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {abierto ? (
        <button className="bf-resolve" onClick={() => onResolver(ticket.id)}>
          <IcCheck size={18} /> Marcar como resuelto
        </button>
      ) : (
        <div className="bf-resolved-banner">
          <IcCheckCircle size={18} /> Caso resuelto
        </div>
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Estilos
   ────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.bf-app *{box-sizing:border-box;margin:0;padding:0}
.bf-app{
  display:flex;min-height:100vh;background:${C.bg};color:${C.text};
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.bf-app button{font-family:inherit}

/* Sidebar */
.bf-sidebar{
  width:264px;flex-shrink:0;background:${C.azulDark};color:#E8F0EF;
  display:flex;flex-direction:column;padding:24px 18px;
  position:sticky;top:0;height:100vh;
}
.bf-brand{display:flex;align-items:center;gap:12px;padding:0 6px 24px;}
.bf-logo{
  width:42px;height:42px;border-radius:12px;flex-shrink:0;
  background:${C.naranja};color:#fff;font-weight:800;font-size:22px;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 14px rgba(208,100,48,0.35);
}
.bf-brand-name{font-size:18px;font-weight:800;letter-spacing:-0.4px;line-height:1.1}
.bf-brand-tag{font-size:11px;color:${C.azulLight};font-weight:500;margin-top:2px;letter-spacing:.2px}

.bf-nav{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.bf-nav-item{
  display:flex;align-items:center;gap:12px;width:100%;
  padding:11px 14px;border:none;border-radius:11px;cursor:pointer;
  background:transparent;color:#B9CDCB;font-size:14px;font-weight:500;
  text-align:left;transition:all .15s ease;position:relative;
}
.bf-nav-item span:first-of-type{flex:1}
.bf-nav-item:hover{background:rgba(255,255,255,0.05);color:#fff}
.bf-nav-item.is-active{background:rgba(133,182,196,0.16);color:#fff}
.bf-nav-item.is-active::before{
  content:"";position:absolute;left:-18px;top:50%;transform:translateY(-50%);
  width:4px;height:20px;border-radius:0 4px 4px 0;background:${C.naranja};
}
.bf-nav-count{
  font-size:11px;font-weight:700;min-width:22px;height:20px;padding:0 6px;
  border-radius:10px;background:rgba(255,255,255,0.08);color:#C7D8D6;
  display:flex;align-items:center;justify-content:center;
}
.bf-nav-item.is-active .bf-nav-count{background:${C.naranja};color:#fff}

.bf-side-section{margin-top:28px;flex:1;min-height:0;display:flex;flex-direction:column}
.bf-side-label{
  font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
  color:#6E908D;padding:0 8px 12px;
}
.bf-team{display:flex;flex-direction:column;gap:6px;overflow-y:auto}
.bf-team-empty{font-size:12px;color:#6E908D;padding:0 8px}
.bf-team-row{display:flex;align-items:center;gap:11px;padding:7px 8px;border-radius:10px;transition:background .15s}
.bf-team-row:hover{background:rgba(255,255,255,0.04)}
.bf-team-info{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.bf-team-name{font-size:13px;font-weight:600;color:#EAF1F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-team-role{font-size:11px;color:${C.azulLight}}

.bf-avatar{
  position:relative;width:34px;height:34px;border-radius:10px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:12px;font-weight:700;
}
.bf-avatar-sm{width:20px;height:20px;border-radius:6px;font-size:9px}
.bf-online{
  position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;
  background:${C.azulLight};border:2px solid ${C.azulDark};
}

.bf-side-footer{
  display:flex;align-items:center;gap:8px;font-size:11.5px;color:#7C9C99;
  padding:14px 8px 2px;margin-top:14px;border-top:1px solid rgba(255,255,255,0.07);
}
.bf-live-dot{width:8px;height:8px;border-radius:50%;background:${C.azulLight};animation:bf-pulse 2s infinite}
.bf-live-dot.is-busy{background:${C.amarillo}}
@keyframes bf-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(133,182,196,.5)}50%{opacity:.6;box-shadow:0 0 0 5px rgba(133,182,196,0)}}

/* Main */
.bf-main{flex:1;min-width:0;padding:28px 34px 40px}

.bf-header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:26px}
.bf-title{font-size:26px;font-weight:800;letter-spacing:-0.6px;color:${C.azulDark}}
.bf-subtitle{font-size:13.5px;color:${C.textMuted};margin-top:4px}
.bf-header-actions{display:flex;align-items:center;gap:12px}

.bf-search{
  position:relative;display:flex;align-items:center;background:${C.surface};
  border:1px solid ${C.border};border-radius:12px;padding:0 14px;height:42px;
  width:280px;transition:border-color .15s, box-shadow .15s;
}
.bf-search:focus-within{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}
.bf-search-ic{color:${C.textFaint};flex-shrink:0;margin-right:10px}
.bf-search input{border:none;outline:none;background:transparent;font-size:13.5px;color:${C.text};width:100%}
.bf-search input::placeholder{color:${C.textFaint}}

.bf-sync{
  display:flex;align-items:center;gap:8px;height:42px;padding:0 18px;
  border-radius:12px;border:1px solid ${C.border};background:${C.surface};
  color:${C.azulDark};font-size:13.5px;font-weight:600;cursor:pointer;
  transition:all .15s;
}
.bf-sync:hover:not(:disabled){border-color:${C.azulLight};background:${C.surfaceAlt}}
.bf-sync:disabled{opacity:.65;cursor:default}
.bf-spin{animation:bf-spin .9s linear infinite}
@keyframes bf-spin{to{transform:rotate(360deg)}}

/* KPIs */
.bf-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:26px}
.bf-kpi{
  background:${C.surface};border:1px solid ${C.border};border-radius:16px;
  padding:20px;display:flex;align-items:center;gap:16px;position:relative;overflow:hidden;
  box-shadow:0 1px 2px rgba(21,62,62,0.04);transition:transform .15s, box-shadow .15s;
}
.bf-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent)}
.bf-kpi:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(21,62,62,0.08)}
.bf-kpi-icon{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bf-kpi-label{font-size:12px;font-weight:600;color:${C.textMuted};text-transform:uppercase;letter-spacing:.4px}
.bf-kpi-value{font-size:30px;font-weight:800;color:${C.azulDark};line-height:1.1;margin-top:3px;letter-spacing:-0.5px}

/* Workspace */
.bf-work{display:grid;grid-template-columns:minmax(340px,1fr) 1.25fr;gap:22px;align-items:start}
.bf-panel{background:${C.surface};border:1px solid ${C.border};border-radius:18px;box-shadow:0 1px 2px rgba(21,62,62,0.04)}
.bf-panel-head{
  display:flex;align-items:center;gap:9px;padding:18px 20px;
  border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.azulDark};
}
.bf-panel-head svg{color:${C.textMuted}}

/* Lista */
.bf-list-body{padding:12px;display:flex;flex-direction:column;gap:9px;max-height:calc(100vh - 320px);overflow-y:auto}
.bf-card{
  display:block;width:100%;text-align:left;cursor:pointer;
  padding:15px;border-radius:14px;border:1px solid ${C.border};
  background:${C.surface};transition:all .15s ease;
}
.bf-card:hover{border-color:${C.borderStrong};background:${C.surfaceAlt}}
.bf-card.is-selected{border-color:${C.naranja};background:rgba(208,100,48,0.04);box-shadow:0 0 0 1px ${C.naranja} inset}
.bf-card-top{display:flex;justify-content:space-between;align-items:center}
.bf-card-id{font-size:14px;font-weight:700;color:${C.azulDark}}
.bf-card-preview{
  font-size:13px;color:${C.textMuted};margin:9px 0 12px;line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.bf-card-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}
.bf-card-meta{display:flex;align-items:center;gap:5px;font-size:12.5px;color:${C.textMuted};font-weight:500}
.bf-card-meta svg{color:${C.textFaint}}
.bf-card-date{display:flex;align-items:center;gap:4px;font-size:11.5px;color:${C.textFaint}}
.bf-card-agent{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${C.azulDark}}

.bf-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:20px;font-size:11.5px;font-weight:700}
.bf-badge-dot{width:6px;height:6px;border-radius:50%}
.bf-pill-urgent{
  font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;
  background:${C.urgentBg};color:${C.urgentText};
}

/* Skeleton + empty */
.bf-skel{height:96px;border-radius:14px;background:linear-gradient(90deg,#EEF3F3 25%,#F6F9F9 50%,#EEF3F3 75%);background-size:200% 100%;animation:bf-shimmer 1.3s infinite}
@keyframes bf-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.bf-empty,.bf-detail-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:54px 28px;color:${C.textMuted}}
.bf-detail-empty{min-height:420px;justify-content:center}
.bf-empty-ic{width:60px;height:60px;border-radius:16px;background:${C.doneBg};color:${C.doneText};display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.bf-empty-title{font-size:15px;font-weight:700;color:${C.azulDark}}
.bf-empty-text{font-size:13px;color:${C.textMuted};max-width:260px;margin-top:6px;line-height:1.5}

/* Detalle */
.bf-detail{padding:22px 24px;display:flex;flex-direction:column}
.bf-detail-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.bf-detail-id{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800;color:${C.azulDark}}
.bf-detail-sub{font-size:12.5px;color:${C.textMuted};margin-top:5px}
.bf-icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid ${C.border};background:${C.surface};color:${C.textMuted};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.bf-icon-btn:hover{background:${C.surfaceAlt};color:${C.azulDark}}

.bf-meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${C.border};border:1px solid ${C.border};border-radius:14px;overflow:hidden;margin-bottom:22px}
.bf-meta{background:${C.surfaceAlt};padding:13px 15px;display:flex;flex-direction:column;gap:6px}
.bf-meta-k{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${C.textMuted};text-transform:uppercase;letter-spacing:.3px}
.bf-meta-k svg{color:${C.textFaint}}
.bf-meta-v{font-size:14px;font-weight:600;color:${C.azulDark}}

.bf-chat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${C.textMuted};margin-bottom:12px}
.bf-chat{background:${C.surfaceAlt};border:1px solid ${C.border};border-radius:16px;padding:16px;max-height:300px;overflow-y:auto;margin-bottom:22px}
.bf-chat-empty{font-size:13px;color:${C.textFaint};text-align:center;padding:24px 0}
.bf-msg-row{display:flex;margin-bottom:12px}
.bf-msg-row.is-user{justify-content:flex-end}
.bf-msg-row:last-child{margin-bottom:0}
.bf-bubble{max-width:76%;padding:11px 15px;font-size:13.5px;line-height:1.5;border:1px solid transparent}
.bf-bubble.is-bot{background:${C.surface};border-color:${C.border};color:${C.text};border-radius:4px 16px 16px 16px}
.bf-bubble.is-user{background:rgba(208,100,48,0.08);border-color:rgba(208,100,48,0.22);color:#7A3D22;border-radius:16px 16px 4px 16px}
.bf-bubble-author{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;opacity:.75}
.bf-bubble.is-bot .bf-bubble-author{color:${C.doneText}}
.bf-bubble.is-user .bf-bubble-author{color:${C.naranja}}

.bf-assign{margin-bottom:18px}
.bf-assign-label{display:block;font-size:12px;font-weight:600;color:${C.textMuted};margin-bottom:8px}
.bf-select-wrap{position:relative}
.bf-select-wrap::after{content:"";position:absolute;right:16px;top:50%;width:9px;height:9px;border-right:2px solid ${C.textMuted};border-bottom:2px solid ${C.textMuted};transform:translateY(-70%) rotate(45deg);pointer-events:none}
.bf-select-wrap select{
  width:100%;height:46px;padding:0 40px 0 16px;border-radius:12px;
  border:1px solid ${C.border};background:${C.surface};color:${C.text};
  font-size:14px;font-weight:500;cursor:pointer;appearance:none;outline:none;transition:border-color .15s, box-shadow .15s;
}
.bf-select-wrap select:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}

.bf-resolve{
  display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;
  border:none;border-radius:13px;cursor:pointer;background:${C.naranja};color:#fff;
  font-size:14.5px;font-weight:700;transition:all .15s;box-shadow:0 6px 18px rgba(208,100,48,0.28);
}
.bf-resolve:hover{background:#bb5526;box-shadow:0 8px 22px rgba(208,100,48,0.36)}
.bf-resolve:active{transform:translateY(1px)}
.bf-resolved-banner{
  display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;
  border-radius:13px;background:${C.doneBg};color:${C.doneText};font-size:14px;font-weight:700;
}

/* Scrollbars */
.bf-scroll::-webkit-scrollbar{width:8px}
.bf-scroll::-webkit-scrollbar-track{background:transparent}
.bf-scroll::-webkit-scrollbar-thumb{background:${C.borderStrong};border-radius:8px}
.bf-scroll::-webkit-scrollbar-thumb:hover{background:${C.azulLight}}

/* Responsive */
@media (max-width:1080px){
  .bf-work{grid-template-columns:1fr}
  .bf-kpis{grid-template-columns:repeat(2,1fr)}
}
@media (max-width:720px){
  .bf-sidebar{display:none}
  .bf-main{padding:20px}
  .bf-search{width:100%}
  .bf-header-actions{width:100%;flex-direction:column;align-items:stretch}
}
`;

export default App;