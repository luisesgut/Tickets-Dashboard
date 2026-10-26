import { useState, useEffect, useMemo, useRef } from "react";

const API =
  process.env.REACT_APP_API_URL ||
  "https://bot-tickets-bioflex-production.up.railway.app";

/* ──────────────────────────────────────────────────────────────
   Paleta corporativa
   ────────────────────────────────────────────────────────────── */
const C = {
  azulDark: "#153E3E",
  azulLight: "#85B6C4",
  naranja: "#D06430",
  amarillo: "#E2A343",
  rojo: "#B01A30",

  bg: "#F3F6F6",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFCFC",
  border: "#E2EAEA",
  borderStrong: "#D2DEDE",
  text: "#16302F",
  textMuted: "#5E7B79",
  textFaint: "#90A6A4",

  openText: "#B5781C",
  openBg: "rgba(226,163,67,0.14)",
  doneText: "#2E6E69",
  doneBg: "rgba(46,110,105,0.12)",
  urgentText: "#B01A30",
  urgentBg: "rgba(176,26,48,0.10)",
};

/* Helpers ------------------------------------------------------- */
const iniciales = (nombre = "") =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

// Cómo se contacta al solicitante. Los tickets del portal sin WhatsApp
// vinculado traen `numero: ""`, y "+" a secas no le dice nada a nadie.
const contactoDe = (t) =>
  t?.numero ? `+${t.numero}` : (t?.solicitante_email || "sin contacto directo");

const AVATAR_COLORS = ["#D06430", "#2E6E69", "#B5781C", "#5C8A95", "#A03455"];
const colorPara = (key = "") => {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// El listado ya no trae `historial` (era el 70% del payload); el backend manda
// `preview` ya recortado. El fallback cubre el detalle completo.
const ultimoMensaje = (t) => {
  if (t?.preview) return t.preview;
  const h = t?.historial;
  if (!h || !h.length) return "Sin mensajes todavía";
  const m = h[h.length - 1];
  const prefijo = m.role === "user" ? "" : "Bot: ";
  return prefijo + (m.content || "");
};

// Cada cuánto se le pregunta al centinela si algo cambió.
const POLL_MS = 10000;

/* ── Antigüedad de un ticket ──────────────────────────────────────
   `fecha_iso` viene en UTC desde el backend (Ticket.fecha usa utcnow).
   El tiempo de espera es el dato que manda esta pantalla, así que se
   calcula y se colorea aquí, no en cada componente. */
const UNA_HORA = 60 * 60 * 1000;

const ESCALA_EDAD = [
  { max: UNA_HORA,     color: "#B5781C" }, // menos de 1 h — recién llegado
  { max: 4 * UNA_HORA, color: "#A04E28" }, // menos de 4 h — ya pesa
  { max: Infinity,     color: "#B01A30" }, // 4 h o más   — urgente
];

const edadMs = (t, ahora = Date.now()) => {
  if (!t?.fecha_iso) return null;
  const ms = ahora - new Date(t.fecha_iso).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
};

const textoEdad = (ms) => {
  if (ms == null) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
};

// Los tres niveles se distinguen también en luminosidad, no sólo en matiz:
// quien no separa rojo de verde sigue leyendo cuál ticket lleva más tiempo.
const colorEdad = (ms) =>
  ms == null ? "#90A6A4" : ESCALA_EDAD.find((n) => ms < n.max).color;


const esDeHoy = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth()
    && d.getDate() === hoy.getDate();
};

/* ── Grupos de la cola de trabajo ─────────────────────────────────
   Cada ticket cae en exactamente uno; el orden de los ifs es la regla. */
const grupoDe = (t) => {
  if (ESTADOS_TERMINALES_SET.has(t.estado)) return "resueltos";
  if (!t.asignado_a) return "sin_atender";
  if (t.estado === "WAITING_FOR_USER") return "esperando";
  return "en_progreso";
};

const ESTADOS_ACTIVOS_SET = new Set(["OPEN","ASSIGNED","IN_PROGRESS","WAITING_FOR_USER","REOPENED"]);
const ESTADOS_TERMINALES_SET = new Set(["RESOLVED","CLOSED"]);

// Transiciones disponibles por estado para mostrar en el dashboard.
// OPEN y ASSIGNED ahora ofrecen "Pedir más info": en la mesa real se pregunta
// antes de empezar a trabajar, y el backend acepta esa transición.
const TRANSICIONES_UI = {
  OPEN:             [{ estado:"ASSIGNED",         label:"Asignar" }, { estado:"IN_PROGRESS", label:"Iniciar" }, { estado:"WAITING_FOR_USER", label:"Pedir más info" }, { estado:"CLOSED", label:"Archivar" }],
  ASSIGNED:         [{ estado:"IN_PROGRESS",      label:"Iniciar atención" }, { estado:"WAITING_FOR_USER", label:"Pedir más info" }, { estado:"RESOLVED", label:"Resolver" }, { estado:"CLOSED", label:"Archivar" }],
  IN_PROGRESS:      [{ estado:"WAITING_FOR_USER", label:"Pedir más info" }, { estado:"RESOLVED", label:"Resolver" }, { estado:"CLOSED", label:"Archivar" }],
  WAITING_FOR_USER: [{ estado:"IN_PROGRESS",      label:"Retomar" }, { estado:"RESOLVED", label:"Resolver" }, { estado:"CLOSED", label:"Archivar" }],
  RESOLVED:         [{ estado:"REOPENED",         label:"Reabrir" }, { estado:"CLOSED", label:"Archivar" }],
  CLOSED:           [{ estado:"REOPENED",         label:"Reabrir" }],
  REOPENED:         [{ estado:"IN_PROGRESS",      label:"Retomar" }, { estado:"ASSIGNED", label:"Asignar" }, { estado:"CLOSED", label:"Archivar" }],
  abierto:          [{ estado:"RESOLVED",         label:"Resolver" }],
  cerrado:          [{ estado:"REOPENED",         label:"Reabrir" }],
};

// Color por acción de transición
const TRANS_COLOR = {
  ASSIGNED:         "#2E6E69",
  IN_PROGRESS:      "#153E3E",
  WAITING_FOR_USER: "#D06430",
  RESOLVED:         "#2E6E69",
  CLOSED:           "#90A6A4",
  REOPENED:         "#B01A30",
};

// Valores de Ticket.satisfaccion (la encuesta de WhatsApp, ver CALIFICACIONES en db.py)
const CALIFICACION_UI = { bien: "😀 Bien", regular: "😐 Regular", mal: "😞 Mal" };

const TEMPLATES_RAPIDOS = [
  { label: "En atención",   texto: "Hola, tu caso ya está siendo atendido por nuestro equipo de TI. Te contactamos en breve. 👍" },
  { label: "¿Ya funcionó?", texto: "¿Pudiste resolver el problema? Por favor confirma para poder cerrar tu caso. ✅" },
  { label: "Reinicia equipo", texto: "Por favor reinicia tu equipo y vuelve a intentarlo. Si el problema persiste, avísanos." },
  { label: "Caso resuelto", texto: "Tu caso ha sido resuelto. Si el problema vuelve a ocurrir, responde este mensaje y con gusto te ayudamos. 🙌" },
];

const TITULOS = {
  sin_atender: "Sin atender",
  en_progreso: "En progreso",
  esperando: "Esperando al usuario",
  resueltos: "Resueltos",
};

const GRUPOS = [
  { id: "sin_atender", label: "Sin atender",          dot: "#D06430",
    sub: "Nadie los ha tomado todavía" },
  { id: "en_progreso", label: "En progreso",          dot: "#85B6C4",
    sub: "Con agente asignado" },
  { id: "esperando",   label: "Esperando al usuario", dot: "#E2A343",
    sub: "La pelota está del lado del operador" },
  { id: "resueltos",   label: "Resueltos",            dot: "#4F9089",
    sub: "Cerrados, del más reciente al más viejo" },
];


const ESTADO_META = {
  OPEN:               { label: "Abierto",    bg: "rgba(226,163,67,0.14)",  color: "#B5781C", dot: "#E2A343" },
  ASSIGNED:           { label: "Asignado",   bg: "rgba(133,182,196,0.18)", color: "#2E6E69", dot: "#85B6C4" },
  IN_PROGRESS:        { label: "En progreso",bg: "rgba(21,62,62,0.10)",    color: "#153E3E", dot: "#3D7A78" },
  WAITING_FOR_USER:   { label: "Esperando",  bg: "rgba(208,100,48,0.12)",  color: "#A04E28", dot: "#D06430" },
  REOPENED:           { label: "Reabierto",  bg: "rgba(176,26,48,0.10)",   color: "#B01A30", dot: "#B01A30" },
  RESOLVED:           { label: "Resuelto",   bg: "rgba(46,110,105,0.12)",  color: "#2E6E69", dot: "#4F9089" },
  CLOSED:             { label: "Cerrado",    bg: "rgba(94,123,121,0.12)",  color: "#5E7B79", dot: "#90A6A4" },
  // legacy
  abierto:            { label: "Abierto",    bg: "rgba(226,163,67,0.14)",  color: "#B5781C", dot: "#E2A343" },
  cerrado:            { label: "Resuelto",   bg: "rgba(46,110,105,0.12)",  color: "#2E6E69", dot: "#4F9089" },
};

/* Iconos (SVG inline) ------------------------------------------- */
const Icon = ({ d, size = 18, stroke = "currentColor", fill = "none", ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {d}
  </svg>
);
const IcRefresh = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </>
    }
  />
);
const IcCheckCircle = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m22 4-10 10.01-3-3" />
      </>
    }
  />
);
const IcChat = (p) => (
  <Icon
    {...p}
    d={
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    }
  />
);
const IcSettings = (p) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    }
  />
);
const IcSearch = (p) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    }
  />
);
const IcPhone = (p) => (
  <Icon
    {...p}
    d={
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    }
  />
);
const IcClock = (p) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    }
  />
);
const IcUser = (p) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    }
  />
);
const IcX = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    }
  />
);
const IcInfo = (p) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>} />
);
const IcOjo = (p) => (
  <Icon {...p} d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />
);
const IcOjoNo = (p) => (
  <Icon {...p} d={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>} />
);
const IcAtras = (p) => <Icon {...p} d={<polyline points="15 18 9 12 15 6"/>} />;
const IcSigue = (p) => <Icon {...p} d={<polyline points="9 18 15 12 9 6"/>} />;
const IcCheck = (p) => <Icon {...p} d={<polyline points="20 6 9 17 4 12"/>} />;
const IcCelular = (p) => (
  <Icon {...p} d={<><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>} />
);
const IcWhatsApp = (p) => (
  <Icon {...p} d={<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>} />
);
const IcBarras = (p) => (
  <Icon {...p} d={<><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="10"/></>} />
);
const IcMenu = (p) => (
  <Icon {...p} d={<><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>} />
);
const IcSliders = (p) => (
  <Icon
    {...p}
    d={
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    }
  />
);
const IcPlus = (p) => <Icon {...p} d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />;
const IcTrash = (p) => (
  <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>} />
);
const IcSend = (p) => (
  <Icon {...p} d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>} />
);
const IcLogout = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    }
  />
);

/* ──────────────────────────────────────────────────────────────
   Componente principal
   ────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
   Estado de carga para acciones que pegan a un endpoint
   ────────────────────────────────────────────────────────────── */

const IcSpinner = (p) => (
  <Icon {...p} d={<path d="M21 12a9 9 0 1 1-6.22-8.56" />} />
);

/**
 * Corre una acción asíncrona exponiendo si está en vuelo.
 * - Ignora clics repetidos mientras corre (evita dobles POST).
 * - No actualiza estado si el componente ya se desmontó: eliminar un ticket
 *   cierra su panel, y sin esta guarda React avisa de un setState huérfano.
 */
function useAccion() {
  const [cargando, setCargando] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const ejecutar = async (fn) => {
    if (cargando) return;
    setCargando(true);
    try {
      return await fn();
    } catch (e) {
      console.error("Acción fallida", e);
    } finally {
      if (vivo.current) setCargando(false);
    }
  };
  return [cargando, ejecutar];
}

/**
 * Botón que se bloquea y muestra spinner mientras su onClick esté pendiente.
 * `onClick` debe regresar la promesa de la llamada para que el spinner dure
 * lo que dura la petición (y su refresco).
 *   cargandoTexto: texto durante la carga. "" = solo spinner (botones de icono).
 *   confirmar: si viene, pide window.confirm antes de ejecutar.
 */
function BotonAccion({ onClick, confirmar, cargandoTexto, children, disabled, ...rest }) {
  const [cargando, ejecutar] = useAccion();

  const manejar = (e) => {
    if (cargando || disabled) return;
    if (confirmar && !window.confirm(confirmar)) return;
    return ejecutar(() => onClick(e));
  };

  return (
    <button {...rest} onClick={manejar} disabled={cargando || disabled}>
      {cargando ? (
        <span className="bf-btn-cargando">
          <IcSpinner size={14} className="bf-spin" />
          {cargandoTexto !== undefined ? cargandoTexto : children}
        </span>
      ) : children}
    </button>
  );
}

/* Primer ingreso con la contraseña del sistema anterior ---------- */
function CambiarPassword({ perfil, onListo, onLogout }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirmar) return setError("Las contraseñas nuevas no coinciden.");
    try {
      const res = await fetch(`${API}/mi/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("bf_token")}`,
        },
        body: JSON.stringify({ actual, nueva }),
      });
      const data = await res.json();
      if (res.ok) onListo();
      else setError(data.detail || "No se pudo cambiar la contraseña.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
  };

  const enter = (e) => e.key === "Enter" && guardar();
  return (
    <div className="bf-app bf-login-wrap">
      <style>{CSS}</style>
      <div className="bf-login-card">
        <div className="bf-logo-box">b</div>
        <h1 className="bf-login-title">Hola, {(perfil.nombre || "").split(" ")[0]}</h1>
        <p className="bf-login-sub">
          Antes de continuar, cambia la contraseña que usabas en la mesa de ayuda anterior.
        </p>
        <input type="password" className="bf-login-input" placeholder="Contraseña actual"
          autoComplete="current-password" value={actual} autoFocus
          onChange={(e) => setActual(e.target.value)} onKeyDown={enter} />
        <input type="password" className="bf-login-input" placeholder="Nueva contraseña (mínimo 8)"
          autoComplete="new-password" value={nueva}
          onChange={(e) => setNueva(e.target.value)} onKeyDown={enter} />
        <input type="password" className="bf-login-input" placeholder="Repite la nueva contraseña"
          autoComplete="new-password" value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)} onKeyDown={enter} />
        {error && <p className="bf-login-error">{error}</p>}
        <BotonAccion className="bf-resolve" style={{ width: "100%", marginTop: 4 }}
          onClick={guardar} cargandoTexto="Guardando…">
          Guardar y continuar
        </BotonAccion>
        <button
          style={{ background: "none", border: "none", color: "#607d8b", fontSize: 12, marginTop: 12, cursor: "pointer", textDecoration: "underline" }}
          onClick={onLogout}
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function App() {
  // ── Autenticación ────────────────────────────────────────────
  const [autenticado, setAutenticado] = useState(false);
  // Se entra con el usuario de la mesa de ayuda anterior ("jperez"). Las
  // cuentas vienen de ese catálogo: quien no tenía una se la pide a TI, así que
  // la pantalla ya no ofrece crearla (POST /auth/registro sigue en el backend).
  const [usuarioInput, setUsuarioInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  // Quién entró y qué puede ver. Lo llena /auth/yo al arrancar o el login.
  const [perfil, setPerfil] = useState(null);
  // Separa las dos aplicaciones: con TI corren el polling de la cola y las
  // notificaciones; sin él se pinta el portal y nada de eso arranca.
  const esTI = !!perfil?.es_ti;

  // loginChecking=true mientras verificamos el token guardado en localStorage
  const [loginChecking, setLoginChecking] = useState(
    !!localStorage.getItem("bf_token")
  );

  // ── Estado del dashboard ─────────────────────────────────────
  const [vista, setVista] = useState("tickets"); // "tickets" | "uso" | "cuentas" | "config"
  const [tickets, setTickets] = useState({});
  const [agentes, setAgentes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("sin_atender"); // grupo enfocado de la cola
  const [areaFiltro, setAreaFiltro] = useState(null);  // área de planta o null
  const [ahora, setAhora] = useState(Date.now());      // hace latir los "hace X"
  const [busqueda, setBusqueda] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false); // barra lateral en celular

  // ── Imágenes del ticket seleccionado ─────────────────────────
  const [selectedImagenes, setSelectedImagenes] = useState([]); // [{id, mime_type, analisis, fecha, blobUrl}]
  const [ticketDetalle, setTicketDetalle] = useState(null);     // ticket completo (trae `historial`)
  const blobUrlsRef = useRef([]); // para revocar al cambiar de ticket

  // ── Refs para notificaciones ──────────────────────────────────
  const notifGranted = useRef(false);
  const prevTicketIds = useRef(new Set()); // IDs vistos en el último poll
  const initialLoadDone = useRef(false);   // evita notificar en la carga inicial
  const versionRef = useRef(null);         // última firma vista del centinela
  const selectedIdRef = useRef(null);      // selectedId legible desde fetchData
  const imgsCargadasRef = useRef("");      // IDs de fotos ya convertidas a blob

  // ── Estado de configuración ───────────────────────────────────
  const [configAgentes, setConfigAgentes] = useState({});
  const [configUsuarios, setConfigUsuarios] = useState([]);
  const [whitelistActiva, setWhitelistActiva] = useState(false);

  // El ticket seleccionado se deriva del estado — se mantiene sincronizado con el polling
  // El listado manda todos los campos escalares (siempre los más frescos) y el
  // detalle aporta el `historial`, que ya no viaja en el listado.
  const detalleListo = ticketDetalle?.id === selectedId;
  const ticketSeleccionado = selectedId && tickets[selectedId]
    ? { ...tickets[selectedId], historial: detalleListo ? ticketDetalle.historial : null }
    : null;

  // ── Login ────────────────────────────────────────────────────
  // `perfil` decide qué aplicación es esta: con rol de TI se pinta la cola de
  // trabajo; con rol "usuario", el portal para levantar tickets. Es la misma
  // build en los dos casos.
  const _guardarSesion = (t, datos) => {
    localStorage.setItem("bf_token", t);
    localStorage.setItem("bf_nombre", datos.nombre || "");
    setPerfil({
      usuario: datos.usuario || null,
      email: datos.email || null,
      debe_cambiar_password: !!datos.debe_cambiar_password,
      nombre: datos.nombre || "",
      rol: datos.rol || "usuario",
      area: datos.area || null,
      whatsapp: datos.whatsapp || null,
      es_ti: datos.es_ti ?? ["tecnico", "admin"].includes(datos.rol),
    });
    setAutenticado(true);
    setLoginError("");
  };

  const login = async () => {
    const usuario = usuarioInput.trim().toLowerCase();
    const password = passwordInput;
    if (!usuario || !password) return;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const data = await res.json();
      if (res.ok) {
        _guardarSesion(data.token, data);
      } else {
        setLoginError(data.detail || "Usuario o contraseña incorrectos.");
      }
    } catch {
      setLoginError("No se pudo conectar con el servidor.");
    }
  };

  const logout = () => {
    localStorage.removeItem("bf_token");
    localStorage.removeItem("bf_nombre");
    // En una computadora compartida, el siguiente no debe encontrar el usuario
    // y la contraseña del anterior ya escritos en el formulario.
    setUsuarioInput("");
    setPasswordInput("");
    setVerPassword(false);
    setLoginError("");
    setAutenticado(false);
    setPerfil(null);
    setTickets({});
  };

  // Verificar token guardado en localStorage al montar la app
  useEffect(() => {
    const saved = localStorage.getItem("bf_token");
    if (!saved) {
      setLoginChecking(false);
      return;
    }
    // /auth/yo y no /stats: /stats ahora es solo para TI y le daría 403 a un
    // administrativo con sesión válida, tirándolo al login en cada recarga.
    fetch(`${API}/auth/yo`, { headers: { Authorization: `Bearer ${saved}` } })
      .then(async (r) => {
        if (!r.ok) {
          localStorage.removeItem("bf_token");
          return;
        }
        const yo = await r.json();
        setPerfil(yo);
        setAutenticado(true);
      })
      .catch(() => {})
      .finally(() => setLoginChecking(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Permisos de notificación ──────────────────────────────────
  useEffect(() => {
    // La segunda condición también necesita la guarda: sin ella, un navegador
    // sin la API de notificaciones tira toda la app al montar.
    if (!autenticado || !esTI || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then(p => { notifGranted.current = p === "granted"; });
    } else if (Notification.permission === "granted") {
      notifGranted.current = true;
    }
  }, [autenticado, esTI]);

  // ── Audit log ────────────────────────────────────────────────
  const fetchAuditLog = async (ticketId) => {
    const currentToken = localStorage.getItem("bf_token");
    if (!currentToken || !ticketId) return;
    try {
      const res = await fetch(`${API}/tickets/${ticketId}/eventos`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await res.json();
      setAuditLog(data.eventos || []);
    } catch (e) {
      console.error("Error al cargar auditoría", e);
    }
  };

  useEffect(() => {
    if (selectedId) fetchAuditLog(selectedId);
    else setAuditLog([]);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imágenes del ticket seleccionado ─────────────────────────
  // El ticket completo (con `historial` e `imagenes`) solo se pide al abrirlo,
  // no en cada sincronización del listado.
  const fetchTicketDetalle = async (ticketId) => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (data && data.id) setTicketDetalle(data);
    } catch (e) { console.error("Error al cargar el detalle del ticket", e); }
  };

  useEffect(() => {
    setTicketDetalle(null);
    selectedIdRef.current = selectedId;
    if (selectedId) fetchTicketDetalle(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Los blobs de las fotos solo se rebajan si cambió el conjunto de imágenes:
  // el detalle se refresca en cada sincronización y volver a descargarlas cada
  // vez costaría más que el problema que estamos resolviendo.
  useEffect(() => {
    const imgs = ticketDetalle?.id === selectedId ? (ticketDetalle.imagenes || []) : [];
    const clave = imgs.map(i => i.id).join(",");
    if (clave === imgsCargadasRef.current) return;
    imgsCargadasRef.current = clave;

    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    if (!imgs.length) { setSelectedImagenes([]); return; }

    let cancelado = false;
    (async () => {
      const t = localStorage.getItem("bf_token");
      const cargadas = await Promise.all(
        imgs.map(async (img) => {
          try {
            const r = await fetch(`${API}/imagenes/${img.id}`, { headers: { Authorization: `Bearer ${t}` } });
            const blob = await r.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            return { ...img, blobUrl };
          } catch { return null; }
        })
      );
      if (!cancelado) setSelectedImagenes(cargadas.filter(Boolean));
    })();
    return () => { cancelado = true; };
  }, [ticketDetalle, selectedId]);

  // ── Acciones sobre tickets ────────────────────────────────────
  const transicionarTicket = async (ticketId, nuevoEstado) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      await fetch(`${API}/tickets/${ticketId}/transicion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ estado: nuevoEstado, actor: "dashboard" }),
      });
      await Promise.all([fetchData(), fetchAuditLog(ticketId)]);
    } catch (e) {
      console.error("Error al transicionar ticket", e);
    }
  };

  const patchTicket = async (ticketId, campos) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      await fetch(`${API}/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify(campos),
      });
      await fetchData();
    } catch (e) {
      console.error("Error al actualizar ticket", e);
    }
  };

  // ── Gestión de configuración ──────────────────────────────────
  const fetchConfigAgentes = async () => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/agentes?todos=true`, { headers: { Authorization: `Bearer ${t}` } });
      setConfigAgentes(await res.json());
    } catch (e) { console.error("Error al cargar agentes (config)", e); }
  };

  const fetchConfigUsuarios = async () => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/usuarios`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      setConfigUsuarios(data.usuarios || []);
      setWhitelistActiva(data.whitelist_activa || false);
    } catch (e) { console.error("Error al cargar usuarios", e); }
  };

  useEffect(() => {
    if (autenticado && vista === "config") { fetchConfigAgentes(); fetchConfigUsuarios(); }
  }, [vista, autenticado]); // eslint-disable-line react-hooks/exhaustive-deps

  const crearAgente = async (id, nombre, whatsapp, avisos, email) => {
    const t = localStorage.getItem("bf_token");
    const res = await fetch(`${API}/agentes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ id, nombre, whatsapp, ...avisos, email: email || null }),
    });
    const data = await res.json();
    if (data.ok) await fetchConfigAgentes();
    return data;
  };

  const actualizarAgente = async (id, campos) => {
    const t = localStorage.getItem("bf_token");
    await fetch(`${API}/agentes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(campos),
    });
    await Promise.all([fetchConfigAgentes(), fetchData()]); // config + sidebar
  };

  const agregarUsuario = async (numero, nombre, area) => {
    const t = localStorage.getItem("bf_token");
    const res = await fetch(`${API}/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ numero, nombre, area }),
    });
    const data = await res.json();
    if (data.ok) await fetchConfigUsuarios();
    return data;
  };

  const desactivarUsuario = async (numero) => {
    const t = localStorage.getItem("bf_token");
    await fetch(`${API}/usuarios/${encodeURIComponent(numero)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    await fetchConfigUsuarios();
  };

  // ── Data fetching ────────────────────────────────────────────
  const fetchData = async () => {
    const currentToken = localStorage.getItem("bf_token");
    if (!currentToken) return;
    setSyncing(true);
    try {
      const headers = { Authorization: `Bearer ${currentToken}` };
      const [ticketsRes, agentesRes, versionRes] = await Promise.all([
        fetch(`${API}/tickets`, { headers }).then((r) => r.json()),
        fetch(`${API}/agentes`, { headers }).then((r) => r.json()),
        fetch(`${API}/tickets/version`, { headers }).then((r) => r.json()).catch(() => null),
      ]);
      // Guardar la firma aquí deja al centinela en sincronía después de
      // cualquier acción, y evita un refresco redundante en el siguiente tick.
      if (versionRes?.v) versionRef.current = versionRes.v;
      const nuevosTickets = ticketsRes.tickets || ticketsRes || {};
      setTickets(nuevosTickets);
      setAgentes(agentesRes || {});

      // Notificaciones: detectar tickets OPEN nuevos sin asignar
      if (initialLoadDone.current && notifGranted.current) {
        Object.values(nuevosTickets).forEach(t => {
          if (t.estado === "OPEN" && !t.asignado_a && !prevTicketIds.current.has(t.id)) {
            new Notification("Nuevo ticket sin asignar", {
              body: `${t.id} · ${contactoDe(t)}`,
              icon: "/favicon.ico",
              tag: t.id,
            });
          }
        });
      }
      prevTicketIds.current = new Set(Object.keys(nuevosTickets));
      initialLoadDone.current = true;

      // El historial ya no viaja en el listado: si hay un ticket abierto se
      // refresca su detalle para que la conversación siga llegando en vivo.
      const abierto = selectedIdRef.current;
      if (abierto && nuevosTickets[abierto]) await fetchTicketDetalle(abierto);
    } catch (e) {
      console.error("Error al sincronizar", e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const asignarTicket = async (ticketId, agenteId) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      await fetch(`${API}/tickets/${ticketId}/asignar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ agente_id: agenteId }),
      });
      await fetchData();
    } catch (e) {
      console.error("Error al asignar ticket", e);
    }
  };

  const enviarMensaje = async (ticketId, texto, actor) => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/tickets/${ticketId}/mensaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ texto, actor }),
      });
      const data = await res.json();
      if (data.ok) await fetchData(); // refresca historial
      return data;
    } catch (e) {
      console.error("Error al enviar mensaje", e);
      return { error: "Error de red" };
    }
  };

  const eliminarTicket = async (id) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/tickets/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!res.ok) {
        console.error("Error al eliminar ticket", res.status);
        return;
      }
      setSelectedId(null);   // el detalle apunta a un ticket que ya no existe
      await fetchData();
    } catch (e) {
      console.error("Error al eliminar ticket", e);
    }
  };

  // Sincronización. En vez de bajar el listado completo cada 10 s se consulta
  // un centinela de ~40 bytes (GET /tickets/version) y solo se refresca cuando
  // algo cambió de verdad. Además se pausa con la pestaña oculta: un dashboard
  // olvidado en segundo plano deja de consumir por completo.
  useEffect(() => {
    // Solo TI: /tickets y /tickets/version responden 403 a un administrativo,
    // y sin esta guarda el portal haría una petición fallida cada 10 s.
    if (!autenticado || !esTI) return;
    let vivo = true;

    const revisar = async () => {
      if (!vivo || document.hidden) return;
      const t = localStorage.getItem("bf_token");
      if (!t) return;
      try {
        const res = await fetch(`${API}/tickets/version`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        if (data?.v && data.v === versionRef.current) return; // nada cambió
        await fetchData();
      } catch (e) {
        console.error("Error al revisar cambios", e);
      }
    };

    fetchData(); // carga inicial completa (también fija versionRef)
    const interval = setInterval(revisar, POLL_MS);
    // Al volver a la pestaña, revisar de inmediato en vez de esperar el tick.
    const alVolver = () => { if (!document.hidden) revisar(); };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vivo = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [autenticado, esTI]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);


  /* Derivados ─────────────────────────────────────────────────── */
  const arr = useMemo(() => Object.values(tickets || {}), [tickets]);

  // Todo lo que la barra lateral necesita, en una sola pasada.
  const cola = useMemo(() => {
    const porGrupo = { sin_atender: [], en_progreso: [], esperando: [], resueltos: [] };
    const porArea = {};
    const porAgente = {};
    let resueltosHoy = 0;

    arr.forEach((t) => {
      porGrupo[grupoDe(t)].push(t);
      if (ESTADOS_ACTIVOS_SET.has(t.estado)) {
        const a = t.area || "Sin área";
        porArea[a] = (porArea[a] || 0) + 1;
        if (t.asignado_a) porAgente[t.asignado_a] = (porAgente[t.asignado_a] || 0) + 1;
      } else if (esDeHoy(t.fecha_cierre_iso)) {
        resueltosHoy += 1;
      }
    });

    // Sin atender y esperando: primero el que lleva más tiempo, que es el que duele.
    porGrupo.sin_atender.sort((a, b) => (edadMs(b, ahora) || 0) - (edadMs(a, ahora) || 0));
    porGrupo.esperando.sort((a, b) => (edadMs(b, ahora) || 0) - (edadMs(a, ahora) || 0));
    porGrupo.en_progreso.sort((a, b) => (edadMs(b, ahora) || 0) - (edadMs(a, ahora) || 0));
    porGrupo.resueltos.sort((a, b) =>
      String(b.fecha_cierre_iso || "").localeCompare(String(a.fecha_cierre_iso || "")));

    return { porGrupo, porArea, porAgente, resueltosHoy };
  }, [arr, ahora]);

  // Búsqueda y filtro de área se aplican a los cuatro grupos por igual.
  const gruposVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const pasa = (t) =>
      (!areaFiltro || t.area === areaFiltro) &&
      (!q || String(t.numero).includes(q) ||
        String(t.id).toLowerCase().includes(q) ||
        String(t.nombre || "").toLowerCase().includes(q) ||
        String(t.solicitante_email || "").toLowerCase().includes(q) ||
        String(t.area || "").toLowerCase().includes(q));
    const out = {};
    Object.entries(cola.porGrupo).forEach(([k, v]) => { out[k] = v.filter(pasa); });
    return out;
  }, [cola, busqueda, areaFiltro]);

  const totalVisibles = Object.values(gruposVisibles).reduce((n, v) => n + v.length, 0);
  const masViejoSinAtender = gruposVisibles.sin_atender[0];

  // "Tomar yo" solo aparece si el usuario del dashboard coincide con un agente.
  const nombreSesion = (localStorage.getItem("bf_nombre") || "").trim().toLowerCase();
  const miAgenteId = Object.entries(agentes).find(
    ([, a]) => (a.nombre || "").trim().toLowerCase() === nombreSesion
  )?.[0] || null;

  /* ── Pantalla: verificando token guardado ────────────────────── */
  if (loginChecking) {
    return (
      <div className="bf-app bf-login-wrap">
        <style>{CSS}</style>
        <div className="bf-login-card">
          <div className="bf-logo-box">b</div>
          <p className="bf-login-sub" style={{ marginTop: 16 }}>
            Verificando acceso…
          </p>
        </div>
      </div>
    );
  }

  /* ── Pantalla: login ─────────────────────────────────────────── */
  // La misma para TI y para usuarios: el rol decide qué app sigue.
  if (!autenticado) {
    const alEnter = (e) => e.key === "Enter" && login();
    return (
      <div className="bf-lg">
        <style>{CSS}</style>
        <div className="bf-lg-card">
          <div className="bf-lg-head">
            <div className="bf-lg-logo">b</div>
            <h1 className="bf-lg-titulo">Mesa de Ayuda</h1>
          </div>
          <div className="bf-lg-cuerpo">
            <div className="bf-lg-aviso">
              <IcInfo size={20} />
              <span>Usa el <strong>mismo usuario y contraseña</strong> de la mesa de ayuda anterior.</span>
            </div>
            <div className="bf-lg-campo">
              <label htmlFor="bf-usuario">Usuario</label>
              <input
                id="bf-usuario"
                className="bf-lg-input"
                placeholder="Ej. jperez"
                autoCapitalize="none"
                autoComplete="username"
                value={usuarioInput}
                onChange={(e) => setUsuarioInput(e.target.value)}
                onKeyDown={alEnter}
                autoFocus
              />
            </div>
            <div className="bf-lg-campo">
              <label htmlFor="bf-password">Contraseña</label>
              <div className="bf-lg-pass">
                <input
                  id="bf-password"
                  type={verPassword ? "text" : "password"}
                  className="bf-lg-input"
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={alEnter}
                />
                <button
                  type="button"
                  className="bf-lg-ojo"
                  aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setVerPassword((v) => !v)}
                >
                  {verPassword ? <IcOjoNo size={20} /> : <IcOjo size={20} />}
                </button>
              </div>
            </div>
            {loginError && <p className="bf-login-error">{loginError}</p>}
            <BotonAccion className="bf-lg-entrar" onClick={login} cargandoTexto="Entrando…">
              Entrar
            </BotonAccion>
            <p className="bf-lg-ayuda">
              ¿No recuerdas tu usuario o contraseña?<br />
              <strong>Pídelo a TI.</strong>
            </p>
            <div className="bf-lg-pie">
              ¿No tenías cuenta en la mesa anterior? <strong>Contáctanos</strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Contraseña heredada del sistema anterior ───────────────── */
  // Venían en texto plano y el catálogo circuló como archivo: hasta que la
  // cambie, la persona no pasa de aquí. El backend apaga la marca al cambiarla.
  if (perfil?.debe_cambiar_password) {
    return (
      <CambiarPassword
        perfil={perfil}
        onListo={() => setPerfil((p) => ({ ...p, debe_cambiar_password: false }))}
        onLogout={logout}
      />
    );
  }

  /* ── Portal del usuario final ───────────────────────────────── */
  // Misma build, otra aplicación: un administrativo nunca ve la cola de TI.
  // La autorización real está en el backend (403); esto solo elige la vista.
  if (perfil && !perfil.es_ti) {
    return <PortalUsuario perfil={perfil} onLogout={logout} />;
  }

  /* ── Dashboard principal ─────────────────────────────────────── */
  return (
    <div className="bf-app">
      <style>{CSS}</style>

      {/* ───── Barra superior (solo celular) ───── */}
      {/* En pantallas angostas la barra lateral no cabe: se vuelve un cajón que
          abre este botón, con el conteo de «sin atender» a la vista. */}
      <div className="bf-mtop">
        <button className="bf-mtop-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
          <IcMenu size={20} />
          {cola.porGrupo.sin_atender.length > 0 && (
            <span className="bf-mtop-n">{cola.porGrupo.sin_atender.length}</span>
          )}
        </button>
        <div className="bf-logo bf-mtop-logo">b</div>
        <span className="bf-mtop-titulo">Mesa de Soporte TI</span>
      </div>
      {menuAbierto && <div className="bf-scrim" onClick={() => setMenuAbierto(false)} />}

      {/* ───── Sidebar ───── */}
      {/* Cualquier botón del cajón (cola, área, Configuración) es una decisión
          tomada: se cierra solo para mostrar el resultado. */}
      <aside
        className={`bf-sidebar${menuAbierto ? " is-abierto" : ""}`}
        onClick={(e) => { if (e.target.closest("button")) setMenuAbierto(false); }}
      >
        <div className="bf-brand">
          <div className="bf-logo">b</div>
          <div>
            <div className="bf-brand-name">bioflex</div>
            <div className="bf-brand-tag">Mesa de Soporte TI</div>
          </div>
        </div>

        {/* La cola de trabajo ES la navegación: cada grupo es un filtro. */}
        <div className="bf-side-label" style={{ paddingTop: 4 }}>Cola de trabajo</div>
        <nav className="bf-cola">
          {GRUPOS.map((g) => {
            const n = g.id === "resueltos" ? cola.resueltosHoy : cola.porGrupo[g.id].length;
            const activo = vista === "tickets" && filtro === g.id;
            const urgente = g.id === "sin_atender" && n > 0;
            return (
              <button
                key={g.id}
                className={`bf-cola-item${activo ? " is-active" : ""}${urgente ? " is-urgente" : ""}`}
                onClick={() => { setVista("tickets"); setFiltro(g.id); }}
              >
                <span className="bf-cola-dot" style={{ background: g.dot }} />
                <span className="bf-cola-label">{g.label}</span>
                <span className="bf-cola-count">{n}</span>
              </button>
            );
          })}
        </nav>

        {/* Filtro por área: usa el dato que el bot captura antes de crear el ticket */}
        {Object.keys(cola.porArea).length > 0 && (
          <>
            <div className="bf-side-label">Área de planta</div>
            <div className="bf-area-chips">
              {areaFiltro && (
                <button className="bf-area-chip is-active" onClick={() => setAreaFiltro(null)}>
                  {areaFiltro} <IcX size={11} />
                </button>
              )}
              {Object.entries(cola.porArea)
                .filter(([a]) => a !== areaFiltro)
                .sort((x, y) => y[1] - x[1])
                .map(([area, n]) => (
                  <button key={area} className="bf-area-chip" onClick={() => setAreaFiltro(area)}>
                    {area} <span className="bf-area-n">{n}</span>
                  </button>
                ))}
            </div>
          </>
        )}

        {/* Equipo con carga real, no presencia */}
        <div className="bf-side-section">
          <div className="bf-side-label" style={{ paddingBottom: 10 }}>Equipo TI</div>
          <div className="bf-team">
            {Object.keys(agentes).length === 0 ? (
              <p className="bf-team-empty">Sin agentes registrados</p>
            ) : (
              (() => {
                const cargas = Object.keys(agentes).map((id) => cola.porAgente[id] || 0);
                const tope = Math.max(1, ...cargas);
                return Object.entries(agentes).map(([id, agente]) => {
                  const carga = cola.porAgente[id] || 0;
                  return (
                    <div key={id} className="bf-carga">
                      <div className="bf-carga-top">
                        <span className="bf-avatar bf-avatar-sm" style={{ background: colorPara(id) }}>
                          {iniciales(agente.nombre)}
                        </span>
                        <span className="bf-carga-nombre">{agente.nombre.split(" ")[0]}</span>
                        {carga === 0
                          ? <span className="bf-carga-libre">libre</span>
                          : <span className="bf-carga-n">{carga}</span>}
                      </div>
                      <div className="bf-carga-barra">
                        <div
                          className="bf-carga-fill"
                          style={{
                            width: `${Math.round((carga / tope) * 100)}%`,
                            background: carga >= tope && tope > 2 ? C.naranja : C.azulLight,
                          }}
                        />
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        <div className="bf-side-links">
          {perfil?.rol === "admin" && (
            <button
              className={`bf-side-link${vista === "uso" ? " is-active" : ""}`}
              onClick={() => setVista("uso")}
            >
              <IcBarras size={15} /> Uso
            </button>
          )}
          {perfil?.rol === "admin" && (
            <button
              className={`bf-side-link${vista === "cuentas" ? " is-active" : ""}`}
              onClick={() => setVista("cuentas")}
            >
              <IcUser size={15} /> Cuentas
            </button>
          )}
          <button
            className={`bf-side-link${vista === "config" ? " is-active" : ""}`}
            onClick={() => setVista("config")}
          >
            <IcSettings size={15} /> Configuración
          </button>
        </div>

        <div className="bf-side-footer">
          <span className={`bf-live-dot${syncing ? " is-busy" : ""}`} />
          <span style={{ flex: 1 }}>{syncing ? "Sincronizando…" : "En vivo"}</span>
          <button className="bf-logout-btn" onClick={logout} title="Cerrar sesión">
            <IcLogout size={15} />
          </button>
        </div>
      </aside>

      {/* ───── Main ───── */}
      <main className={`bf-main${vista === "tickets" && ticketSeleccionado ? " con-detalle" : ""}`}>
        {/* Header */}
        <header className="bf-header">
          <div>
            <h1 className="bf-title">
              {vista === "config" ? "Configuración"
                : vista === "cuentas" ? "Cuentas"
                : vista === "uso" ? "Uso"
                : (TITULOS[filtro] || "Cola de trabajo")}
            </h1>
            <p className="bf-subtitle">
              {vista === "config"
                ? "Agentes de soporte y whitelist de usuarios"
                : vista === "cuentas"
                ? "Quién entra al portal, con qué área y qué rol"
                : vista === "uso"
                ? "Quién ya usa el portal y el WhatsApp"
                : masViejoSinAtender ? (
                    <>
                      {gruposVisibles.sin_atender.length}{" "}
                      {gruposVisibles.sin_atender.length === 1 ? "ticket espera" : "tickets esperan"}
                      {" "}a que alguien los tome · el más viejo lleva{" "}
                      <strong style={{ color: colorEdad(edadMs(masViejoSinAtender, ahora)) }}>
                        {textoEdad(edadMs(masViejoSinAtender, ahora))}
                      </strong>
                    </>
                  ) : (
                    `${totalVisibles} ${totalVisibles === 1 ? "ticket" : "tickets"} · nadie sin atender`
                  )}
            </p>
          </div>
          <div className="bf-header-actions">
            {vista === "tickets" && (
              <div className="bf-search">
                <IcSearch size={16} className="bf-search-ic" />
                <input
                  placeholder="Folio, nombre o área…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            )}
            {vista !== "cuentas" && vista !== "uso" && <button className="bf-sync" onClick={fetchData} disabled={syncing}>
              <IcRefresh size={16} className={syncing ? "bf-spin" : ""} />
              {syncing ? "Sincronizando" : "Sincronizar"}
            </button>}
          </div>
        </header>

        {/* Workspace */}
        {vista === "uso" && perfil?.rol === "admin" ? (
          <GestorUso />
        ) : vista === "cuentas" && perfil?.rol === "admin" ? (
          <GestorCuentas miUsuario={perfil?.usuario} />
        ) : vista === "config" ? (
          <GestorConfig
            agentes={configAgentes}
            usuarios={configUsuarios}
            whitelistActiva={whitelistActiva}
            onCrearAgente={crearAgente}
            onActualizarAgente={actualizarAgente}
            onAgregarUsuario={agregarUsuario}
            onDesactivarUsuario={desactivarUsuario}
          />
        ) : (
        <section className={`bf-work bf-cola-work${ticketSeleccionado ? " con-detalle" : ""}`}>
          {/* Lista */}
          <div className="bf-panel bf-list">
            <div className="bf-list-body bf-scroll">
              {loading ? (
                [0, 1, 2, 3].map((i) => <div key={i} className="bf-skel" />)
              ) : totalVisibles === 0 ? (
                <div className="bf-empty">
                  <div className="bf-empty-ic"><IcCheckCircle size={28} /></div>
                  <p className="bf-empty-title">Bandeja al día</p>
                  <p className="bf-empty-text">
                    {busqueda || areaFiltro
                      ? "Ningún ticket coincide con el filtro."
                      : "Los tickets aparecen aquí en automático cuando el bot necesita un humano."}
                  </p>
                </div>
              ) : (
                (() => {
                  // Solo el grupo elegido en la barra lateral: los demás no se
                  // asoman para que la lista no se sature.
                  const g = GRUPOS.find((x) => x.id === filtro) || GRUPOS[0];
                  const items = gruposVisibles[g.id];
                  return (
                    <div className="bf-grupo">
                      <div className="bf-grupo-head" title={g.sub}>
                        <span className="bf-grupo-dot" style={{ background: g.dot }} />
                        <span className="bf-grupo-label">{g.label}</span>
                        <span className="bf-grupo-n is-active"
                              style={g.id === "sin_atender" ? { background: C.naranja, color: "#fff" } : undefined}>
                          {items.length}
                        </span>
                        <span className="bf-grupo-linea" />
                      </div>

                      {items.length === 0 ? (
                        <div className="bf-empty">
                          <p className="bf-empty-title">Nada en «{g.label}»</p>
                          <p className="bf-empty-text">
                            {busqueda || areaFiltro ? "Ningún ticket coincide con el filtro." : g.sub}
                          </p>
                        </div>
                      ) : (
                        <div className="bf-grupo-body">
                          {items.map((t) => (
                            <FilaExpandida
                              key={t.id}
                              ticket={t}
                              agentes={agentes}
                              ahora={ahora}
                              seleccionado={selectedId === t.id}
                              miAgenteId={miAgenteId}
                              onAbrir={() => { setSelectedId(t.id); window.scrollTo(0, 0); }}
                              onAsignar={asignarTicket}
                              onRecordar={enviarMensaje}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Detalle */}
          <div className="bf-panel bf-detail">
            {!ticketSeleccionado ? (
              <div className="bf-detail-empty">
                <div className="bf-empty-ic">
                  <IcChat size={30} />
                </div>
                <p className="bf-empty-title">Selecciona un ticket</p>
                <p className="bf-empty-text">
                  Elige un caso de la bandeja para ver la conversación y
                  asignarlo.
                </p>
              </div>
            ) : (
              <DetalleTicket
                key={ticketSeleccionado.id}
                ticket={ticketSeleccionado}
                agentes={agentes}
                auditLog={auditLog}
                imagenes={selectedImagenes}
                cargandoHistorial={!detalleListo}
                ahora={ahora}
                miAgenteId={miAgenteId}
                onClose={() => setSelectedId(null)}
                onAsignar={asignarTicket}
                onTransicionar={transicionarTicket}
                onEliminar={eliminarTicket}
                onPatch={patchTicket}
                onEnviarMensaje={enviarMensaje}
              />
            )}
          </div>
        </section>
        )}
      </main>
    </div>
  );
}

/* Subcomponentes ------------------------------------------------ */
/* Fila del grupo enfocado: el tiempo de espera manda y las acciones
   más comunes (tomar, asignar, recordar) no obligan a abrir el detalle. */
function FilaExpandida({ ticket, agentes, ahora, seleccionado, miAgenteId, onAbrir, onAsignar, onRecordar }) {
  const [asignando, ejecAsignar] = useAccion();
  const ms = edadMs(ticket, ahora);
  const color = colorEdad(ms);
  const agente = agentes[ticket.asignado_a];
  const sinDuenio = !ticket.asignado_a && ESTADOS_ACTIVOS_SET.has(ticket.estado);
  const esperando = ticket.estado === "WAITING_FOR_USER";
  const frenar = (e) => e.stopPropagation();

  return (
    <div className={`bf-fila${seleccionado ? " is-selected" : ""}`} onClick={onAbrir}>
      <span className="bf-fila-riel" style={{ background: color }} />
      <div className="bf-fila-cuerpo">
        <div className="bf-fila-top">
          <span className="bf-fila-id">{ticket.id}</span>
          {ticket.area && (
            <span className="bf-fila-maq" style={{ color, background: `${color}14` }}>
              {ticket.area}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="bf-fila-edad" style={{ color }}>{textoEdad(ms)}</span>
        </div>

        <p className="bf-fila-texto">{ultimoMensaje(ticket)}</p>

        <div className="bf-fila-acciones" onClick={frenar}>
          {sinDuenio ? (
            <>
              {miAgenteId && (
                <BotonAccion
                  className="bf-accion bf-accion-primaria"
                  onClick={() => onAsignar(ticket.id, miAgenteId)}
                  cargandoTexto="Tomando…"
                >
                  Tomar yo
                </BotonAccion>
              )}
              <div className="bf-accion-select">
                <select
                  value=""
                  disabled={asignando}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) ejecAsignar(() => onAsignar(ticket.id, id));
                  }}
                >
                  <option value="">{asignando ? "Asignando…" : "Asignar a…"}</option>
                  {Object.entries(agentes).map(([id, a]) => (
                    <option key={id} value={id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
            </>
          ) : esperando ? (
            <BotonAccion
              className="bf-accion"
              onClick={() => onRecordar(ticket.id, TEMPLATES_RAPIDOS[1].texto,
                                        agente ? agente.nombre : "Agente TI")}
              cargandoTexto="Enviando…"
            >
              Recordar por WhatsApp
            </BotonAccion>
          ) : agente ? (
            <span className="bf-fila-agente">
              <span className="bf-avatar bf-avatar-sm" style={{ background: colorPara(ticket.asignado_a) }}>
                {iniciales(agente.nombre)}
              </span>
              {agente.nombre.split(" ")[0]}
            </span>
          ) : (
            <EstadoBadge estado={ticket.estado} />
          )}
          <span style={{ flex: 1 }} />
          <span className="bf-fila-quien">{ticket.nombre} · {contactoDe(ticket)}</span>
        </div>
      </div>
    </div>
  );
}

/* Fila de un grupo no enfocado: una línea, solo para no perderlo de vista. */
function EstadoBadge({ estado }) {
  const meta = ESTADO_META[estado] || ESTADO_META["OPEN"];
  return (
    <span
      className="bf-badge"
      style={{ background: meta.bg, color: meta.color }}
    >
      <span className="bf-badge-dot" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function DetalleTicket({ ticket, agentes, auditLog, imagenes = [], cargandoHistorial = false, ahora = Date.now(), miAgenteId = null, onClose, onAsignar, onTransicionar, onEliminar, onPatch, onEnviarMensaje }) {
  const [notas, setNotas] = useState(ticket.notas_internas || "");
  const [pasos, setPasos] = useState(ticket.pasos_intentados || "");
  const [prioridad, setPrioridad] = useState(ticket.prioridad || "normal");
  const [imgExpanded, setImgExpanded] = useState(null);
  const [msgTexto, setMsgTexto] = useState("");
  const [msgEnviando, setMsgEnviando] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState(null); // "ok" | "error"
  const agente = agentes[ticket.asignado_a];
  const transiciones = TRANSICIONES_UI[ticket.estado] || [];
  // Los <select> no pasan por BotonAccion, así que llevan su propio estado.
  const [asignando, ejecAsignar] = useAccion();
  const [cambiandoPrioridad, ejecPrioridad] = useAccion();

  const guardarNotas = () => onPatch(ticket.id, { notas_internas: notas });
  const guardarPasos = () => onPatch(ticket.id, { pasos_intentados: pasos });
  const cambiarPrioridad = (p) => {
    setPrioridad(p);
    return ejecPrioridad(() => onPatch(ticket.id, { prioridad: p }));
  };

  const enviar = async (texto) => {
    const t = texto || msgTexto;
    if (!t.trim() || msgEnviando) return;
    setMsgEnviando(true);
    setMsgFeedback(null);
    const actor = agente ? agente.nombre : "Agente TI";
    const res = await onEnviarMensaje(ticket.id, t.trim(), actor);
    setMsgEnviando(false);
    if (res?.ok) { setMsgTexto(""); setMsgFeedback("ok"); setTimeout(() => setMsgFeedback(null), 2500); }
    else { setMsgFeedback("error"); setTimeout(() => setMsgFeedback(null), 3000); }
  };

  return (
    <>
      {/* Cabecera */}
      <div className="bf-detail-head">
        <div className="bf-detail-head-top">
          <span className="bf-detail-id">{ticket.id}</span>
          <EstadoBadge estado={ticket.estado} />
          <span style={{ flex: 1 }} />
          <span className="bf-detail-edad">
            Abierto hace {textoEdad(edadMs(ticket, ahora))}
          </span>
          <button className="bf-detail-cerrar" onClick={onClose} aria-label="Cerrar detalle">
            <IcX size={16} />
          </button>
        </div>
        <p className="bf-detail-sub">
          {[ticket.area, ticket.nombre, contactoDe(ticket)]
            .filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Meta grid */}
      <div className="bf-meta-grid">
        <div className="bf-meta">
          <span className="bf-meta-k">Área</span>
          <span className="bf-meta-v">{ticket.area || "—"}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k"><IcPhone size={13} /> Usuario</span>
          <span className="bf-meta-v">{contactoDe(ticket)}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k"><IcClock size={13} /> Apertura</span>
          <span className="bf-meta-v">{ticket.fecha}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k"><IcUser size={13} /> Asignado</span>
          <span className="bf-meta-v">{agente ? agente.nombre : "—"}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k">Categoría</span>
          <span className="bf-meta-v">{ticket.categoria || "—"}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k">Canal</span>
          <span className="bf-meta-v" style={{ textTransform: "capitalize" }}>{ticket.canal || "whatsapp"}</span>
        </div>
        <div className="bf-meta" style={{ gridColumn: "span 3" }}>
          <span className="bf-meta-k">Prioridad</span>
          <span className="bf-meta-v bf-meta-v-row">
            <select
              className="bf-prio-select"
              value={prioridad}
              disabled={cambiandoPrioridad}
              onChange={(e) => cambiarPrioridad(e.target.value)}
            >
              {["baja","normal","alta","urgente"].map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
            {cambiandoPrioridad && <IcSpinner size={13} className="bf-spin" />}
          </span>
        </div>
      </div>

      {/* Encuesta: la contesta el usuario por WhatsApp al confirmar que quedó */}
      {ticket.satisfaccion && (
        <div className="bf-descripcion">
          <div className="bf-chat-label">Satisfacción del usuario</div>
          <p className="bf-desc-text">
            <strong>{CALIFICACION_UI[ticket.satisfaccion] || ticket.satisfaccion}</strong>
            {ticket.satisfaccion_fecha && <span style={{ color: C.textMuted }}> · {ticket.satisfaccion_fecha}</span>}
          </p>
          {ticket.satisfaccion_comentario && (
            <p className="bf-desc-text">“{ticket.satisfaccion_comentario}”</p>
          )}
        </div>
      )}

      {/* Descripción */}
      {(ticket.descripcion || ticket.resumen_ia) && (
        <div className="bf-descripcion">
          <div className="bf-chat-label">Descripción del problema</div>
          <p className="bf-desc-text">{ticket.descripcion || ticket.resumen_ia}</p>
        </div>
      )}

      {/* Lo que el bot ya intentó: evita que TI repita los mismos pasos */}
      {ticket.pasos_intentados && ticket.pasos_intentados.trim() && (
        <div className="bf-intentado">
          <div className="bf-chat-label" style={{ marginBottom: 8 }}>Lo que el bot ya intentó</div>
          {ticket.pasos_intentados
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((linea, i) => (
              <div key={i} className="bf-intentado-item">
                <span className="bf-intentado-n">{i + 1}</span>
                <span>{linea}</span>
              </div>
            ))}
        </div>
      )}

      {/* Historial */}
      <div className="bf-chat-label">Historial de conversación</div>
      <div className="bf-chat bf-scroll">
        {cargandoHistorial ? (
          <p className="bf-chat-empty">
            <IcSpinner size={14} className="bf-spin" /> Cargando conversación…
          </p>
        ) : (!ticket.historial || ticket.historial.length === 0) && (
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

      {/* Imágenes adjuntas */}
      {imagenes.length > 0 && (
        <div className="bf-imgs-section">
          <div className="bf-chat-label">Evidencia fotográfica ({imagenes.length})</div>
          <div className="bf-imgs-grid">
            {imagenes.map(img => (
              <div key={img.id} className="bf-img-card" onClick={() => setImgExpanded(img)}>
                <img src={img.blobUrl} alt={`Evidencia ${img.id}`} className="bf-img-thumb" />
                {img.analisis && <p className="bf-img-caption">{img.analisis.slice(0, 80)}{img.analisis.length > 80 ? "…" : ""}</p>}
                <span className="bf-img-date">{img.fecha}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {imgExpanded && (
        <div className="bf-lightbox" onClick={() => setImgExpanded(null)}>
          <button className="bf-lightbox-close" onClick={() => setImgExpanded(null)}><IcX size={22} /></button>
          <img src={imgExpanded.blobUrl} alt="Evidencia" className="bf-lightbox-img" onClick={e => e.stopPropagation()} />
          {imgExpanded.analisis && (
            <div className="bf-lightbox-caption" onClick={e => e.stopPropagation()}>{imgExpanded.analisis}</div>
          )}
        </div>
      )}

      {/* Pasos intentados */}
      <div className="bf-notas">
        <label className="bf-assign-label">Pasos ya intentados</label>
        <textarea
          className="bf-notas-area bf-scroll"
          value={pasos}
          onChange={(e) => setPasos(e.target.value)}
          placeholder="Describe qué se intentó antes de escalar…"
          rows={3}
        />
        {pasos !== (ticket.pasos_intentados || "") && (
          <BotonAccion className="bf-notas-save" onClick={guardarPasos} cargandoTexto="Guardando…">
            Guardar pasos
          </BotonAccion>
        )}
      </div>

      {/* Agente */}
      <div className="bf-assign">
        <label className="bf-assign-label">
          {ticket.asignado_a ? "Reasignar" : "Tomar el caso"}
          {asignando && (
            <span className="bf-cargando-inline">
              <IcSpinner size={12} className="bf-spin" /> Asignando…
            </span>
          )}
        </label>
        <div className="bf-tomar">
          {/* El propio usuario primero: tomar un caso es la acción más común */}
          {miAgenteId && agentes[miAgenteId] && (
            <button
              className={`bf-tomar-chip${ticket.asignado_a === miAgenteId ? " is-active" : ""}`}
              disabled={asignando || ticket.asignado_a === miAgenteId}
              onClick={() => ejecAsignar(() => onAsignar(ticket.id, miAgenteId))}
            >
              <span className="bf-avatar bf-avatar-sm" style={{ background: colorPara(miAgenteId) }}>
                {iniciales(agentes[miAgenteId].nombre)}
              </span>
              Yo
            </button>
          )}
          {Object.entries(agentes)
            .filter(([id]) => id !== miAgenteId)
            .map(([id, a]) => (
              <button
                key={id}
                className={`bf-tomar-chip${ticket.asignado_a === id ? " is-active" : ""}`}
                disabled={asignando || ticket.asignado_a === id}
                onClick={() => ejecAsignar(() => onAsignar(ticket.id, id))}
              >
                <span className="bf-avatar bf-avatar-sm" style={{ background: colorPara(id) }}>
                  {iniciales(a.nombre)}
                </span>
                {a.nombre.split(" ")[0]}
              </button>
            ))}
        </div>
      </div>

      {/* Notas internas */}
      <div className="bf-notas">
        <label className="bf-assign-label">Notas internas</label>
        <textarea
          className="bf-notas-area bf-scroll"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Solo visible para el equipo de TI…"
          rows={3}
        />
        {notas !== (ticket.notas_internas || "") && (
          <BotonAccion className="bf-notas-save" onClick={guardarNotas} cargandoTexto="Guardando…">
            Guardar notas
          </BotonAccion>
        )}
      </div>

      {/* Mensaje directo vía WhatsApp */}
      <div className="bf-msg-direct">
        <label className="bf-assign-label">Mensaje directo al usuario</label>

        {/* Templates rápidos */}
        <div className="bf-msg-templates">
          {TEMPLATES_RAPIDOS.map(tpl => (
            <BotonAccion
              key={tpl.label}
              className="bf-msg-tpl-btn"
              onClick={() => enviar(tpl.texto)}
              disabled={msgEnviando}
              title={tpl.texto}
              cargandoTexto="Enviando…"
            >
              {tpl.label}
            </BotonAccion>
          ))}
        </div>

        {/* Textarea + envío manual */}
        <div className="bf-msg-compose">
          <textarea
            className="bf-notas-area bf-scroll"
            value={msgTexto}
            onChange={e => setMsgTexto(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(); }}
            placeholder="Escribe un mensaje personalizado… (Cmd+Enter para enviar)"
            rows={2}
          />
          <BotonAccion
            className="bf-msg-send-btn"
            onClick={() => enviar()}
            disabled={!msgTexto.trim() || msgEnviando}
            cargandoTexto="Enviando…"
          >
            <IcSend size={15} />
            Enviar
          </BotonAccion>
        </div>

        {msgFeedback === "ok" && <p className="bf-msg-ok">Mensaje enviado ✓</p>}
        {msgFeedback === "error" && <p className="bf-msg-err">Error al enviar. Verifica la conexión.</p>}
      </div>

      {/* Transiciones de estado */}
      {transiciones.length > 0 && (
        <div className="bf-transitions">
          <label className="bf-assign-label">Cambiar estado</label>
          <div className="bf-trans-btns">
            {transiciones.map(({ estado, label }) => (
              <BotonAccion
                key={estado}
                className="bf-trans-btn"
                style={{ "--tc": TRANS_COLOR[estado] || "#5E7B79" }}
                onClick={() => onTransicionar(ticket.id, estado)}
              >
                {label}
              </BotonAccion>
            ))}
          </div>
        </div>
      )}

      {/* Auditoría */}
      {auditLog.length > 0 && (
        <div className="bf-audit">
          <div className="bf-chat-label" style={{ marginTop: 18 }}>Historial de cambios</div>
          <div className="bf-audit-list">
            {auditLog.map((ev) => (
              <div key={ev.id} className="bf-audit-row">
                <div className="bf-audit-dot" />
                <div className="bf-audit-content">
                  <span className="bf-audit-estados">
                    {ev.estado_anterior ? `${ev.estado_anterior} → ` : "Creado: "}{ev.estado_nuevo}
                  </span>
                  <span className="bf-audit-meta">{ev.actor} · {ev.fecha}</span>
                  {ev.notas && <span className="bf-audit-notas">{ev.notas}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zona peligrosa: borrar es irreversible, no deja rastro ni en auditoría */}
      <div className="bf-danger-zone">
        <BotonAccion
          className="bf-danger-btn"
          onClick={() => onEliminar(ticket.id)}
          cargandoTexto="Eliminando…"
          confirmar={
            `¿Eliminar el ticket ${ticket.id} para siempre?\n\n` +
            `Se borran también su historial de cambios y sus fotos. ` +
            `No se puede deshacer.\n\n` +
            `Si solo quieres sacarlo de la lista, usa "Archivar".`
          }
        >
          <IcTrash size={14} /> Eliminar ticket
        </BotonAccion>
      </div>
    </>
  );
}

/* ── Helpers para preview de texto WhatsApp ─────────────────────────────── */
function WaText({ text }) {
  // Convierte *negrita* y saltos de línea a JSX
  const partes = text.split(/(\*[^*]+\*)/g);
  const nodes = partes.map((p, i) =>
    p.startsWith("*") && p.endsWith("*")
      ? <strong key={i}>{p.slice(1, -1)}</strong>
      : p.split("\n").map((line, j, arr) =>
          j < arr.length - 1 ? [line, <br key={j} />] : line
        )
  );
  return <span>{nodes}</span>;
}

// Qué le llega a un agente, canal por canal. Un canal prendido sin dato
// (correo vacío) se marca, porque en la práctica no recibe nada.
function AvisosAgente({ a }) {
  const correo = a.avisos_correo ?? a.notificar;
  const whatsapp = a.avisos_whatsapp ?? a.notificar;
  if (!correo && !whatsapp) return <span className="bf-cfg-pill bf-cfg-pill-off">sin avisos</span>;
  return (
    <>
      {correo && (
        <span className={`bf-cfg-pill${a.email ? "" : " bf-cfg-pill-off"}`}>
          {a.email ? "correo" : "correo: falta el correo"}
        </span>
      )}
      {whatsapp && (
        <span className={`bf-cfg-pill${a.whatsapp ? "" : " bf-cfg-pill-off"}`}>
          {a.whatsapp ? "WhatsApp" : "WhatsApp: falta el número"}
        </span>
      )}
    </>
  );
}

function GestorConfig({ agentes, usuarios, whitelistActiva, onCrearAgente, onActualizarAgente, onAgregarUsuario, onDesactivarUsuario }) {
  // ── Agentes ──
  const [creandoAgente, setCreandoAgente] = useState(false);
  const [nuevoAId, setNuevoAId] = useState("");
  const [nuevoANombre, setNuevoANombre] = useState("");
  const [nuevoAWa, setNuevoAWa] = useState("");
  const [nuevoAEmail, setNuevoAEmail] = useState("");
  const [nuevoAAvisos, setNuevoAAvisos] = useState({ avisos_correo: true, avisos_whatsapp: true });
  const [errAgente, setErrAgente] = useState("");
  const [editAgenteId, setEditAgenteId] = useState(null);
  const [editAgenteCampos, setEditAgenteCampos] = useState({});

  // ── Usuarios ──
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [nuevoUNum, setNuevoUNum] = useState("");
  const [nuevoUNombre, setNuevoUNombre] = useState("");
  const [nuevoUArea, setNuevoUArea] = useState("");
  const [errUsuario, setErrUsuario] = useState("");

  const handleCrearAgente = async () => {
    if (!nuevoAId.trim() || !nuevoANombre.trim() || !nuevoAWa.trim()) {
      setErrAgente("ID, nombre y WhatsApp son requeridos"); return;
    }
    const res = await onCrearAgente(nuevoAId.trim(), nuevoANombre.trim(), nuevoAWa.trim(), nuevoAAvisos, nuevoAEmail.trim());
    if (res && res.ok) {
      setCreandoAgente(false); setNuevoAId(""); setNuevoANombre(""); setNuevoAWa(""); setNuevoAEmail(""); setNuevoAAvisos({ avisos_correo: true, avisos_whatsapp: true }); setErrAgente("");
    } else {
      setErrAgente(res?.error || "Error al crear agente");
    }
  };

  const handleCrearUsuario = async () => {
    if (!nuevoUNum.trim() || !nuevoUNombre.trim()) {
      setErrUsuario("Número y nombre son requeridos"); return;
    }
    const res = await onAgregarUsuario(nuevoUNum.trim(), nuevoUNombre.trim(), nuevoUArea.trim() || undefined);
    if (res && res.ok) {
      setCreandoUsuario(false); setNuevoUNum(""); setNuevoUNombre(""); setNuevoUArea(""); setErrUsuario("");
    } else {
      setErrUsuario(res?.error || "Error al agregar usuario");
    }
  };

  const iniciarEditAgente = (id, a) => {
    setEditAgenteId(id);
    setEditAgenteCampos({
      nombre: a.nombre, whatsapp: a.whatsapp, email: a.email || "", activo: a.activo,
      // Un backend viejo solo manda `notificar`
      avisos_correo: a.avisos_correo ?? a.notificar, avisos_whatsapp: a.avisos_whatsapp ?? a.notificar,
    });
  };

  const guardarAgente = async () => {
    await onActualizarAgente(editAgenteId, editAgenteCampos);
    setEditAgenteId(null);
  };

  const agentesArr = Object.entries(agentes);

  return (
    <section className="bf-work">
      {/* Panel Agentes */}
      <div className="bf-panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="bf-panel-head">
          <IcUser size={16} />
          <span>Agentes TI ({agentesArr.length})</span>
          <button className="bf-guia-add-btn" onClick={() => setCreandoAgente(true)} title="Nuevo agente">
            <IcPlus size={15} />
          </button>
        </div>

        <div className="bf-list-body bf-scroll">
          {creandoAgente && (
            <div className="bf-guia-new-form">
              <input className="bf-guia-input" placeholder="ID (ej: agente_luis)" value={nuevoAId} onChange={e => setNuevoAId(e.target.value)} />
              <input className="bf-guia-input" placeholder="Nombre completo" value={nuevoANombre} onChange={e => setNuevoANombre(e.target.value)} />
              <input className="bf-guia-input" placeholder="WhatsApp (ej: 4771234567)" value={nuevoAWa} onChange={e => setNuevoAWa(e.target.value)} />
              <input className="bf-guia-input" type="email" placeholder="Correo (ej: icoronado@bioflex.mx)" value={nuevoAEmail} onChange={e => setNuevoAEmail(e.target.value)} />
              {/* Cada canal cubre ticket nuevo y asignación */}
              <div className="bf-cfg-toggles">
                <label className="bf-cfg-toggle">
                  <input type="checkbox" checked={nuevoAAvisos.avisos_correo} onChange={e => setNuevoAAvisos(p => ({ ...p, avisos_correo: e.target.checked }))} />
                  Avisos por correo
                </label>
                <label className="bf-cfg-toggle">
                  <input type="checkbox" checked={nuevoAAvisos.avisos_whatsapp} onChange={e => setNuevoAAvisos(p => ({ ...p, avisos_whatsapp: e.target.checked }))} />
                  Avisos por WhatsApp
                </label>
              </div>
              {errAgente && <p className="bf-guia-err">{errAgente}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <BotonAccion className="bf-guia-save-btn" onClick={handleCrearAgente} cargandoTexto="Creando…">
                  Crear
                </BotonAccion>
                <button className="bf-guia-cancel-btn" onClick={() => { setCreandoAgente(false); setErrAgente(""); }}>Cancelar</button>
              </div>
            </div>
          )}

          {agentesArr.length === 0 && !creandoAgente && (
            <div className="bf-empty">
              <div className="bf-empty-ic"><IcUser size={28} /></div>
              <p className="bf-empty-title">Sin agentes</p>
              <p className="bf-empty-text">Agrega el primer agente de soporte.</p>
            </div>
          )}

          {agentesArr.map(([id, a]) => (
            <div key={id} className={`bf-cfg-row${!a.activo ? " is-inactive" : ""}`}>
              {editAgenteId === id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <input className="bf-guia-input" value={editAgenteCampos.nombre} onChange={e => setEditAgenteCampos(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" />
                  <input className="bf-guia-input" value={editAgenteCampos.whatsapp} onChange={e => setEditAgenteCampos(p => ({ ...p, whatsapp: e.target.value }))} placeholder="WhatsApp" />
                  <input className="bf-guia-input" type="email" value={editAgenteCampos.email} onChange={e => setEditAgenteCampos(p => ({ ...p, email: e.target.value }))} placeholder="Correo (aquí le llegan los avisos)" />
                  <div className="bf-cfg-toggles">
                    <label className="bf-cfg-toggle">
                      <input type="checkbox" checked={editAgenteCampos.avisos_correo} onChange={e => setEditAgenteCampos(p => ({ ...p, avisos_correo: e.target.checked }))} />
                      Avisos por correo
                    </label>
                    <label className="bf-cfg-toggle">
                      <input type="checkbox" checked={editAgenteCampos.avisos_whatsapp} onChange={e => setEditAgenteCampos(p => ({ ...p, avisos_whatsapp: e.target.checked }))} />
                      Avisos por WhatsApp
                    </label>
                    <label className="bf-cfg-toggle">
                      <input type="checkbox" checked={editAgenteCampos.activo} onChange={e => setEditAgenteCampos(p => ({ ...p, activo: e.target.checked }))} />
                      Activo
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <BotonAccion className="bf-guia-save-btn" onClick={guardarAgente} cargandoTexto="Guardando…">
                      Guardar
                    </BotonAccion>
                    <button className="bf-guia-cancel-btn" onClick={() => setEditAgenteId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="bf-avatar"
                    style={{ background: colorPara(id), width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}
                  >
                    {iniciales(a.nombre)}
                  </div>
                  <div className="bf-cfg-info">
                    <span className="bf-cfg-nombre">{a.nombre}</span>
                    <span className="bf-cfg-sub">
                      +{a.whatsapp}{a.email && <> · {a.email}</>}
                      <AvisosAgente a={a} />
                      {!a.activo && <span className="bf-cfg-pill bf-cfg-pill-off">inactivo</span>}
                    </span>
                    <span className="bf-cfg-id">{id}</span>
                  </div>
                  <button className="bf-icon-btn" onClick={() => iniciarEditAgente(id, a)} title="Editar agente">
                    <IcSliders size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Panel Whitelist */}
      <div className="bf-panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="bf-panel-head">
          <IcPhone size={16} />
          <span>Whitelist ({usuarios.filter(u => u.activo).length} activos)</span>
          {whitelistActiva
            ? <span className="bf-cfg-pill" style={{ marginLeft: "auto" }}>ACTIVA</span>
            : <span className="bf-cfg-pill bf-cfg-pill-off" style={{ marginLeft: "auto" }}>desactivada</span>}
          <button className="bf-guia-add-btn" onClick={() => setCreandoUsuario(true)} title="Agregar número">
            <IcPlus size={15} />
          </button>
        </div>

        <div className="bf-list-body bf-scroll">
          {!whitelistActiva && (
            <div className="bf-cfg-notice">
              La whitelist está <strong>desactivada</strong> — el bot acepta mensajes de cualquier número.
              Actívala con la variable de entorno <code>WHITELIST_ACTIVA=true</code>.
            </div>
          )}

          {creandoUsuario && (
            <div className="bf-guia-new-form">
              <input className="bf-guia-input" placeholder="Número (ej: 4771234567)" value={nuevoUNum} onChange={e => setNuevoUNum(e.target.value)} />
              <input className="bf-guia-input" placeholder="Nombre completo" value={nuevoUNombre} onChange={e => setNuevoUNombre(e.target.value)} />
              <input className="bf-guia-input" placeholder="Área / Departamento (opcional)" value={nuevoUArea} onChange={e => setNuevoUArea(e.target.value)} />
              {errUsuario && <p className="bf-guia-err">{errUsuario}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <BotonAccion className="bf-guia-save-btn" onClick={handleCrearUsuario} cargandoTexto="Agregando…">
                  Agregar
                </BotonAccion>
                <button className="bf-guia-cancel-btn" onClick={() => { setCreandoUsuario(false); setErrUsuario(""); }}>Cancelar</button>
              </div>
            </div>
          )}

          {usuarios.length === 0 && !creandoUsuario && (
            <div className="bf-empty">
              <div className="bf-empty-ic"><IcPhone size={28} /></div>
              <p className="bf-empty-title">Sin usuarios registrados</p>
              <p className="bf-empty-text">Agrega números para dar acceso al bot.</p>
            </div>
          )}

          {usuarios.map(u => (
            <div key={u.numero} className={`bf-cfg-row${!u.activo ? " is-inactive" : ""}`}>
              <div className="bf-cfg-info">
                <span className="bf-cfg-nombre">{u.nombre}</span>
                <span className="bf-cfg-sub">
                  +{u.numero}
                  {u.area && <span className="bf-cfg-pill">{u.area}</span>}
                  {!u.activo && <span className="bf-cfg-pill bf-cfg-pill-off">inactivo</span>}
                </span>
              </div>
              {u.activo && (
                <BotonAccion
                  className="bf-icon-btn bf-icon-btn-danger"
                  onClick={() => onDesactivarUsuario(u.numero)}
                  title="Desactivar acceso"
                  cargandoTexto=""
                  confirmar={`¿Quitar a ${u.nombre} (+${u.numero}) de la whitelist?`}
                >
                  <IcTrash size={14} />
                </BotonAccion>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   Estilos
   ────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
   USO (solo admin): adopción del portal y del WhatsApp
   ────────────────────────────────────────────────────────────── */

// Series de las gráficas, validadas con el script de dataviz (contraste,
// daltonismo, croma) sobre fondo blanco. El verde de la marca sale gris como
// color de serie, por eso WhatsApp va en azul.
const SERIE_WHATSAPP = "#2A78A8";
const SERIE_PORTAL = "#D06430";

const diaCorto = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

// Barras por día, apiladas cuando hay más de una serie. Divs en vez de SVG para
// que se estire al ancho sin deformar texto; el detalle va en un tooltip al
// pasar el mouse por toda la columna del día (blanco más grande que la barra).
function BarrasPorDia({ titulo, datos, series, detalle }) {
  const [hover, setHover] = useState(null);
  const total = (d) => series.reduce((s, x) => s + (d[x.clave] || 0), 0);
  const max = Math.max(1, ...datos.map(total));
  const vacio = datos.every((d) => total(d) === 0);
  const medio = Math.floor(datos.length / 2);
  return (
    <figure className="bf-uso-graf">
      <figcaption className="bf-uso-graf-head">
        <span className="bf-uso-graf-titulo">{titulo}</span>
        {series.length > 1 && (
          <span className="bf-uso-leyenda">
            {series.map((x) => (
              <span key={x.clave}><i style={{ background: x.color }} />{x.label}</span>
            ))}
          </span>
        )}
      </figcaption>
      {vacio ? (
        <p className="bf-uso-vacio">Sin actividad en este periodo.</p>
      ) : (
        <>
          <div className="bf-uso-plot" onMouseLeave={() => setHover(null)}>
            <span className="bf-uso-max">{max}</span>
            <div className="bf-uso-barras">
              {datos.map((d, i) => (
                <div key={d.dia} className="bf-uso-col" onMouseEnter={() => setHover(i)}>
                  <div className="bf-uso-pila" style={{ height: `${(total(d) / max) * 100}%` }}>
                    {series.map((x) => d[x.clave] > 0 && (
                      <span key={x.clave} style={{ flexGrow: d[x.clave], background: x.color }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {hover !== null && (
              // Dentro de la gráfica (no tapa la leyenda) y hacia el lado con espacio:
              // en las orillas no se sale de la tarjeta ni de la pantalla
              <div className={`bf-uso-tip${hover < datos.length / 3 ? " izq" : hover > (datos.length * 2) / 3 ? " der" : ""}`}
                   style={{ left: `${((hover + 0.5) / datos.length) * 100}%` }}>
                <b>{diaCorto(datos[hover].dia)}</b>
                {detalle(datos[hover]).map(([k, v, color]) => (
                  <span key={k}>{color && <i style={{ background: color }} />}{k}: <b>{v}</b></span>
                ))}
              </div>
            )}
          </div>
          <div className="bf-uso-ejex">
            <span>{diaCorto(datos[0].dia)}</span>
            <span>{diaCorto(datos[medio].dia)}</span>
            <span>{diaCorto(datos[datos.length - 1].dia)}</span>
          </div>
          <details className="bf-uso-datos">
            <summary>Ver datos</summary>
            <table>
              <thead><tr><th>Día</th>{detalle(datos[0]).map(([k]) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>
                {datos.filter((d) => total(d) > 0).map((d) => (
                  <tr key={d.dia}><td>{diaCorto(d.dia)}</td>{detalle(d).map(([k, v]) => <td key={k}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

function GestorUso() {
  const [dias, setDias] = useState(30);
  const [uso, setUso] = useState(null);
  const [error, setError] = useState("");

  const cargar = async (n) => {
    setError("");
    try {
      const r = await fetch(`${API}/uso?dias=${n}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("bf_token")}` },
      });
      if (!r.ok) throw new Error();
      setUso(await r.json());
    } catch { setError("No se pudo cargar el uso."); }
  };
  useEffect(() => { setUso(null); cargar(dias); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const c = uso?.cuentas;

  return (
    <section className="bf-uso">
      <div className="bf-uso-filtros" role="tablist" aria-label="Periodo">
        {[7, 30, 90].map((n) => (
          <button key={n} role="tab" aria-selected={dias === n} className="bf-uso-periodo" onClick={() => setDias(n)}>
            {n} días
          </button>
        ))}
      </div>

      {error ? (
        <div className="bf-empty"><p className="bf-empty-title">{error}</p></div>
      ) : !uso ? (
        <div className="bf-uso-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="bf-skel" />)}</div>
      ) : (
        <>
          <div className="bf-uso-kpis">
            <div className="bf-uso-kpi">
              <span className="bf-uso-kpi-k">WhatsApp ligado</span>
              <span className="bf-uso-kpi-v">{c.con_whatsapp} <small>de {c.usuarios}</small></span>
              <span className="bf-uso-kpi-s">{pct(c.con_whatsapp, c.usuarios)}% de las cuentas de usuario</span>
            </div>
            <div className="bf-uso-kpi">
              <span className="bf-uso-kpi-k">Entraron al portal</span>
              <span className="bf-uso-kpi-v">{c.entraron_en_periodo}</span>
              <span className="bf-uso-kpi-s">en {dias} días · {c.entraron_alguna_vez} alguna vez</span>
            </div>
            <div className="bf-uso-kpi">
              <span className="bf-uso-kpi-k">Le escribieron al bot</span>
              <span className="bf-uso-kpi-v">{uso.bot.numeros}</span>
              <span className="bf-uso-kpi-s">{uso.bot.sin_cuenta} sin cuenta ligada · {uso.bot.mensajes} mensajes</span>
            </div>
            <div className="bf-uso-kpi">
              <span className="bf-uso-kpi-k">Tickets</span>
              <span className="bf-uso-kpi-v">{uso.tickets.whatsapp + uso.tickets.web}</span>
              <span className="bf-uso-kpi-s">{uso.tickets.whatsapp} por WhatsApp · {uso.tickets.web} por portal</span>
            </div>
          </div>

          <div className="bf-uso-grid">
            <div className="bf-panel bf-uso-panel">
              <BarrasPorDia
                titulo="Tickets por día"
                datos={uso.por_dia}
                series={[
                  { clave: "tickets_whatsapp", label: "WhatsApp", color: SERIE_WHATSAPP },
                  { clave: "tickets_web", label: "Portal", color: SERIE_PORTAL },
                ]}
                detalle={(d) => [["WhatsApp", d.tickets_whatsapp, SERIE_WHATSAPP], ["Portal", d.tickets_web, SERIE_PORTAL]]}
              />
            </div>
            <div className="bf-panel bf-uso-panel">
              <BarrasPorDia
                titulo="Personas que le escriben al bot"
                datos={uso.por_dia}
                series={[{ clave: "numeros_bot", label: "Personas", color: SERIE_WHATSAPP }]}
                detalle={(d) => [["Personas", d.numeros_bot], ["Mensajes", d.mensajes_bot]]}
              />
            </div>
            <div className="bf-panel bf-uso-panel">
              <BarrasPorDia
                titulo="Ligaron su WhatsApp"
                datos={uso.por_dia}
                series={[{ clave: "ligaron", label: "Ligaron", color: SERIE_WHATSAPP }]}
                detalle={(d) => [["Ligaron", d.ligaron]]}
              />
            </div>

            <div className="bf-panel bf-uso-panel">
              <div className="bf-uso-graf-titulo">Adopción por área</div>
              <div className="bf-uso-scroll">
              <table className="bf-uso-tabla">
                <thead><tr><th>Área</th><th>Cuentas</th><th>WhatsApp</th><th>Entraron</th></tr></thead>
                <tbody>
                  {uso.por_area.map((a) => (
                    <tr key={a.area}>
                      <td>{a.area}</td>
                      <td>{a.cuentas}</td>
                      <td>
                        <span className="bf-uso-barrita" aria-hidden="true">
                          <i style={{ width: `${pct(a.con_whatsapp, a.cuentas)}%` }} />
                        </span>
                        {a.con_whatsapp} <small>({pct(a.con_whatsapp, a.cuentas)}%)</small>
                      </td>
                      <td>{a.entraron}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <div className="bf-panel bf-uso-panel">
            <div className="bf-uso-graf-titulo">Quién le escribe al bot <small>· últimos {dias} días</small></div>
            {uso.escritores.length === 0 ? (
              <p className="bf-uso-vacio">Nadie le ha escrito al bot en este periodo.</p>
            ) : (
              <div className="bf-uso-scroll">
                <table className="bf-uso-tabla">
                  <thead><tr><th>Quién</th><th>Número</th><th>Área</th><th></th><th>Mensajes</th><th>Último</th></tr></thead>
                  <tbody>
                    {uso.escritores.map((e) => (
                      <tr key={e.numero}>
                        <td>{e.nombre || <span className="bf-uso-tenue">Sin cuenta</span>}</td>
                        <td>+{e.numero}</td>
                        <td>{e.area || "—"}</td>
                        <td>
                          {e.ti ? <span className="bf-cfg-pill">TI</span>
                            : e.ligado ? <span className="bf-cfg-pill">Ligado</span>
                            : <span className="bf-cfg-pill bf-cfg-pill-off">Sin ligar</span>}
                        </td>
                        <td>{e.mensajes}</td>
                        <td>{e.ultimo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bf-uso-grid tres">
            {[
              ["Ligaron recientemente", uso.ligaron, "Todavía nadie ligó su WhatsApp."],
              ["Últimos accesos al portal", uso.accesos, "Todavía nadie ha entrado."],
            ].map(([titulo, lista, vacio]) => (
              <div key={titulo} className="bf-panel bf-uso-panel">
                <div className="bf-uso-graf-titulo">{titulo}</div>
                {lista.length === 0 ? <p className="bf-uso-vacio">{vacio}</p> : (
                  <ul className="bf-uso-lista">
                    {lista.map((p, i) => (
                      <li key={i}><span><b>{p.nombre}</b><small>{p.area || "Sin área"}</small></span><time>{p.fecha}</time></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <div className="bf-panel bf-uso-panel">
              <div className="bf-uso-graf-titulo">Se quedaron a medias</div>
              <p className="bf-uso-nota">Pidieron su código de WhatsApp y no lo mandaron.</p>
              {uso.pendientes.length === 0 ? <p className="bf-uso-vacio">Nadie pendiente.</p> : (
                <ul className="bf-uso-lista">
                  {uso.pendientes.map((p, i) => (
                    <li key={i}>
                      <span><b>{p.nombre}</b><small>{p.area || "Sin área"}{p.vencido ? " · código vencido" : ""}</small></span>
                      <time>{p.pedido}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="bf-uso-nota">
            Cuándo ligó cada quien su WhatsApp y su último acceso se registran desde el 26/10/2026;
            los mensajes y tickets, desde el inicio. Los días son en hora de planta.
          </p>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   CUENTAS (solo admin): las personas del sistema y el catálogo de áreas
   ────────────────────────────────────────────────────────────── */

const ROL_UI = { usuario: "Usuario", tecnico: "Técnico", admin: "Admin" };

// Se carga sola, como el portal: solo la abre un admin y no tiene nada que ver
// con el polling de la cola. Desactivar en vez de borrar: los tickets de esa
// persona se quedan. El backend valida todo (área del catálogo, WhatsApp libre).
function GestorCuentas({ miUsuario }) {
  const [personas, setPersonas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busca, setBusca] = useState("");
  const [estado, setEstado] = useState("activas");   // activas | desactivadas | todas
  const [rolFiltro, setRolFiltro] = useState("");
  const [editId, setEditId] = useState(null);         // id de la cuenta | "nueva"
  const [campos, setCampos] = useState({});
  const [error, setError] = useState("");

  const [creandoArea, setCreandoArea] = useState(false);
  const [nuevaArea, setNuevaArea] = useState("");
  const [editAreaId, setEditAreaId] = useState(null);
  const [editAreaNombre, setEditAreaNombre] = useState("");
  const [errorArea, setErrorArea] = useState("");

  const api = async (ruta, opts = {}) => {
    const r = await fetch(`${API}${ruta}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("bf_token")}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || "No se pudo guardar.");
    return data;
  };

  const cargar = async () => {
    try {
      const [p, a] = await Promise.all([api("/personas"), api("/areas-cuenta?todas=true")]);
      setPersonas(p.personas || []);
      setAreas(a.areas || []);
    } catch (e) { console.error("Error al cargar cuentas", e); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuántas cuentas activas tiene cada área (por nombre, sin mayúsculas)
  const porArea = useMemo(() => {
    const n = {};
    personas.forEach((p) => {
      if (p.activo && p.area) n[p.area.toLowerCase()] = (n[p.area.toLowerCase()] || 0) + 1;
    });
    return n;
  }, [personas]);

  const q = busca.trim().toLowerCase();
  const visibles = personas.filter((p) =>
    (estado === "todas" || (estado === "activas") === p.activo) &&
    (!rolFiltro || p.rol === rolFiltro) &&
    (!q || [p.nombre, p.usuario, p.email, p.area, p.whatsapp]
      .some((v) => String(v || "").toLowerCase().includes(q))));
  const nActivas = personas.filter((p) => p.activo).length;

  const abrir = (p) => {
    setError("");
    setEditId(p.id);
    setCampos({ nombre: p.nombre, email: p.email || "", area: p.area || "",
                whatsapp: p.whatsapp || "", rol: p.rol, activo: p.activo });
  };
  const nueva = () => {
    setError("");
    setEditId("nueva");
    setCampos({ usuario: "", nombre: "", email: "", area: "", whatsapp: "", rol: "usuario", password: "" });
  };
  const campo = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setCampos((c) => ({ ...c, [k]: v }));
    setError("");
  };

  const guardar = async () => {
    setError("");
    try {
      if (editId === "nueva") await api("/personas", { method: "POST", body: JSON.stringify(campos) });
      else await api(`/personas/${editId}`, { method: "PATCH", body: JSON.stringify(campos) });
      setEditId(null);
      await cargar();
    } catch (e) { setError(e.message); }
  };

  const guardarArea = async (id, cambios) => {
    setErrorArea("");
    try {
      if (id) await api(`/areas-cuenta/${id}`, { method: "PATCH", body: JSON.stringify(cambios) });
      else await api("/areas-cuenta", { method: "POST", body: JSON.stringify(cambios) });
      setCreandoArea(false); setNuevaArea(""); setEditAreaId(null);
      await cargar();
    } catch (e) { setErrorArea(e.message); }
  };

  // El área que ya trae la cuenta se ofrece aunque esté desactivada en el catálogo
  const opcionesArea = areas.filter((a) => a.activo || a.nombre === campos.area);

  const formulario = (esNueva) => (
    <div className="bf-cta-form">
      {esNueva ? (
        <label className="bf-cta-campo">
          <span>Usuario</span>
          <input className="bf-guia-input" placeholder="ej. jperez" autoCapitalize="none"
                 value={campos.usuario} onChange={campo("usuario")} />
        </label>
      ) : (
        <span className="bf-cfg-id">{personas.find((p) => p.id === editId)?.usuario}</span>
      )}
      <label className="bf-cta-campo">
        <span>Nombre</span>
        <input className="bf-guia-input" value={campos.nombre} onChange={campo("nombre")} />
      </label>
      <label className="bf-cta-campo">
        <span>Correo</span>
        <input className="bf-guia-input" type="email" placeholder="Opcional" value={campos.email} onChange={campo("email")} />
      </label>
      <label className="bf-cta-campo">
        <span>Área</span>
        <select className="bf-guia-input" value={campos.area} onChange={campo("area")}>
          <option value="">Sin área</option>
          {opcionesArea.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
        </select>
      </label>
      <div className="bf-cta-campo">
        <label htmlFor="bf-cta-wa">WhatsApp</label>
        <div className="bf-cta-wa">
          <input id="bf-cta-wa" className="bf-guia-input" inputMode="tel" placeholder="10 dígitos (opcional)"
                 value={campos.whatsapp} onChange={campo("whatsapp")} />
          {campos.whatsapp && (
            <button type="button" className="bf-guia-cancel-btn" onClick={() => setCampos((c) => ({ ...c, whatsapp: "" }))}>
              Quitar
            </button>
          )}
        </div>
      </div>
      <label className="bf-cta-campo">
        <span>Rol</span>
        <select className="bf-guia-input" value={campos.rol} onChange={campo("rol")}>
          {Object.entries(ROL_UI).map(([r, l]) => <option key={r} value={r}>{l}</option>)}
        </select>
      </label>
      {esNueva ? (
        <div className="bf-cta-campo">
          <label htmlFor="bf-cta-pass">Contraseña inicial</label>
          <input id="bf-cta-pass" className="bf-guia-input" value={campos.password} onChange={campo("password")}
                 placeholder="Mínimo 8 caracteres" aria-describedby="bf-cta-pass-ayuda" />
          <small id="bf-cta-pass-ayuda">Se la das a la persona; la cambia la primera vez que entra.</small>
        </div>
      ) : (
        <label className="bf-cfg-toggle">
          <input type="checkbox" checked={campos.activo} onChange={campo("activo")}
                 disabled={personas.find((p) => p.id === editId)?.usuario === miUsuario} />
          Cuenta activa
        </label>
      )}
      {error && <p className="bf-guia-err">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <BotonAccion className="bf-guia-save-btn" onClick={guardar} cargandoTexto={esNueva ? "Creando…" : "Guardando…"}>
          {esNueva ? "Crear cuenta" : "Guardar"}
        </BotonAccion>
        <button className="bf-guia-cancel-btn" onClick={() => setEditId(null)}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <section className="bf-work bf-cta">
      {/* Cuentas */}
      <div className="bf-panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="bf-panel-head">
          <IcUser size={16} />
          <span>Cuentas ({nActivas} activas)</span>
          <button className="bf-guia-add-btn" onClick={nueva} title="Nueva cuenta" aria-label="Nueva cuenta">
            <IcPlus size={15} />
          </button>
        </div>
        <div className="bf-cta-filtros">
          <input className="bf-guia-input" type="search" aria-label="Buscar cuenta"
                 placeholder="Nombre, usuario, correo, área o WhatsApp…"
                 value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select className="bf-guia-input" aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="activas">Activas</option>
            <option value="desactivadas">Desactivadas</option>
            <option value="todas">Todas</option>
          </select>
          <select className="bf-guia-input" aria-label="Rol" value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)}>
            <option value="">Todos los roles</option>
            {Object.entries(ROL_UI).map(([r, l]) => <option key={r} value={r}>{l}</option>)}
          </select>
        </div>

        <div className="bf-list-body bf-scroll">
          {editId === "nueva" && <div className="bf-cfg-row">{formulario(true)}</div>}

          {cargando ? (
            [0, 1, 2].map((i) => <div key={i} className="bf-skel" />)
          ) : visibles.length === 0 ? (
            <div className="bf-empty">
              <div className="bf-empty-ic"><IcUser size={28} /></div>
              <p className="bf-empty-title">Ninguna cuenta coincide</p>
              <p className="bf-empty-text">Prueba con otro nombre o cambia el filtro.</p>
            </div>
          ) : (
            visibles.map((p) => (
              <div key={p.id} className={`bf-cfg-row${p.activo ? "" : " is-inactive"}`}>
                {editId === p.id ? formulario(false) : (
                  <>
                    <div className="bf-avatar"
                         style={{ background: colorPara(String(p.id)), width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}>
                      {iniciales(p.nombre)}
                    </div>
                    <div className="bf-cfg-info">
                      <span className="bf-cfg-nombre">{p.nombre}</span>
                      <span className="bf-cfg-sub">
                        {p.usuario || p.email}{p.area ? ` · ${p.area}` : " · sin área"}
                      </span>
                      <span className="bf-cfg-sub">
                        {p.rol !== "usuario" && <span className="bf-cfg-pill">{ROL_UI[p.rol] || p.rol}</span>}
                        <span className={`bf-cfg-pill${p.email ? "" : " bf-cfg-pill-off"}`}>{p.email ? "correo" : "sin correo"}</span>
                        {p.whatsapp && <span className="bf-cfg-pill">WhatsApp</span>}
                        {!p.activo && <span className="bf-cfg-pill bf-cfg-pill-off">desactivada</span>}
                      </span>
                    </div>
                    <button className="bf-icon-btn" onClick={() => abrir(p)} title="Editar cuenta" aria-label={`Editar ${p.nombre}`}>
                      <IcSliders size={14} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Catálogo de áreas */}
      <div className="bf-panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="bf-panel-head">
          <IcSettings size={16} />
          <span>Áreas ({areas.filter((a) => a.activo).length})</span>
          <button className="bf-guia-add-btn" onClick={() => { setCreandoArea(true); setErrorArea(""); }}
                  title="Nueva área" aria-label="Nueva área">
            <IcPlus size={15} />
          </button>
        </div>
        <div className="bf-list-body bf-scroll">
          <p className="bf-cta-nota">
            Las cuentas eligen su área de esta lista. Renombrar un área la cambia en sus
            cuentas; los tickets ya levantados se quedan como estaban.
          </p>
          {creandoArea && (
            <div className="bf-guia-new-form">
              <input className="bf-guia-input" aria-label="Nombre del área nueva" placeholder="Ej. Compras"
                     value={nuevaArea} onChange={(e) => { setNuevaArea(e.target.value); setErrorArea(""); }} />
              {errorArea && <p className="bf-guia-err">{errorArea}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <BotonAccion className="bf-guia-save-btn" onClick={() => guardarArea(null, { nombre: nuevaArea })}
                             cargandoTexto="Creando…" disabled={!nuevaArea.trim()}>
                  Crear área
                </BotonAccion>
                <button className="bf-guia-cancel-btn" onClick={() => { setCreandoArea(false); setErrorArea(""); }}>Cancelar</button>
              </div>
            </div>
          )}
          {areas.map((a) => (
            <div key={a.id} className={`bf-cfg-row${a.activo ? "" : " is-inactive"}`}>
              {editAreaId === a.id ? (
                <div className="bf-cta-form">
                  <input className="bf-guia-input" aria-label={`Nuevo nombre de ${a.nombre}`} value={editAreaNombre}
                         onChange={(e) => { setEditAreaNombre(e.target.value); setErrorArea(""); }} />
                  {errorArea && <p className="bf-guia-err">{errorArea}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <BotonAccion className="bf-guia-save-btn" onClick={() => guardarArea(a.id, { nombre: editAreaNombre })}
                                 cargandoTexto="Guardando…">
                      Renombrar
                    </BotonAccion>
                    <button className="bf-guia-cancel-btn" onClick={() => setEditAreaId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bf-cfg-info">
                    <span className="bf-cfg-nombre">{a.nombre}</span>
                    <span className="bf-cfg-sub">
                      {porArea[a.nombre.toLowerCase()] || 0} cuenta{porArea[a.nombre.toLowerCase()] === 1 ? "" : "s"}
                      {!a.activo && <span className="bf-cfg-pill bf-cfg-pill-off">desactivada</span>}
                    </span>
                  </div>
                  <button className="bf-icon-btn" title="Renombrar" aria-label={`Renombrar ${a.nombre}`}
                          onClick={() => { setEditAreaId(a.id); setEditAreaNombre(a.nombre); setErrorArea(""); }}>
                    <IcSliders size={14} />
                  </button>
                  <BotonAccion className="bf-guia-cancel-btn" cargandoTexto=""
                               onClick={() => guardarArea(a.id, { activo: !a.activo })}>
                    {a.activo ? "Desactivar" : "Activar"}
                  </BotonAccion>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   PORTAL DEL USUARIO FINAL
   Lo que ve un administrativo: levantar un ticket y seguirle la
   pista. No es el dashboard con cosas escondidas — es otra app
   sobre la misma build, elegida por el rol en /auth/yo.
   ────────────────────────────────────────────────────────────── */

// El usuario no habla en estados de máquina. Cada uno se traduce a lo que
// significa para él, y "qué sigue" le dice si la pelota está de su lado.
const ESTADO_USUARIO = {
  OPEN:             { label: "Recibido",        tono: "espera",  sigue: "Esperando que alguien de TI lo tome." },
  ASSIGNED:         { label: "Asignado",        tono: "activo",  sigue: "Ya tiene dueño en TI." },
  IN_PROGRESS:      { label: "En proceso",      tono: "activo",  sigue: "TI está trabajando en esto." },
  WAITING_FOR_USER: { label: "Te preguntaron",  tono: "tuyo",    sigue: "Necesitan tu respuesta para seguir." },
  REOPENED:         { label: "Reabierto",       tono: "activo",  sigue: "Lo retomaron porque el problema siguió." },
  RESOLVED:         { label: "Resuelto",        tono: "listo",   sigue: "¿Quedó bien? Si no, dinos y lo reabrimos." },
  CLOSED:           { label: "Cerrado",         tono: "listo",   sigue: "Este caso quedó archivado." },
  abierto:          { label: "Recibido",        tono: "espera",  sigue: "Esperando que alguien de TI lo tome." },
  cerrado:          { label: "Resuelto",        tono: "listo",   sigue: "Este caso quedó archivado." },
};
const metaUsuario = (e) => ESTADO_USUARIO[e] || { label: e || "—", tono: "espera", sigue: "" };

// Los temas del paso 1. `categoria` es la del backend (CATEGORIAS_PORTAL);
// la etiqueta es como habla la gente ("Mi equipo", no "Hardware"). "No sé"
// no manda categoría y el backend la deduce del texto, como siempre.
const TEMAS_PORTAL = [
  { id: "accesos", categoria: "🔑 Accesos", label: "Accesos",
    hint: "Contraseñas, cuentas bloqueadas, permisos",
    sugerencias: ["Olvidé mi contraseña", "Mi cuenta está bloqueada", "Necesito acceso a una carpeta"],
    ayuda: "¿En qué sistema? ¿Qué mensaje te sale?",
    icono: <><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></> },
  { id: "red", categoria: "🌐 Red", label: "Red",
    hint: "Sin internet, Wi‑Fi lento, VPN",
    sugerencias: ["No tengo internet", "El Wi‑Fi está muy lento", "No conecta la VPN"],
    ayuda: "¿Desde cuándo? ¿Le pasa a alguien más cerca de ti?",
    icono: <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></> },
  { id: "impresora", categoria: "🖨️ Impresora", label: "Impresora",
    hint: "No imprime, atasca, sale rayado",
    sugerencias: ["No imprime", "Se atasca el papel", "Sale rayado o manchado"],
    ayuda: "¿Cuál impresora? ¿En qué piso o área está?",
    icono: <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></> },
  { id: "equipo", categoria: "💻 Hardware", label: "Mi equipo",
    hint: "No prende, está lento, pantalla, teclado",
    sugerencias: ["No prende", "Está muy lento", "Falla el teclado o el mouse"],
    ayuda: "¿Qué hace o qué deja de hacer? ¿Desde cuándo?",
    icono: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></> },
  { id: "programas", categoria: "⚙️ Software", label: "Programas",
    hint: "SISPRO, Excel, Outlook, instalar algo",
    sugerencias: ["SISPRO no abre", "Outlook no recibe correos", "Necesito instalar un programa"],
    ayuda: "¿Qué programa? ¿Qué mensaje te sale?",
    icono: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="m8 13 2 2-2 2"/><line x1="13" y1="17" x2="16" y2="17"/></> },
  { id: "otro", categoria: null, label: "No sé / otro",
    hint: "Solo cuéntanos qué pasa",
    sugerencias: [],
    ayuda: "Mientras más detalle, menos preguntas de regreso.",
    icono: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
];
const TEMA_OTRO = TEMAS_PORTAL[TEMAS_PORTAL.length - 1];

// Los 4 pasos que ve el usuario. WAITING_FOR_USER cuenta como "en proceso":
// TI ya está en ello, solo espera su respuesta.
const PASOS_AVANCE = ["Recibido", "Asignado", "En proceso", "Resuelto"];
const avanceDe = (estado) => ({
  OPEN: 1, abierto: 1, ASSIGNED: 2, REOPENED: 2,
  IN_PROGRESS: 3, WAITING_FOR_USER: 3, RESOLVED: 4, CLOSED: 4, cerrado: 4,
}[estado] || 1);

function Avance({ estado, etiquetas = false }) {
  const n = avanceDe(estado);
  return (
    <ol className={`bf-pt-avance${etiquetas ? " con-etiquetas" : ""}`} aria-label={`Avance: ${PASOS_AVANCE[n - 1]}`}>
      {PASOS_AVANCE.map((p, i) => (
        <li key={p} className={i < n ? "hecho" : ""} aria-current={i === n - 1 ? "step" : undefined}>
          <span className="bf-pt-avance-barra" />
          {etiquetas && <span className="bf-pt-avance-txt">{p}</span>}
        </li>
      ))}
    </ol>
  );
}

const haceCuanto = (ms) => {
  const t = textoEdad(ms);
  return t === "ahora" || t === "—" ? t : `hace ${t}`;
};

// "524771234567" → "+52 477 123 4567"; cualquier otro formato, tal cual con "+".
const numeroLegible = (n) => {
  const d = String(n || "").replace(/\D/g, "");
  return d.length === 12 && d.startsWith("52")
    ? `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
    : d ? `+${d}` : "";
};

const mmss = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// El portal cambia de forma, no solo de tamaño: en celular, una pantalla a la
// vez; en computadora, el flujo a la izquierda y "Mis tickets" siempre al lado.
const ESCRITORIO = "(min-width: 960px)";
function useEsEscritorio() {
  const consulta = () => !!window.matchMedia && window.matchMedia(ESCRITORIO).matches;
  const [es, setEs] = useState(consulta);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(ESCRITORIO);
    const cambio = () => setEs(m.matches);
    m.addEventListener("change", cambio);
    return () => m.removeEventListener("change", cambio);
  }, []);
  return es;
}

function PortalUsuario({ perfil, onLogout }) {
  const escritorio = useEsEscritorio();
  const [miPerfil, setMiPerfil] = useState(null);
  const [misTickets, setMisTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Una pantalla a la vez, como una app de celular:
  // "tema" → "detalles" → "enviado" → "vincular", más "mis" y "detalle".
  // `?vincular` en la URL entra directo a vincular el WhatsApp (el link que va
  // en el aviso a la gente); sobrevive al login porque no hay rutas.
  const [vista, setVista] = useState(() =>
    new URLSearchParams(window.location.search).has("vincular") ? "vincular" : "tema");
  const [volverDeVinc, setVolverDeVinc] = useState("tema");
  const [pestana, setPestana] = useState("abiertos");
  const [selId, setSelId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  // Formulario
  const [tema, setTema] = useState(null);
  const [desc, setDesc] = useState("");
  // Solo se pregunta cuando el perfil no trae área: el mismo criterio que en
  // WhatsApp, para que ningún ticket llegue a TI sin saber de dónde viene.
  const [areaTicket, setAreaTicket] = useState("");
  const [formError, setFormError] = useState("");
  const [exito, setExito] = useState(null);     // {id} del ticket recién creado

  // Vinculación de WhatsApp
  const [vinc, setVinc] = useState(null);       // respuesta de /mi/vinculacion + `vence` (ms)
  const [vincError, setVincError] = useState("");
  const [reloj, setReloj] = useState(Date.now()); // late cada segundo solo en "vincular"

  // Respuesta en el detalle
  const [respuesta, setRespuesta] = useState("");
  const [respFeedback, setRespFeedback] = useState(null);

  const tok = () => localStorage.getItem("bf_token");
  const headers = () => ({ Authorization: `Bearer ${tok()}` });

  const ir = (v) => { setVista(v); window.scrollTo(0, 0); };
  // A vincular se llega desde el inicio, desde "enviado" o desde Mis tickets;
  // "atrás" y "Ahora no" regresan a donde estaba.
  const irAVincular = () => { setVolverDeVinc(vista); ir("vincular"); };

  // Ya se usó el ?vincular: que recargar la página no vuelva a entrar ahí.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("vincular")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const abrirTicket = (id) => { setSelId(id); setRespuesta(""); ir("detalle"); };

  const cargarPerfil = async () => {
    try {
      const r = await fetch(`${API}/mi/perfil`, { headers: headers() });
      if (r.ok) setMiPerfil(await r.json());
    } catch (e) { console.error("Error al cargar perfil", e); }
  };

  const cargarTickets = async () => {
    try {
      const r = await fetch(`${API}/mi/tickets`, { headers: headers() });
      if (r.ok) {
        const data = await r.json();
        setMisTickets(data.tickets || []);
      }
    } catch (e) { console.error("Error al cargar mis tickets", e); }
    finally { setCargando(false); }
  };

  const cargarDetalle = async (id) => {
    setCargandoDetalle(true);
    try {
      const r = await fetch(`${API}/mi/tickets/${id}`, { headers: headers() });
      setDetalle(r.ok ? await r.json() : null);
    } catch (e) { console.error("Error al cargar el ticket", e); setDetalle(null); }
    finally { setCargandoDetalle(false); }
  };

  useEffect(() => { cargarPerfil(); cargarTickets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresco ligero: son los tickets de una sola persona, no la cola completa.
  // Se pausa con la pestaña oculta, igual que el dashboard de TI.
  const enDetalle = vista === "detalle" && selId;
  useEffect(() => {
    const tick = () => { if (!document.hidden) { cargarTickets(); if (enDetalle) cargarDetalle(selId); } };
    const i = setInterval(tick, 20000);
    const alVolver = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", alVolver); };
  }, [enDetalle, selId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const i = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (enDetalle) cargarDetalle(selId); else setDetalle(null);
  }, [enDetalle, selId]); // eslint-disable-line react-hooks/exhaustive-deps

  const vinculado = miPerfil?.whatsapp_vinculado;

  // En "vincular": el código se pide al entrar, la cuenta regresiva late cada
  // segundo, y el perfil se revisa cada 4 s para enterarse en cuanto el bot
  // canjea el código (y al volver de WhatsApp, sin esperar al siguiente tick).
  const enVincular = vista === "vincular" && !vinculado;
  useEffect(() => {
    if (!enVincular) return;
    if (!vinc || vinc.vence <= Date.now()) pedirCodigo();
    const r = setInterval(() => setReloj(Date.now()), 1000);
    const p = setInterval(() => { if (!document.hidden) cargarPerfil(); }, 4000);
    const alVolver = () => { if (!document.hidden) cargarPerfil(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(r); clearInterval(p); document.removeEventListener("visibilitychange", alVolver); };
  }, [enVincular]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirTema = (t) => { setTema(t); setFormError(""); ir("detalles"); };

  // Tocar una sugerencia la escribe en los detalles; la persona completa el resto.
  const usarSugerencia = (s) => {
    setFormError("");
    setDesc((d) => (d.includes(s) ? d : d.trim() ? `${d.trim()} ${s}.` : `${s}. `));
  };

  const crearTicket = async () => {
    setFormError("");
    if (desc.trim().length < 10) {
      setFormError("Cuéntanos un poco más de lo que está pasando.");
      return;
    }
    if (miPerfil && !miPerfil.area && !areaTicket.trim()) {
      setFormError("Dinos de qué área eres para que TI sepa a dónde ir.");
      return;
    }
    // Solo una categoría que el backend conozca; si su lista cambió, que deduzca.
    const cats = miPerfil?.categorias || [];
    const categoria = tema?.categoria && (!cats.length || cats.includes(tema.categoria))
      ? tema.categoria : undefined;
    try {
      const r = await fetch(`${API}/mi/tickets`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          descripcion: desc.trim(),
          categoria,
          area: areaTicket.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setFormError(data.detail || "No se pudo registrar el ticket."); return; }
      setDesc(""); setTema(null); setAreaTicket("");
      setExito({ id: data.id });
      await cargarTickets();
      ir("enviado");
    } catch {
      setFormError("No se pudo conectar con el servidor.");
    }
  };

  const pedirCodigo = async () => {
    setVincError("");
    try {
      const r = await fetch(`${API}/mi/vinculacion`, { method: "POST", headers: headers() });
      if (!r.ok) { setVincError("No pudimos generar tu código. Intenta de nuevo."); return; }
      const data = await r.json();
      setVinc({ ...data, vence: Date.now() + (data.expira_minutos || 15) * 60000 });
      setReloj(Date.now());
    } catch {
      setVincError("No se pudo conectar con el servidor.");
    }
  };

  const enviarRespuesta = async () => {
    if (!respuesta.trim() || !selId) return;
    try {
      const r = await fetch(`${API}/mi/tickets/${selId}/mensaje`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ texto: respuesta.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setRespuesta("");
        setRespFeedback("ok");
        await cargarDetalle(selId);
        await cargarTickets();
      } else {
        setRespFeedback(data.detail || "No se pudo enviar.");
      }
      setTimeout(() => setRespFeedback(null), 3000);
    } catch {
      setRespFeedback("Error de red.");
      setTimeout(() => setRespFeedback(null), 3000);
    }
  };

  // Lo que espera tu respuesta va primero; después, lo más reciente.
  const reciente = (a, b) => (b.fecha_iso || "").localeCompare(a.fecha_iso || "");
  const abiertos = misTickets
    .filter((t) => ESTADOS_ACTIVOS_SET.has(t.estado))
    .sort((a, b) => (b.estado === "WAITING_FOR_USER") - (a.estado === "WAITING_FOR_USER") || reciente(a, b));
  const cerrados = misTickets.filter((t) => !ESTADOS_ACTIVOS_SET.has(t.estado)).sort(reciente);
  const esperanTuRespuesta = abiertos.filter((t) => t.estado === "WAITING_FOR_USER");
  const nombreCorto = (perfil?.nombre || miPerfil?.nombre || "").trim().split(/\s+/)[0];
  const area = miPerfil?.area || perfil?.area;
  const temaActual = tema || TEMA_OTRO;
  const faltaArea = miPerfil && !miPerfil.area;

  const marca = (
    <div className="bf-pt-marca">
      <div className="bf-pt-logo">b</div>
      <span>Soporte TI</span>
    </div>
  );

  const invitacionWhatsApp = miPerfil && !vinculado && (
    <button className="bf-pt-vinc-mini" onClick={irAVincular}>
      <IcCelular size={20} />
      <span>
        <strong>Activa avisos por WhatsApp</strong>
        <small>Para enterarte sin abrir esta página</small>
      </span>
      <IcSigue size={18} />
    </button>
  );

  const listaMis = pestana === "abiertos" ? abiertos : cerrados;
  const contenidoMis = (
    <>
      <div className="bf-pt-tabs" role="tablist" aria-label="Filtrar tickets">
        <button role="tab" className="bf-pt-tab" aria-selected={pestana === "abiertos"} onClick={() => setPestana("abiertos")}>
          Abiertos · {abiertos.length}
        </button>
        <button role="tab" className="bf-pt-tab" aria-selected={pestana === "resueltos"} onClick={() => setPestana("resueltos")}>
          Resueltos · {cerrados.length}
        </button>
      </div>

      {cargando ? (
        <p className="bf-pt-vacio">Cargando…</p>
      ) : misTickets.length === 0 ? (
        <p className="bf-pt-vacio">
          Todavía no has levantado ningún ticket. Cuando lo hagas, aquí puedes
          seguirle la pista sin preguntarle a nadie.
        </p>
      ) : listaMis.length === 0 ? (
        <p className="bf-pt-vacio">
          {pestana === "abiertos" ? "No tienes tickets abiertos." : "Todavía no tienes tickets resueltos."}
        </p>
      ) : (
        <div className="bf-pt-lista">
          {listaMis.map((t) => (
            <FilaPortal
              key={t.id}
              t={t}
              ahora={ahora}
              seleccionado={vista === "detalle" && selId === t.id}
              onAbrir={() => abrirTicket(t.id)}
            />
          ))}
        </div>
      )}

      {!escritorio && invitacionWhatsApp}
    </>
  );

  // En computadora "Mis tickets" vive en el lateral; la columna principal
  // muestra el flujo para levantar uno.
  const vistaPrincipal = escritorio && vista === "mis" ? "tema" : vista;

  let pantalla;

  if (vistaPrincipal === "detalles") {
    pantalla = (
      <>
        <header className="bf-pt-top paso">
          <button className="bf-pt-atras" aria-label="Regresar al paso 1" onClick={() => ir("tema")}>
            <IcAtras size={22} />
          </button>
          <div className="bf-pt-pasos">
            <span className="on" /><span className="on" />
            <span className="bf-pt-pasos-txt">Paso 2 de 2</span>
          </div>
        </header>
        <main className="bf-pt-cuerpo">
          <div className="bf-pt-titulo">
            <button className="bf-pt-tema-elegido" onClick={() => ir("tema")}>
              <Icon d={temaActual.icono} size={16} strokeWidth="2" />
              {temaActual.label}
              <span>· cambiar</span>
            </button>
            <h1 className="bf-pt-h1">Cuéntanos qué pasa</h1>
          </div>

          {temaActual.sugerencias.length > 0 && (
            <div className="bf-pt-field">
              <span className="bf-pt-label-sec">Toca una si aplica</span>
              <div className="bf-pt-sugs">
                {temaActual.sugerencias.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="bf-pt-sug"
                    aria-pressed={desc.includes(s)}
                    onClick={() => usarSugerencia(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bf-pt-field">
            <label htmlFor="bf-desc">Detalles</label>
            <textarea
              id="bf-desc"
              className="bf-pt-textarea"
              rows={6}
              placeholder="Cuéntanos qué está pasando."
              value={desc}
              onChange={(e) => { setDesc(e.target.value); setFormError(""); }}
            />
            <span className="bf-pt-ayuda">Ayuda: {temaActual.ayuda}</span>
          </div>

          {faltaArea && (
            <div className="bf-pt-field">
              <label htmlFor="bf-area">¿De qué área eres?</label>
              <input
                id="bf-area"
                className="bf-pt-input"
                placeholder="Contabilidad, RH, Compras…"
                value={areaTicket}
                onChange={(e) => { setAreaTicket(e.target.value); setFormError(""); }}
              />
            </div>
          )}

          <div className="bf-pt-envio">
            {formError && <p className="bf-pt-error">{formError}</p>}
            <BotonAccion
              className="bf-pt-primario"
              onClick={crearTicket}
              cargandoTexto="Enviando…"
              disabled={desc.trim().length < 10 || (faltaArea && !areaTicket.trim())}
            >
              Enviar a TI
              <IcSend size={18} />
            </BotonAccion>
            {miPerfil?.email && <p className="bf-pt-nota">Te llega el folio por correo al instante.</p>}
          </div>
        </main>
      </>
    );
  } else if (vistaPrincipal === "enviado" && exito) {
    pantalla = (
      <main className="bf-pt-cuerpo">
        <div className="bf-pt-centro">
          <div className="bf-pt-check"><IcCheck size={32} strokeWidth="2.4" /></div>
          <h1 className="bf-pt-h1">Listo{nombreCorto ? `, ${nombreCorto}` : ""}</h1>
          <p>Ya lo registramos. Guarda tu folio por si necesitas preguntar:</p>
          <div className="bf-pt-folio-grande">{exito.id}</div>
          {miPerfil?.email && <p>También te lo mandamos a tu correo.</p>}
        </div>

        <Avance estado="OPEN" etiquetas />

        {miPerfil && !vinculado && (
          <section className="bf-pt-wa-card">
            <div className="bf-pt-wa-card-tit">
              <div className="bf-pt-wa-card-ic"><IcCelular size={20} /></div>
              <h2>¿Te avisamos por WhatsApp?</h2>
            </div>
            <p>
              Te escribimos cuando quede resuelto, para que lo confirmes desde ahí. Y la
              próxima vez puedes levantar tickets desde WhatsApp, aunque no tengas computadora.
            </p>
            <button className="bf-pt-oscuro" onClick={irAVincular}>Activar avisos por WhatsApp</button>
            <small>Toma un minuto, solo la primera vez</small>
          </section>
        )}

        <div className="bf-pt-dos">
          <button className="bf-pt-secundario" onClick={() => abrirTicket(exito.id)}>Ver mi ticket</button>
          <button className="bf-pt-secundario" onClick={() => ir("tema")}>Levantar otro</button>
        </div>
      </main>
    );
  } else if (vistaPrincipal === "vincular") {
    const restante = vinc ? Math.max(0, vinc.vence - reloj) : 0;
    const vencido = !!vinc && restante === 0;
    const codigoListo = vinc && !vencido;
    pantalla = (
      <>
        <header className="bf-pt-top paso">
          <button className="bf-pt-atras" aria-label="Regresar" onClick={() => ir(volverDeVinc)}>
            <IcAtras size={22} />
          </button>
          <span className="bf-pt-top-titulo">Avisos por WhatsApp</span>
        </header>
        {vinculado ? (
          <main className="bf-pt-cuerpo">
            <div className="bf-pt-centro">
              <div className="bf-pt-check"><IcCheck size={32} strokeWidth="2.4" /></div>
              <h1 className="bf-pt-h1">Tu WhatsApp quedó ligado</h1>
              <p>Ya puedes levantar tickets desde WhatsApp, y te avisamos por ahí cuando se resuelvan.</p>
            </div>
            <div className="bf-pt-envio">
              <button className="bf-pt-primario" onClick={() => ir("mis")}>Ir a mis tickets</button>
            </div>
          </main>
        ) : (
          <main className="bf-pt-cuerpo">
            <h1 className="bf-pt-h1">Liga tu WhatsApp en un toque</h1>
            <ol className="bf-pt-instr">
              <li>
                <span className="bf-pt-instr-n">1</span>
                <span>Toca el botón verde de abajo. Se abre WhatsApp con el mensaje ya escrito.</span>
              </li>
              <li>
                <span className="bf-pt-instr-n">2</span>
                <span>Dale <strong>enviar</strong>. Listo, el bot te confirma con tu nombre.</span>
              </li>
            </ol>

            <section className="bf-pt-codigo" aria-label="Tu código">
              {codigoListo ? (
                <>
                  <span className="bf-pt-codigo-tit">El mensaje que se envía</span>
                  <div className="bf-pt-codigo-msg" aria-label={vinc.mensaje}>
                    <span className="bf-pt-codigo-pre" aria-hidden="true">VINCULAR</span>
                    <span className="bf-pt-codigo-letras" aria-hidden="true">
                      {String(vinc.codigo).split("").map((c, i) => <span key={i}>{c}</span>)}
                    </span>
                  </div>
                  <span className="bf-pt-codigo-vence"><IcClock size={15} /> Vence en {mmss(restante)}</span>
                </>
              ) : vencido ? (
                <p className="bf-pt-hint">Este código ya venció. Genera otro abajo.</p>
              ) : vincError ? (
                <p className="bf-pt-error">{vincError}</p>
              ) : (
                <p className="bf-pt-hint bf-pt-generando"><IcSpinner size={16} className="bf-spin" /> Generando tu código…</p>
              )}
            </section>

            {codigoListo && vinc.wa_link && (
              <a className="bf-pt-wa" href={vinc.wa_link} target="_blank" rel="noreferrer">
                <IcWhatsApp size={22} strokeWidth="2" />
                Abrir WhatsApp y enviar
              </a>
            )}
            {codigoListo && (
              <details className="bf-pt-sinabrir" open={!vinc.wa_link}>
                <summary>¿No se abrió WhatsApp?</summary>
                <p>
                  Manda <strong>{vinc.mensaje}</strong> al{" "}
                  <strong>{numeroLegible(vinc.numero_bot) || "número de soporte de TI"}</strong> desde tu celular.
                </p>
              </details>
            )}

            <div className="bf-pt-vinc-pie">
              <BotonAccion className="bf-pt-texto" onClick={pedirCodigo} cargandoTexto="Generando…">
                Generar otro código
              </BotonAccion>
              <button className="bf-pt-texto gris" onClick={() => ir(volverDeVinc)}>Ahora no</button>
            </div>
          </main>
        )}
      </>
    );
  } else if (vistaPrincipal === "mis") {
    pantalla = (
      <>
        <header className="bf-pt-top con-borde">
          {marca}
          <button className="bf-pt-salir" onClick={onLogout}>Salir</button>
        </header>
        <main className="bf-pt-cuerpo con-pie">
          <div className="bf-pt-titulo">
            <h1 className="bf-pt-h1">Mis tickets</h1>
            <p className="bf-pt-sub">{perfil?.nombre}{area ? ` · ${area}` : ""}</p>
          </div>

          {contenidoMis}
        </main>
        <div className="bf-pt-pie-fijo">
          <button className="bf-pt-primario" onClick={() => ir("tema")}>
            <IcPlus size={20} /> Nuevo ticket
          </button>
        </div>
      </>
    );
  } else if (vistaPrincipal === "detalle") {
    pantalla = (
      <>
        <header className="bf-pt-top paso">
          <button className="bf-pt-atras" aria-label="Regresar a mis tickets" onClick={() => { setSelId(null); ir("mis"); }}>
            <IcAtras size={22} />
          </button>
          <span className="bf-pt-top-titulo">{selId}</span>
        </header>
        <main className="bf-pt-cuerpo">
          <DetallePortal
            id={selId}
            t={detalle}
            cargando={cargandoDetalle}
            respuesta={respuesta}
            setRespuesta={setRespuesta}
            feedback={respFeedback}
            onEnviar={enviarRespuesta}
          />
        </main>
      </>
    );
  } else {
    // "tema": la pantalla de inicio
    const primero = esperanTuRespuesta[0];
    pantalla = (
      <>
        {!escritorio && (
          <header className="bf-pt-top">
            {marca}
            <button className="bf-pt-mis" onClick={() => ir("mis")}>
              Mis tickets
              {abiertos.length > 0 && <span className="bf-pt-mis-n">{abiertos.length}</span>}
            </button>
          </header>
        )}
        <main className="bf-pt-cuerpo">
          <div className="bf-pt-titulo">
            <div className="bf-pt-pasos">
              <span className="on" /><span />
              <span className="bf-pt-pasos-txt">Paso 1 de 2</span>
            </div>
            <h1 className="bf-pt-h1">¿Qué está fallando{nombreCorto ? `, ${nombreCorto}` : ""}?</h1>
          </div>

          <div className="bf-pt-temas">
            {TEMAS_PORTAL.map((t) => (
              <button key={t.id} className={`bf-pt-tema${t.categoria ? "" : " otro"}`} onClick={() => elegirTema(t)}>
                <Icon d={t.icono} size={26} strokeWidth="2" />
                <span className="bf-pt-tema-nombre">{t.label}</span>
                <span className="bf-pt-tema-hint">{t.hint}</span>
              </button>
            ))}
          </div>

          {/* Quien solo entra a ligar su WhatsApp lo encuentra aquí, sin levantar ticket */}
          {invitacionWhatsApp}

          {/* Lo que necesita tu atención: TI está esperando tu respuesta */}
          {primero && (
            <button
              className="bf-pt-alerta"
              onClick={() => (esperanTuRespuesta.length === 1 ? abrirTicket(primero.id) : ir("mis"))}
            >
              <IcChat size={20} />
              <span>
                <strong>TI te preguntó algo</strong>{" "}
                {esperanTuRespuesta.length === 1 ? <>en {primero.id}</> : <>en {esperanTuRespuesta.length} tickets</>}
              </span>
              <IcSigue size={18} />
            </button>
          )}
        </main>
      </>
    );
  }

  if (escritorio) {
    return (
      <div className="bf-portal escritorio">
        <style>{CSS}</style>
        <header className="bf-pt-barra">
          {marca}
          <div className="bf-pt-quien">
            <strong>{perfil?.nombre}</strong>
            {area && <span>{area}</span>}
          </div>
          <button className="bf-pt-salir" onClick={onLogout}>Salir</button>
        </header>
        <div className="bf-pt-escritorio">
          <section className="bf-pt-principal">{pantalla}</section>
          <aside className="bf-pt-lateral" aria-label="Mis tickets">
            <div className="bf-pt-lateral-head">
              <h2>Mis tickets</h2>
              {vistaPrincipal !== "tema" && vistaPrincipal !== "detalles" && (
                <button className="bf-pt-nuevo-mini" onClick={() => ir("tema")}>
                  <IcPlus size={16} /> Nuevo ticket
                </button>
              )}
            </div>
            {contenidoMis}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="bf-portal">
      <style>{CSS}</style>
      <div className={`bf-pt-pantalla${vista === "mis" ? " gris" : ""}`}>{pantalla}</div>
    </div>
  );
}

function FilaPortal({ t, ahora, seleccionado = false, onAbrir }) {
  const m = metaUsuario(t.estado);
  const esTuya = t.estado === "WAITING_FOR_USER";
  const activo = ESTADOS_ACTIVOS_SET.has(t.estado);
  const quien = t.asignado_nombre ? t.asignado_nombre.split(/\s+/)[0] : "TI";
  return (
    <button
      className={`bf-pt-fila${esTuya ? " es-tuya" : ""}${seleccionado ? " sel" : ""}`}
      aria-current={seleccionado ? "true" : undefined}
      onClick={onAbrir}
    >
      <div className="bf-pt-fila-top">
        <span className="bf-pt-folio">{t.id}</span>
        <span className={`bf-pt-estado t-${m.tono}`}>{m.label}</span>
        <span className="bf-pt-edad">{haceCuanto(edadMs(t, ahora))}</span>
      </div>
      <div className="bf-pt-fila-desc">{t.descripcion || ultimoMensaje(t)}</div>
      {activo && !esTuya && <Avance estado={t.estado} />}
      <div className="bf-pt-fila-pie">
        <span>
          {esTuya
            ? `${quien} necesita tu respuesta para seguir →`
            : t.asignado_nombre
              ? <><strong>{t.asignado_nombre}</strong> lo está atendiendo</>
              : m.sigue}
        </span>
        {t.canal === "whatsapp" && <span className="bf-pt-canal">WhatsApp</span>}
      </div>
    </button>
  );
}

function DetallePortal({ id, t, cargando, respuesta, setRespuesta, feedback, onEnviar }) {
  const m = t ? metaUsuario(t.estado) : null;
  const puedeResponder = t && !ESTADOS_TERMINALES_SET.has(t.estado);

  if (cargando && !t) return <p className="bf-pt-vacio">Cargando…</p>;
  if (!t) return <p className="bf-pt-vacio">No pudimos abrir este ticket.</p>;

  return (
    <>
      <div className="bf-pt-detalle-estado">
        <span className={`bf-pt-estado t-${m.tono}`}>{m.label}</span>
        <p>{t.asignado_nombre ? `${t.asignado_nombre} lo está atendiendo.` : m.sigue}</p>
      </div>
      <Avance estado={t.estado} etiquetas />

      <dl className="bf-pt-meta">
        <div><dt>Levantado</dt><dd>{t.fecha}</dd></div>
        <div><dt>Categoría</dt><dd>{t.categoria || "—"}</dd></div>
        <div><dt>Canal</dt><dd>{t.canal === "web" ? "Portal" : "WhatsApp"}</dd></div>
        {t.fecha_cierre && <div><dt>Resuelto</dt><dd>{t.fecha_cierre}</dd></div>}
      </dl>

      <div className="bf-pt-sep">Conversación</div>
      <div className="bf-pt-chat">
        {(t.historial || []).length === 0 ? (
          <p className="bf-pt-vacio">Sin mensajes todavía.</p>
        ) : (
          (t.historial || []).map((msg, i) => (
            <div key={i} className={`bf-pt-msg ${msg.role === "user" ? "mio" : "ti"}`}>
              <WaText text={msg.content} />
            </div>
          ))
        )}
      </div>

      {puedeResponder ? (
        <div className="bf-pt-responder">
          <label htmlFor="bf-respuesta" className="bf-pt-label-sec">
            {t.estado === "WAITING_FOR_USER" ? "TI está esperando tu respuesta" : "¿Algo más que TI deba saber?"}
          </label>
          <textarea
            id="bf-respuesta"
            className="bf-pt-textarea"
            rows={3}
            placeholder="Escribe tu mensaje…"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
          />
          <BotonAccion
            className="bf-pt-primario"
            onClick={onEnviar}
            cargandoTexto="Enviando…"
            disabled={!respuesta.trim()}
          >
            Enviar a TI
          </BotonAccion>
          {feedback === "ok" && <span className="bf-pt-ok">Enviado</span>}
          {feedback && feedback !== "ok" && <p className="bf-pt-error">{feedback}</p>}
        </div>
      ) : (
        <p className="bf-pt-hint">
          Este ticket ya está cerrado. Si el problema volvió, levanta uno nuevo y
          menciona el folio {id}.
        </p>
      )}
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.bf-app *{box-sizing:border-box;margin:0;padding:0}
.bf-app{
  display:flex;min-height:100vh;background:${C.bg};color:${C.text};
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.bf-app button{font-family:inherit}

/* ── Login ── */
.bf-login-wrap{align-items:center;justify-content:center}
.bf-login-card{
  background:${C.surface};border:1px solid ${C.border};border-radius:20px;
  padding:40px;width:100%;max-width:380px;display:flex;flex-direction:column;
  align-items:center;box-shadow:0 8px 32px rgba(21,62,62,0.10);
}
.bf-logo-box{
  width:52px;height:52px;border-radius:14px;background:${C.naranja};color:#fff;
  font-weight:800;font-size:26px;display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 14px rgba(208,100,48,0.35);margin-bottom:16px;flex-shrink:0;
}
.bf-login-title{font-size:22px;font-weight:800;color:${C.azulDark};margin-bottom:4px}
.bf-login-sub{font-size:13px;color:${C.textMuted};margin-bottom:24px;text-align:center}
.bf-login-input{
  width:100%;height:46px;border:1px solid ${C.border};border-radius:12px;
  padding:0 16px;font-size:14px;color:${C.text};outline:none;margin-bottom:8px;
  font-family:inherit;transition:border-color .15s,box-shadow .15s;
}
.bf-login-input:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}
.bf-login-error{
  font-size:12.5px;color:${C.rojo};margin-bottom:8px;text-align:center;width:100%;
}

/* ── Sidebar ── */
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

.bf-side-section{margin-top:28px;flex:1;min-height:0;display:flex;flex-direction:column}
.bf-side-label{
  font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
  color:#6E908D;padding:0 8px 12px;
}
.bf-team{display:flex;flex-direction:column;gap:6px;overflow-y:auto}
.bf-team-empty{font-size:12px;color:#6E908D;padding:0 8px}

.bf-avatar{
  position:relative;width:34px;height:34px;border-radius:10px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:12px;font-weight:700;
}
.bf-avatar-sm{width:20px;height:20px;border-radius:6px;font-size:9px}

.bf-side-footer{
  display:flex;align-items:center;gap:8px;font-size:11.5px;color:#7C9C99;
  padding:14px 8px 2px;margin-top:14px;border-top:1px solid rgba(255,255,255,0.07);
}
.bf-live-dot{width:8px;height:8px;border-radius:50%;background:${C.azulLight};animation:bf-pulse 2s infinite}
.bf-live-dot.is-busy{background:${C.amarillo}}
@keyframes bf-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(133,182,196,.5)}50%{opacity:.6;box-shadow:0 0 0 5px rgba(133,182,196,0)}}
.bf-logout-btn{
  background:transparent;border:none;color:#7C9C99;cursor:pointer;
  padding:4px 6px;border-radius:6px;display:flex;align-items:center;
  transition:color .15s,background .15s;flex-shrink:0;
}
.bf-logout-btn:hover{color:#fff;background:rgba(255,255,255,0.08)}

/* ── Main ── */
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
.bf-btn-cargando{display:inline-flex;align-items:center;gap:6px}
.bf-cargando-inline{display:inline-flex;align-items:center;gap:5px;margin-left:8px;font-size:11px;font-weight:600;color:${C.textMuted};text-transform:none;letter-spacing:0}
.bf-meta-v-row{display:flex;align-items:center;gap:7px}
@keyframes bf-spin{to{transform:rotate(360deg)}}

/* ── Cola de trabajo (barra lateral) ── */
.bf-cola{display:flex;flex-direction:column;gap:3px;margin-bottom:22px}
.bf-cola-item{
  display:flex;align-items:center;gap:10px;width:100%;text-align:left;cursor:pointer;
  padding:10px 12px;border:none;border-radius:9px;background:transparent;
  color:#B9CDCB;transition:background .15s,color .15s;
}
.bf-cola-item:hover{background:rgba(255,255,255,0.05);color:#fff}
.bf-cola-item.is-active{background:rgba(133,182,196,0.16);color:#fff}
.bf-cola-item.is-urgente .bf-cola-count{background:${C.naranja};color:#fff}
.bf-cola-item.is-active.is-urgente{background:${C.naranja};color:#fff}
.bf-cola-item.is-active.is-urgente .bf-cola-count{background:rgba(255,255,255,0.22)}
.bf-cola-dot{width:7px;height:7px;border-radius:2px;flex-shrink:0}
.bf-cola-label{flex:1;font-size:13.5px;font-weight:600}
.bf-cola-count{
  font-size:13px;font-weight:800;letter-spacing:-0.3px;min-width:24px;height:21px;padding:0 7px;
  border-radius:7px;background:rgba(255,255,255,0.08);color:#E8F0EF;
  display:flex;align-items:center;justify-content:center;
}

/* Chips de área */
.bf-area-chips{display:flex;flex-wrap:wrap;gap:5px;padding:0 4px;margin-bottom:4px}
.bf-area-chip{
  display:inline-flex;align-items:center;gap:5px;cursor:pointer;
  font-size:11px;font-weight:700;letter-spacing:.2px;padding:4px 9px;border-radius:7px;
  border:none;background:rgba(255,255,255,0.08);color:#D6E4E2;transition:background .15s;
}
.bf-area-chip:hover{background:rgba(255,255,255,0.14)}
.bf-area-chip.is-active{background:${C.naranja};color:#fff}
.bf-area-n{color:${C.azulLight};font-weight:600}
.bf-area-chip.is-active .bf-area-n{color:rgba(255,255,255,0.75)}

/* Carga por agente */
.bf-carga{display:flex;flex-direction:column;gap:5px}
.bf-carga-top{display:flex;align-items:center;gap:9px}
.bf-carga-nombre{flex:1;font-size:12.5px;font-weight:600;color:#EAF1F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-carga-n{font-size:12px;font-weight:800;color:#E8F0EF;letter-spacing:-0.2px}
.bf-carga-libre{font-size:10.5px;font-weight:700;color:#4F9089}
.bf-carga-barra{height:3px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden}
.bf-carga-fill{height:3px;border-radius:2px;transition:width .3s ease}

/* Accesos secundarios */
.bf-side-links{display:flex;flex-direction:column;gap:2px;margin-top:14px}
.bf-side-link{
  display:flex;align-items:center;gap:10px;width:100%;text-align:left;cursor:pointer;
  padding:8px 12px;border:none;border-radius:9px;background:transparent;
  color:#7C9C99;font-size:12.5px;font-weight:600;transition:background .15s,color .15s;
}
.bf-side-link:hover{background:rgba(255,255,255,0.05);color:#C7D8D6}
.bf-side-link.is-active{background:rgba(133,182,196,0.16);color:#fff}
.bf-side-link-n{margin-left:auto;font-size:11px;font-weight:700;color:#6E908D}

/* ── Workspace ── */
.bf-work{display:grid;grid-template-columns:minmax(430px,1fr) 1.1fr;gap:18px;align-items:start}
.bf-panel{background:${C.surface};border:1px solid ${C.border};border-radius:18px;box-shadow:0 1px 2px rgba(21,62,62,0.04)}
.bf-panel-head{
  display:flex;align-items:center;gap:9px;padding:18px 20px;
  border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.azulDark};
}
.bf-panel-head svg{color:${C.textMuted}}

/* ── Lista agrupada por urgencia ── */
.bf-list-body{padding:14px;display:flex;flex-direction:column;gap:18px;max-height:calc(100vh - 210px);overflow-y:auto}

.bf-grupo{display:flex;flex-direction:column}
.bf-grupo-head{
  display:flex;align-items:center;gap:9px;width:100%;text-align:left;
  border:none;background:transparent;padding:0 2px 8px;
}
.bf-grupo-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.bf-grupo-label{font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:${C.azulDark}}
.bf-grupo-n{
  font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px;
  background:#E4ECEC;color:${C.textMuted};
}
.bf-grupo-n.is-active{background:${C.azulDark};color:#fff}
.bf-grupo-linea{flex:1;height:1px;background:${C.border}}
.bf-grupo-body{border:1px solid ${C.border};border-radius:12px;overflow:hidden;background:${C.surface}}

/* Fila expandida */
.bf-fila{display:flex;align-items:stretch;cursor:pointer;border-bottom:1px solid ${C.bg};transition:background .15s}
.bf-fila:last-child{border-bottom:none}
.bf-fila:hover{background:${C.surfaceAlt}}
.bf-fila.is-selected{background:rgba(208,100,48,0.05)}
.bf-fila-riel{width:4px;flex-shrink:0}
.bf-fila-cuerpo{flex:1;min-width:0;padding:12px 14px}
.bf-fila-top{display:flex;align-items:center;gap:9px}
.bf-fila-id{font-size:13px;font-weight:800;color:${C.azulDark};letter-spacing:-0.2px}
.bf-fila-maq{font-size:10.5px;font-weight:800;letter-spacing:.4px;border-radius:5px;padding:2px 7px}
.bf-fila-edad{font-size:15px;font-weight:800;letter-spacing:-0.3px}
.bf-fila-texto{
  font-size:12.5px;color:#3E5C5A;margin-top:5px;line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.bf-fila-acciones{display:flex;align-items:center;gap:8px;margin-top:9px}
.bf-fila-quien{font-size:11.5px;color:${C.textFaint};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.bf-fila-agente{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${C.azulDark}}
.bf-accion{
  display:inline-flex;align-items:center;gap:6px;cursor:pointer;
  font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:7px;
  border:1px solid ${C.border};background:${C.bg};color:${C.textMuted};transition:all .15s;
}
.bf-accion:hover:not(:disabled){background:#E7EEEE;color:${C.azulDark}}
.bf-accion:disabled{opacity:.6;cursor:default}
.bf-accion-primaria{background:${C.azulDark};border-color:${C.azulDark};color:#fff;font-weight:700}
.bf-accion-primaria:hover:not(:disabled){background:#0F2E2E;color:#fff}
.bf-accion-select select{
  font-family:inherit;font-size:11.5px;font-weight:600;color:${C.textMuted};cursor:pointer;
  padding:5px 9px;border-radius:7px;border:1px solid ${C.border};background:${C.bg};outline:none;
}

/* Fila compacta (grupo no enfocado) */
.bf-avatar-vacio{background:${C.bg};border:1px dashed ${C.borderStrong};color:${C.urgentText}}

.bf-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:20px;font-size:11.5px;font-weight:700}
.bf-badge-dot{width:6px;height:6px;border-radius:50%}

/* Skeleton + empty */
.bf-skel{height:96px;border-radius:14px;background:linear-gradient(90deg,#EEF3F3 25%,#F6F9F9 50%,#EEF3F3 75%);background-size:200% 100%;animation:bf-shimmer 1.3s infinite}
@keyframes bf-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.bf-empty,.bf-detail-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:54px 28px;color:${C.textMuted}}
.bf-detail-empty{min-height:420px;justify-content:center}
.bf-empty-ic{width:60px;height:60px;border-radius:16px;background:${C.doneBg};color:${C.doneText};display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.bf-empty-title{font-size:15px;font-weight:700;color:${C.azulDark}}
.bf-empty-text{font-size:13px;color:${C.textMuted};max-width:260px;margin-top:6px;line-height:1.5}

/* Detalle */
.bf-detail{padding:0 24px 22px;display:flex;flex-direction:column}
/* Cabecera a sangre: se sale del padding del panel para ocupar todo el ancho */
.bf-detail-head{
  margin:0 -24px 20px;padding:16px 24px;background:${C.azulDark};color:#E8F0EF;
  border-radius:18px 18px 0 0;
}
.bf-detail-head-top{display:flex;align-items:center;gap:10px}
.bf-detail-id{font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.4px}
.bf-detail-edad{font-size:11.5px;font-weight:600;color:${C.azulLight}}
.bf-detail-cerrar{
  width:28px;height:28px;border-radius:8px;border:none;cursor:pointer;flex-shrink:0;
  background:rgba(255,255,255,0.08);color:#B9CDCB;display:flex;align-items:center;justify-content:center;
  transition:background .15s,color .15s;
}
.bf-detail-cerrar:hover{background:rgba(255,255,255,0.16);color:#fff}
.bf-detail-sub{font-size:12.5px;color:#B9CDCB;margin-top:9px}

/* Chips para tomar/asignar el caso */
.bf-tomar{display:flex;flex-wrap:wrap;gap:7px}
.bf-tomar-chip{
  display:inline-flex;align-items:center;gap:7px;cursor:pointer;
  padding:5px 12px 5px 5px;border-radius:9px;border:1px solid ${C.border};
  background:${C.surfaceAlt};color:${C.azulDark};font-size:12.5px;font-weight:600;
  font-family:inherit;transition:all .15s;
}
.bf-tomar-chip:hover:not(:disabled){border-color:${C.azulLight};background:${C.surface}}
.bf-tomar-chip.is-active{border-color:${C.naranja};background:rgba(208,100,48,0.06);font-weight:700}
.bf-tomar-chip:disabled{cursor:default}

/* Pasos que el bot ya recorrió */
.bf-intentado{
  margin-bottom:18px;padding:14px 16px;background:${C.surfaceAlt};
  border:1px solid ${C.border};border-radius:14px;
}
.bf-intentado-item{display:flex;gap:9px;align-items:flex-start;margin-top:6px;font-size:12.5px;color:#3E5C5A;line-height:1.4}
.bf-intentado-n{
  width:17px;height:17px;border-radius:5px;flex-shrink:0;margin-top:1px;
  background:${C.doneBg};color:${C.doneText};font-size:10px;font-weight:800;
  display:flex;align-items:center;justify-content:center;
}
.bf-icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid ${C.border};background:${C.surface};color:${C.textMuted};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.bf-icon-btn:hover{background:${C.surfaceAlt};color:${C.azulDark}}

.bf-danger-zone{margin-top:22px;padding-top:16px;border-top:1px solid ${C.border};display:flex;justify-content:flex-end}
.bf-danger-btn{display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;border:1px solid #E3B9B9;background:transparent;color:#B4534F;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s}
.bf-danger-btn:hover{background:#B4534F;border-color:#B4534F;color:#fff}
.bf-meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${C.border};border:1px solid ${C.border};border-radius:14px;overflow:hidden;margin-bottom:16px}
.bf-descripcion{margin-bottom:18px;padding:14px 16px;background:${C.surfaceAlt};border:1px solid ${C.border};border-radius:14px}
.bf-desc-text{font-size:13.5px;color:${C.text};line-height:1.6;white-space:pre-wrap}
.bf-meta{background:${C.surfaceAlt};padding:13px 15px;display:flex;flex-direction:column;gap:6px}
.bf-meta-k{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${C.textMuted};text-transform:uppercase;letter-spacing:.3px}
.bf-meta-k svg{color:${C.textFaint}}
.bf-meta-v{font-size:14px;font-weight:600;color:${C.azulDark}}

.bf-chat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${C.textMuted};margin-bottom:12px}
.bf-chat{background:${C.surfaceAlt};border:1px solid ${C.border};border-radius:16px;padding:16px;max-height:300px;overflow-y:auto;margin-bottom:22px}
.bf-chat-empty{display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;color:${C.textFaint};text-align:center;padding:24px 0}
.bf-msg-row{display:flex;margin-bottom:12px}
.bf-msg-row.is-user{justify-content:flex-end}
.bf-msg-row:last-child{margin-bottom:0}
.bf-bubble{max-width:76%;padding:11px 15px;font-size:13.5px;line-height:1.5;border:1px solid transparent}
.bf-bubble.is-bot{background:${C.surface};border-color:${C.border};color:${C.text};border-radius:4px 16px 16px 16px}
.bf-bubble.is-user{background:rgba(208,100,48,0.08);border-color:rgba(208,100,48,0.22);color:#7A3D22;border-radius:16px 16px 4px 16px}
.bf-bubble-author{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;opacity:.75}
.bf-bubble.is-bot .bf-bubble-author{color:${C.doneText}}
.bf-bubble.is-user .bf-bubble-author{color:${C.naranja}}

/* Galería de imágenes */
.bf-imgs-section{margin-bottom:18px}
.bf-imgs-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:0}
.bf-img-card{
  width:120px;cursor:pointer;border-radius:12px;overflow:hidden;
  border:1px solid ${C.border};background:${C.surfaceAlt};
  transition:transform .15s,box-shadow .15s;
}
.bf-img-card:hover{transform:scale(1.03);box-shadow:0 6px 18px rgba(21,62,62,0.12)}
.bf-img-thumb{width:100%;height:90px;object-fit:cover;display:block}
.bf-img-caption{font-size:10.5px;color:${C.textMuted};padding:5px 7px 2px;line-height:1.35}
.bf-img-date{display:block;font-size:10px;color:${C.textFaint};padding:0 7px 6px}

/* Lightbox */
.bf-lightbox{
  position:fixed;inset:0;background:rgba(10,25,25,0.88);z-index:9999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  cursor:pointer;
}
.bf-lightbox-close{
  position:absolute;top:20px;right:24px;background:rgba(255,255,255,0.12);border:none;
  border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;
  color:#fff;cursor:pointer;transition:background .15s;
}
.bf-lightbox-close:hover{background:rgba(255,255,255,0.22)}
.bf-lightbox-img{max-width:90vw;max-height:72vh;border-radius:14px;object-fit:contain;box-shadow:0 24px 64px rgba(0,0,0,0.5)}
.bf-lightbox-caption{
  max-width:600px;background:rgba(255,255,255,0.08);border-radius:10px;
  padding:10px 16px;color:#E0ECEB;font-size:13px;line-height:1.55;text-align:center;cursor:default;
}

.bf-assign{margin-bottom:14px}
.bf-assign-label{display:block;font-size:12px;font-weight:600;color:${C.textMuted};margin-bottom:8px}

/* Selector de prioridad inline */
.bf-prio-select{
  border:none;background:transparent;color:${C.azulDark};font-size:14px;font-weight:600;
  cursor:pointer;outline:none;font-family:inherit;padding:0;
}

/* Notas internas */
.bf-notas{margin-bottom:14px}
.bf-notas-area{
  width:100%;padding:12px 14px;border:1px solid ${C.border};border-radius:12px;
  font-size:13.5px;font-family:inherit;color:${C.text};background:${C.surfaceAlt};
  resize:vertical;outline:none;transition:border-color .15s,box-shadow .15s;
}
.bf-notas-area:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}
.bf-notas-save{
  margin-top:8px;padding:8px 18px;border:none;border-radius:10px;
  background:${C.azulDark};color:#fff;font-size:13px;font-weight:600;
  cursor:pointer;transition:background .15s;
}
.bf-notas-save:hover{background:#0f2b2b}

/* Mensaje directo */
.bf-msg-direct{margin-bottom:14px;display:flex;flex-direction:column;gap:8px}
.bf-msg-templates{display:flex;flex-wrap:wrap;gap:6px}
.bf-msg-tpl-btn{
  padding:5px 13px;border-radius:20px;border:1.5px solid ${C.azulLight};
  background:transparent;color:${C.azulDark};font-size:12px;font-weight:600;
  cursor:pointer;font-family:inherit;transition:all .15s;
}
.bf-msg-tpl-btn:hover:not(:disabled){background:${C.azulLight};color:#fff}
.bf-msg-tpl-btn:disabled{opacity:.5;cursor:default}
.bf-msg-compose{display:flex;flex-direction:column;gap:6px}
.bf-msg-send-btn{
  align-self:flex-end;display:flex;align-items:center;gap:7px;
  padding:8px 18px;border:none;border-radius:10px;
  background:${C.naranja};color:#fff;font-size:13px;font-weight:600;
  cursor:pointer;transition:background .15s;font-family:inherit;
}
.bf-msg-send-btn:hover:not(:disabled){background:#bb5526}
.bf-msg-send-btn:disabled{opacity:.45;cursor:default}
.bf-msg-ok{font-size:12px;color:${C.doneText};font-weight:600}
.bf-msg-err{font-size:12px;color:${C.rojo};font-weight:600}

/* Transiciones de estado */
.bf-transitions{margin-bottom:14px}
.bf-trans-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:0}
.bf-trans-btn{
  padding:8px 16px;border-radius:10px;border:1.5px solid var(--tc);
  background:transparent;color:var(--tc);font-size:13px;font-weight:600;
  cursor:pointer;font-family:inherit;transition:background .15s,color .15s;
}
.bf-trans-btn:hover{background:var(--tc);color:#fff}

/* Auditoría */
.bf-audit-list{display:flex;flex-direction:column;gap:0;border-left:2px solid ${C.border};margin-left:6px;padding-left:16px;margin-bottom:8px}
.bf-audit-row{display:flex;align-items:flex-start;gap:0;position:relative;padding-bottom:12px}
.bf-audit-dot{position:absolute;left:-22px;top:4px;width:10px;height:10px;border-radius:50%;background:${C.azulLight};border:2px solid ${C.surface};flex-shrink:0}
.bf-audit-content{display:flex;flex-direction:column;gap:2px;min-width:0}
.bf-audit-estados{font-size:12.5px;font-weight:700;color:${C.azulDark};font-variant-numeric:tabular-nums}
.bf-audit-meta{font-size:11px;color:${C.textMuted}}
.bf-audit-notas{font-size:12px;color:${C.textMuted};font-style:italic;margin-top:1px}

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

/* ── Controles de formulario (Configuración) ── */
.bf-guia-add-btn{
  margin-left:auto;width:26px;height:26px;border-radius:8px;
  border:1px solid rgba(133,182,196,0.3);background:transparent;color:${C.azulLight};
  cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;
}
.bf-guia-add-btn:hover{background:rgba(133,182,196,0.15);color:#fff}

.bf-guia-err{font-size:12px;color:${C.rojo}}
.bf-guia-save-btn{
  display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border:none;border-radius:9px;
  background:${C.azulDark};color:#fff;font-size:13px;font-weight:600;cursor:pointer;
  transition:background .15s;font-family:inherit;
}
.bf-guia-save-btn:hover:not(:disabled){background:#0f2b2b}
.bf-guia-save-btn:disabled{opacity:.45;cursor:default}
.bf-guia-cancel-btn{
  padding:7px 14px;border:1px solid ${C.border};border-radius:9px;
  background:transparent;color:${C.textMuted};font-size:13px;font-weight:600;
  cursor:pointer;transition:all .15s;font-family:inherit;
}
.bf-guia-cancel-btn:hover{border-color:${C.borderStrong};color:${C.text}}
.bf-guia-field{display:flex;flex-direction:column;gap:6px}
.bf-guia-input{
  width:100%;padding:10px 14px;border:1px solid ${C.border};border-radius:10px;
  font-size:13.5px;font-family:inherit;color:${C.text};background:${C.surface};
  outline:none;transition:border-color .15s,box-shadow .15s;resize:vertical;
}
.bf-guia-input:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}
.bf-icon-btn-danger:hover{background:${C.urgentBg};color:${C.rojo};border-color:${C.rojo}}

/* ── Configuración ── */
.bf-cfg-row{
  display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:12px;
  border:1px solid ${C.border};background:${C.surface};transition:all .15s;
}
.bf-cfg-row.is-inactive{opacity:.45}
.bf-cfg-info{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.bf-cfg-nombre{font-size:14px;font-weight:700;color:${C.azulDark};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-cfg-sub{display:flex;align-items:center;gap:6px;font-size:12px;color:${C.textMuted};flex-wrap:wrap}
.bf-cfg-id{font-size:11px;color:${C.textFaint};font-family:monospace}
.bf-cfg-pill{
  font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;
  background:rgba(133,182,196,0.18);color:${C.doneText};white-space:nowrap;
}
.bf-cfg-pill-off{background:${C.border};color:${C.textMuted}}
.bf-cfg-toggles{display:flex;gap:16px}
.bf-cfg-toggle{display:flex;align-items:center;gap:6px;font-size:13px;color:${C.textMuted};cursor:pointer}
/* ── Uso ── */
.bf-uso{display:flex;flex-direction:column;gap:16px}
.bf-uso-filtros{display:inline-flex;align-self:flex-start;padding:4px;border-radius:12px;background:${C.border}}
.bf-uso-periodo{height:34px;padding:0 14px;border:none;border-radius:9px;background:transparent;color:#4A6361;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}
.bf-uso-periodo[aria-selected="true"]{background:#fff;color:${C.azulDark};box-shadow:0 1px 3px rgba(21,62,62,.12)}
.bf-uso-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.bf-uso-kpis .bf-skel{height:104px}
.bf-uso-kpi{display:flex;flex-direction:column;gap:4px;padding:16px 18px;border-radius:16px;background:#fff;border:1px solid ${C.border}}
.bf-uso-kpi-k{font-size:12.5px;font-weight:600;color:${C.textMuted}}
.bf-uso-kpi-v{font-size:30px;font-weight:800;letter-spacing:-0.8px;color:${C.azulDark};line-height:1.1}
.bf-uso-kpi-v small{font-size:15px;font-weight:600;color:${C.textMuted};letter-spacing:0}
.bf-uso-kpi-s{font-size:12.5px;color:${C.textMuted}}
.bf-uso-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.bf-uso-grid.tres{grid-template-columns:repeat(3,minmax(0,1fr))}
.bf-uso-panel{padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0}
.bf-uso-graf{margin:0;display:flex;flex-direction:column;gap:10px}
.bf-uso-graf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bf-uso-graf-titulo{font-size:14px;font-weight:700;color:${C.azulDark}}
.bf-uso-graf-titulo small{font-weight:500;color:${C.textMuted}}
.bf-uso-leyenda{display:flex;gap:12px;font-size:12px;color:${C.textMuted}}
.bf-uso-leyenda span,.bf-uso-tip span{display:inline-flex;align-items:center;gap:5px}
.bf-uso-leyenda i,.bf-uso-tip i{width:10px;height:10px;border-radius:3px;display:inline-block}
.bf-uso-plot{position:relative;height:150px;border-bottom:1px solid ${C.borderStrong};
  background:linear-gradient(${C.border},${C.border}) 0 0 / 100% 1px no-repeat}
.bf-uso-max{position:absolute;top:-8px;left:0;font-size:11px;color:${C.textMuted};background:#fff;padding-right:6px}
.bf-uso-barras{position:absolute;inset:8px 0 0 0;display:flex;align-items:flex-end;gap:2px}
.bf-uso-col{flex:1;height:100%;display:flex;align-items:flex-end;min-width:0}
.bf-uso-col:hover{background:rgba(133,182,196,0.12)}
.bf-uso-pila{width:100%;max-width:22px;margin:0 auto;display:flex;flex-direction:column-reverse;gap:2px;border-radius:4px 4px 0 0;overflow:hidden}
.bf-uso-pila span{display:block;min-height:2px}
.bf-uso-tip{position:absolute;top:14px;transform:translateX(-50%);z-index:3;pointer-events:none;
  display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:#fff;border:1px solid ${C.borderStrong};
  box-shadow:0 6px 18px rgba(21,62,62,0.14);font-size:12px;color:${C.text};white-space:nowrap}
.bf-uso-tip.izq{transform:translateX(-8px)}
.bf-uso-tip.der{transform:translateX(calc(-100% + 8px))}
.bf-uso-ejex{display:flex;justify-content:space-between;font-size:11px;color:${C.textMuted}}
.bf-uso-datos summary{font-size:12px;font-weight:600;color:${C.textMuted};cursor:pointer}
.bf-uso-datos table{margin-top:8px}
.bf-uso-datos table,.bf-uso-tabla{width:100%;border-collapse:collapse;font-size:12.5px}
.bf-uso-datos th,.bf-uso-datos td,.bf-uso-tabla th,.bf-uso-tabla td{text-align:left;padding:7px 8px;border-bottom:1px solid ${C.border};white-space:nowrap}
.bf-uso-datos th,.bf-uso-tabla th{font-size:11.5px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:.4px}
.bf-uso-tabla small{color:${C.textMuted}}
.bf-uso-barrita{display:inline-block;width:56px;height:6px;border-radius:3px;background:${C.border};margin-right:8px;vertical-align:middle;overflow:hidden}
.bf-uso-barrita i{display:block;height:100%;background:#2A78A8;border-radius:3px}
.bf-uso-scroll{overflow-x:auto}
.bf-uso-tenue{color:${C.textMuted};font-style:italic}
.bf-uso-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.bf-uso-lista li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid ${C.border};font-size:13px}
.bf-uso-lista li span{display:flex;flex-direction:column;min-width:0}
.bf-uso-lista small{font-size:12px;color:${C.textMuted}}
.bf-uso-lista time{font-size:12px;color:${C.textMuted};white-space:nowrap}
.bf-uso-vacio{font-size:13px;color:${C.textMuted};padding:18px 0;text-align:center}
.bf-uso-nota{font-size:12px;color:${C.textMuted};line-height:1.5}
@media (max-width:1080px){.bf-uso-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.bf-uso-grid,.bf-uso-grid.tres{grid-template-columns:minmax(0,1fr)}}
.bf-cta{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.bf-cta-filtros{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 14px 0}
.bf-cta-filtros input{grid-column:1 / -1}
@media (max-width:1080px){.bf-cta{grid-template-columns:minmax(0,1fr)}}
.bf-cta-form{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}
.bf-cta-campo{display:flex;flex-direction:column;gap:4px}
.bf-cta-campo > span,.bf-cta-campo > label{font-size:12px;font-weight:600;color:${C.textMuted}}
.bf-cta-campo small{font-size:12px;color:${C.textMuted}}
.bf-cta-wa{display:flex;gap:8px}
.bf-cta-nota{font-size:12.5px;line-height:1.5;color:${C.textMuted}}
.bf-cfg-notice{
  padding:12px 14px;border-radius:10px;background:${C.openBg};border:1px solid rgba(226,163,67,0.3);
  font-size:13px;color:${C.openText};line-height:1.5;margin-bottom:8px;
}
.bf-cfg-notice code{font-family:monospace;font-size:12px;background:rgba(226,163,67,0.15);padding:1px 5px;border-radius:4px}

/* Scrollbars */
.bf-scroll::-webkit-scrollbar{width:8px}
.bf-scroll::-webkit-scrollbar-track{background:transparent}
.bf-scroll::-webkit-scrollbar-thumb{background:${C.borderStrong};border-radius:8px}
.bf-scroll::-webkit-scrollbar-thumb:hover{background:${C.azulLight}}

/* Responsive */
.bf-mtop,.bf-scrim{display:none}
@media (max-width:1080px){
  /* minmax(0,…): sin él, la columna crece con el texto más largo y la página se desborda */
  .bf-work{grid-template-columns:minmax(0,1fr)}
  .bf-kpis{grid-template-columns:repeat(2,1fr)}
  /* Una sola columna: lista o detalle, nunca uno debajo del otro */
  .bf-cola-work.con-detalle .bf-list{display:none}
  .bf-cola-work:not(.con-detalle) .bf-detail{display:none}
}
@media (max-width:720px){
  .bf-app{flex-direction:column}
  .bf-mtop{
    display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:30;
    height:56px;padding:0 12px;background:${C.azulDark};color:#E8F0EF;
  }
  .bf-mtop-menu{
    position:relative;width:40px;height:40px;border:none;border-radius:10px;
    background:transparent;color:#E8F0EF;display:flex;align-items:center;justify-content:center;cursor:pointer;
  }
  .bf-mtop-n{
    position:absolute;top:3px;right:1px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;
    background:${C.naranja};color:#fff;font-size:10.5px;font-weight:800;
    display:flex;align-items:center;justify-content:center;
  }
  .bf-mtop-logo{width:30px;height:30px;border-radius:9px;font-size:16px;box-shadow:none}
  .bf-mtop-titulo{font-size:15px;font-weight:700;letter-spacing:-0.2px}

  .bf-sidebar{
    position:fixed;top:0;left:0;bottom:0;height:auto;z-index:50;width:min(300px,86vw);
    overflow-y:auto;transform:translateX(-100%);transition:transform .22s ease;
  }
  .bf-sidebar.is-abierto{transform:none;box-shadow:8px 0 30px rgba(0,0,0,0.25)}
  .bf-scrim{display:block;position:fixed;inset:0;z-index:40;background:rgba(10,25,25,0.45)}

  .bf-main{padding:16px 16px 32px}
  .bf-header{margin-bottom:16px;gap:12px}
  .bf-title{font-size:21px}
  .bf-search{width:100%}
  .bf-header-actions{width:100%;flex-direction:column;align-items:stretch}
  /* La página hace el scroll, no una caja con altura fija dentro de ella */
  .bf-list-body{max-height:none;overflow:visible;padding:10px}
  .bf-fila-acciones{flex-wrap:wrap}
  .bf-fila-acciones button{white-space:nowrap}
  .bf-fila-quien{flex-basis:100%;max-width:100%;margin-left:0 !important}

  .bf-detail{padding:0 14px 18px}
  .bf-detail-head{margin:0 -14px 16px;padding:14px}
  /* Con un ticket abierto, buscar y sincronizar estorban: el detalle sube hasta arriba */
  .bf-main.con-detalle .bf-header{display:none}
  .bf-meta-grid{grid-template-columns:repeat(2,1fr)}
  .bf-meta-grid > .bf-meta:last-child{grid-column:1 / -1 !important}
}

/* ══════════════════════════════════════════════════════════════
   LOGIN (TI y usuarios) — pensado primero para celular
   ══════════════════════════════════════════════════════════════ */
/* El naranja de botón es más oscuro que C.naranja: con texto blanco,
   #D06430 da 3.8:1 y #B9531F pasa el 4.5:1. */
.bf-lg{min-height:100vh;background:#fff;color:${C.text};
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.bf-lg *{box-sizing:border-box}
.bf-lg-card{min-height:100vh;display:flex;flex-direction:column;background:#fff}
.bf-lg-head{background:${C.azulDark};color:#fff;padding:56px 24px 36px;display:flex;flex-direction:column;gap:22px;border-radius:0 0 28px 28px}
.bf-lg-logo{width:52px;height:52px;border-radius:15px;background:#B9531F;color:#fff;font-weight:800;font-size:28px;display:flex;align-items:center;justify-content:center}
.bf-lg-titulo{margin:0;font-size:28px;font-weight:800;letter-spacing:-0.6px;line-height:1.15}
.bf-lg-cuerpo{flex:1;padding:28px 24px 24px;display:flex;flex-direction:column;gap:18px}
.bf-lg-aviso{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:#E3EFEE;color:${C.azulDark};font-size:14px;line-height:1.45}
.bf-lg-aviso svg{flex-shrink:0;margin-top:1px}
.bf-lg-campo{display:flex;flex-direction:column;gap:8px}
.bf-lg-campo label{font-size:14px;font-weight:700;color:${C.azulDark}}
.bf-lg-input{width:100%;height:52px;font-family:inherit;font-size:16px;color:${C.text};border:1.5px solid ${C.borderStrong};
  border-radius:14px;padding:0 16px;outline:none;background:#fff;transition:border-color .15s,box-shadow .15s}
.bf-lg-input:focus{border-color:${C.azulLight};box-shadow:0 0 0 4px rgba(133,182,196,0.18)}
.bf-lg-input::placeholder{color:#5E7B79}
.bf-lg-pass{position:relative;display:flex}
.bf-lg-pass .bf-lg-input{padding-right:56px}
.bf-lg-ojo{position:absolute;right:4px;top:4px;width:44px;height:44px;border:none;border-radius:10px;background:transparent;
  color:#566F6D;display:flex;align-items:center;justify-content:center;cursor:pointer}
.bf-lg-entrar{margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:54px;border:none;
  border-radius:16px;background:#B9531F;color:#fff;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer;transition:background .15s}
.bf-lg-entrar:hover:not(:disabled){background:#A3481A}
.bf-lg-entrar:disabled{opacity:.6;cursor:default}
.bf-lg .bf-login-error{margin:0}
.bf-lg-ayuda{margin:0;text-align:center;font-size:14px;line-height:1.5;color:#566F6D}
.bf-lg-ayuda strong{color:${C.azulDark}}
.bf-lg-pie{margin-top:auto;padding-top:18px;border-top:1px solid ${C.border};text-align:center;font-size:14px;line-height:1.5;color:#566F6D}
.bf-lg-pie strong{color:#B9531F}
@media (min-width:600px){
  .bf-lg{background:${C.bg};display:flex;align-items:center;justify-content:center;padding:32px 16px}
  .bf-lg-card{min-height:0;width:100%;max-width:420px;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(21,62,62,0.12)}
  .bf-lg-head{padding:40px 28px 30px}
  .bf-lg-cuerpo{padding:28px}
  .bf-lg-pie{margin-top:8px}
}

/* ══════════════════════════════════════════════════════════════
   PORTAL DEL USUARIO FINAL — una pantalla a la vez, como app
   ══════════════════════════════════════════════════════════════ */
.bf-portal{min-height:100vh;background:${C.bg};color:${C.text};
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.bf-portal *{box-sizing:border-box}
.bf-portal button{font-family:inherit;cursor:pointer}
.bf-portal button:focus-visible,.bf-portal a:focus-visible{outline:3px solid ${C.azulLight};outline-offset:2px}
/* En computadora, la misma columna de celular centrada */
.bf-pt-pantalla{max-width:560px;margin:0 auto;min-height:100vh;background:#fff;display:flex;flex-direction:column}
.bf-pt-pantalla.gris{background:${C.bg}}
@media (min-width:600px){.bf-pt-pantalla{border-left:1px solid ${C.border};border-right:1px solid ${C.border}}}

.bf-pt-top{display:flex;align-items:center;gap:10px;padding:14px 16px;min-height:64px}
.bf-pt-top.con-borde{background:#fff;border-bottom:1px solid ${C.border}}
.bf-pt-top.paso{padding:8px 8px 8px 4px;gap:4px}
.bf-pt-marca{display:flex;align-items:center;gap:10px;flex:1;font-size:15px;font-weight:700;color:${C.azulDark}}
.bf-pt-logo{width:32px;height:32px;border-radius:9px;background:#B9531F;color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}
.bf-pt-mis{display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border:none;border-radius:22px;background:${C.bg};color:${C.azulDark};font-size:14px;font-weight:700}
.bf-pt-mis-n{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:${C.azulDark};color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
.bf-pt-atras{width:44px;height:44px;border:none;border-radius:22px;background:transparent;color:${C.azulDark};display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bf-pt-top-titulo{font-size:15px;font-weight:700;color:${C.azulDark}}
.bf-pt-salir{height:44px;padding:0 12px;border:none;background:transparent;color:#566F6D;font-size:14px;font-weight:700}

.bf-pt-cuerpo{flex:1;padding:12px 16px 24px;display:flex;flex-direction:column;gap:20px}
.bf-pt-cuerpo.con-pie{padding-bottom:110px}
.bf-pt-titulo{display:flex;flex-direction:column;gap:10px}
.bf-pt-h1{margin:0;font-size:28px;font-weight:800;letter-spacing:-0.6px;line-height:1.15;color:${C.azulDark}}
.bf-pt-sub{margin:0;font-size:14px;color:#566F6D}
.bf-pt-pasos{display:flex;align-items:center;gap:8px}
.bf-pt-pasos > span:not(.bf-pt-pasos-txt){width:28px;height:5px;border-radius:3px;background:${C.border}}
.bf-pt-pasos > span.on{background:#B9531F}
.bf-pt-pasos-txt{margin-left:4px;font-size:13px;font-weight:600;color:#566F6D}

/* Paso 1: temas */
.bf-pt-temas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bf-pt-tema{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:16px 14px;border-radius:16px;
  border:1.5px solid transparent;background:${C.bg};color:${C.azulDark};text-align:left;transition:border-color .15s}
.bf-pt-tema:hover{border-color:${C.borderStrong}}
.bf-pt-tema.otro{background:#fff;border:1.5px dashed ${C.borderStrong}}
.bf-pt-tema-nombre{font-size:16px;font-weight:700}
.bf-pt-tema-hint{font-size:13px;line-height:1.35;color:#566F6D}
.bf-pt-alerta{margin-top:auto;display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-radius:14px;
  background:#FBF1E1;border:1px solid #EBCB97;color:#8A5A0F;font-size:14px;line-height:1.35;text-align:left}
.bf-pt-alerta > span{flex:1}

/* Paso 2: detalles */
.bf-pt-tema-elegido{align-self:flex-start;display:flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border:none;
  border-radius:18px;background:#E3EFEE;color:${C.azulDark};font-size:14px;font-weight:700}
.bf-pt-tema-elegido span{font-weight:600;color:#566F6D}
.bf-pt-field{display:flex;flex-direction:column;gap:8px}
.bf-pt-field > label{font-size:14px;font-weight:700;color:${C.azulDark}}
.bf-pt-label-sec{font-size:13px;font-weight:600;color:#566F6D}
.bf-pt-sugs{display:flex;flex-wrap:wrap;gap:8px}
.bf-pt-sug{min-height:40px;padding:0 14px;border-radius:20px;border:1.5px solid ${C.borderStrong};background:#fff;color:${C.azulDark};font-size:14px;font-weight:600}
.bf-pt-sug[aria-pressed="true"]{border-color:${C.azulDark};background:${C.azulDark};color:#fff}
/* 16px en los campos: con menos, Safari de iPhone hace zoom al escribir */
.bf-pt-textarea,.bf-pt-input{width:100%;font-family:inherit;font-size:16px;line-height:1.45;color:${C.text};
  border:1.5px solid ${C.borderStrong};border-radius:14px;padding:12px 14px;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}
.bf-pt-textarea{resize:vertical}
.bf-pt-textarea:focus,.bf-pt-input:focus{border-color:${C.azulLight};box-shadow:0 0 0 4px rgba(133,182,196,0.18)}
.bf-pt-textarea::placeholder,.bf-pt-input::placeholder{color:#5E7B79}
.bf-pt-ayuda{font-size:13px;line-height:1.4;color:#566F6D}
.bf-pt-envio{margin-top:auto;display:flex;flex-direction:column;gap:10px}
.bf-pt-primario{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:54px;border:none;border-radius:16px;
  background:#B9531F;color:#fff;font-size:16px;font-weight:700;transition:background .15s}
.bf-pt-primario:hover:not(:disabled){background:#A3481A}
.bf-pt-primario:disabled{opacity:.45;cursor:default}
.bf-pt-nota{margin:0;text-align:center;font-size:13px;color:#566F6D}
.bf-pt-error{margin:0;font-size:13.5px;color:${C.rojo}}
.bf-pt-hint{margin:0;font-size:14px;line-height:1.5;color:#566F6D}
.bf-pt-generando{display:flex;align-items:center;gap:8px}

/* Enviado */
.bf-pt-centro{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding-top:32px}
.bf-pt-centro p{margin:0;font-size:15px;line-height:1.45;color:#566F6D}
.bf-pt-check{width:64px;height:64px;border-radius:32px;background:#E3EFEE;color:#2E6E69;display:flex;align-items:center;justify-content:center}
.bf-pt-folio-grande{font-size:40px;font-weight:800;letter-spacing:1px;color:${C.azulDark}}
.bf-pt-avance{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
.bf-pt-avance.con-etiquetas{gap:6px}
.bf-pt-avance li{display:flex;flex-direction:column;gap:6px}
.bf-pt-avance-barra{height:4px;border-radius:2px;background:${C.borderStrong}}
.bf-pt-avance.con-etiquetas .bf-pt-avance-barra{height:5px}
.bf-pt-avance li.hecho .bf-pt-avance-barra{background:#2E6E69}
.bf-pt-avance-txt{font-size:11.5px;font-weight:600;color:#566F6D}
.bf-pt-avance li.hecho .bf-pt-avance-txt{color:#2E6E69}
.bf-pt-avance li[aria-current="step"] .bf-pt-avance-txt{color:${C.azulDark};font-weight:700}
.bf-pt-wa-card{background:${C.bg};border-radius:18px;padding:18px 16px;display:flex;flex-direction:column;gap:12px}
.bf-pt-wa-card-tit{display:flex;align-items:center;gap:12px}
.bf-pt-wa-card-ic{width:40px;height:40px;border-radius:12px;background:${C.azulDark};color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bf-pt-wa-card h2{margin:0;font-size:17px;font-weight:800;color:${C.azulDark};line-height:1.25}
.bf-pt-wa-card p{margin:0;font-size:14px;line-height:1.5}
.bf-pt-wa-card small{text-align:center;font-size:13px;color:#566F6D}
.bf-pt-oscuro{height:50px;border:none;border-radius:14px;background:${C.azulDark};color:#fff;font-size:15px;font-weight:700}
.bf-pt-dos{margin-top:auto;display:flex;gap:10px}
.bf-pt-secundario{flex:1;height:50px;border-radius:14px;border:1.5px solid ${C.borderStrong};background:#fff;color:${C.azulDark};font-size:15px;font-weight:700}

/* Vincular WhatsApp */
.bf-pt-instr{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.bf-pt-instr li{display:flex;gap:12px;align-items:flex-start;font-size:15px;line-height:1.45}
.bf-pt-instr-n{width:28px;height:28px;border-radius:14px;background:${C.azulDark};color:#fff;font-size:14px;font-weight:800;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:-3px}
.bf-pt-codigo{border:1.5px dashed ${C.azulLight};border-radius:18px;padding:18px 16px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;background:${C.surfaceAlt};min-height:150px;text-align:center}
.bf-pt-codigo-tit{font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#566F6D}
.bf-pt-codigo-msg{display:flex;align-items:center;gap:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}
.bf-pt-codigo-pre{font-size:20px;color:#566F6D}
.bf-pt-codigo-letras{display:flex;gap:6px}
.bf-pt-codigo-letras span{width:40px;height:50px;border-radius:10px;background:#fff;border:1.5px solid ${C.borderStrong};
  font-size:26px;color:${C.azulDark};display:flex;align-items:center;justify-content:center}
.bf-pt-codigo-vence{display:flex;align-items:center;gap:6px;font-size:13px;color:#566F6D;font-variant-numeric:tabular-nums}
.bf-pt-wa{display:flex;align-items:center;justify-content:center;gap:10px;height:56px;border-radius:16px;background:#1A7F4E;
  color:#fff;font-size:16px;font-weight:700;text-decoration:none}
.bf-pt-wa:hover{background:#156B41}
.bf-pt-sinabrir{border-top:1px solid ${C.border};padding-top:14px}
.bf-pt-sinabrir summary{font-size:14px;font-weight:700;color:${C.azulDark};cursor:pointer;min-height:32px}
.bf-pt-sinabrir p{margin:10px 0 0;font-size:14px;line-height:1.5}
.bf-pt-vinc-pie{margin-top:auto;display:flex;justify-content:space-between;align-items:center}
.bf-pt-texto{height:44px;padding:0 4px;border:none;background:transparent;font-size:14px;font-weight:700;color:#B9531F}
.bf-pt-texto.gris{color:#566F6D}

/* Mis tickets */
.bf-pt-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:4px;border-radius:14px;background:${C.border}}
.bf-pt-tab{height:40px;border:none;border-radius:11px;background:transparent;color:#4A6361;font-size:14px;font-weight:600}
.bf-pt-tab[aria-selected="true"]{background:#fff;color:${C.azulDark};font-weight:700;box-shadow:0 1px 3px rgba(21,62,62,.12)}
.bf-pt-lista{display:flex;flex-direction:column;gap:12px}
.bf-pt-fila{display:flex;flex-direction:column;gap:10px;width:100%;padding:14px;border-radius:16px;background:#fff;
  border:1px solid ${C.border};text-align:left;color:${C.text};transition:border-color .15s}
.bf-pt-fila:hover{border-color:${C.borderStrong}}
.bf-pt-fila.es-tuya{border:1.5px solid #EBCB97}
.bf-pt-fila-top{display:flex;align-items:center;gap:8px}
.bf-pt-folio{font-size:14px;font-weight:800;color:${C.azulDark}}
.bf-pt-edad{margin-left:auto;font-size:13px;color:#566F6D;white-space:nowrap}
.bf-pt-fila-desc{font-size:15px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-pt-fila-pie{display:flex;align-items:center;gap:8px;font-size:13px;color:#566F6D}
.bf-pt-fila-pie strong{color:${C.text}}
.bf-pt-fila.es-tuya .bf-pt-fila-pie{font-size:14px;font-weight:700;color:#8A5A0F}
.bf-pt-canal{margin-left:auto;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:8px;background:${C.bg};color:#566F6D;white-space:nowrap}
.bf-pt-estado{font-size:12px;font-weight:700;padding:3px 9px;border-radius:10px;white-space:nowrap}
.bf-pt-estado.t-espera{background:${C.bg};color:#566F6D}
.bf-pt-estado.t-activo{background:#E3EFEE;color:#2E6E69}
.bf-pt-estado.t-tuyo{background:#FBF1E1;color:#8A5A0F}
.bf-pt-estado.t-listo{background:#2E6E69;color:#fff}
.bf-pt-vacio{margin:0;padding:24px 8px;text-align:center;font-size:14px;line-height:1.5;color:#566F6D}
.bf-pt-vinc-mini{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:14px;background:#fff;
  border:1px dashed ${C.azulLight};color:${C.azulDark};text-align:left;font-size:14px;line-height:1.35}
.bf-pt-vinc-mini > span{flex:1}
.bf-pt-vinc-mini small{display:block;font-size:14px;color:#566F6D}
.bf-pt-pie-fijo{position:fixed;left:50%;bottom:0;z-index:10;width:100%;max-width:560px;transform:translateX(-50%);
  padding:12px 16px calc(16px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid ${C.border}}

/* Detalle */
.bf-pt-detalle-estado{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.bf-pt-detalle-estado p{margin:0;font-size:15px;line-height:1.45}
.bf-pt-meta{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px;border-radius:14px;background:${C.bg}}
.bf-pt-meta dt{font-size:12px;font-weight:700;color:#566F6D;text-transform:uppercase;letter-spacing:.4px}
.bf-pt-meta dd{margin:2px 0 0;font-size:14px;font-weight:600}
.bf-pt-sep{font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#566F6D}
.bf-pt-chat{display:flex;flex-direction:column;gap:8px}
.bf-pt-msg{max-width:85%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.bf-pt-msg.mio{align-self:flex-end;background:rgba(133,182,196,0.22);border-bottom-right-radius:4px}
.bf-pt-msg.ti{align-self:flex-start;background:${C.bg};border-bottom-left-radius:4px}
.bf-pt-responder{display:flex;flex-direction:column;gap:10px}
.bf-pt-ok{font-size:13.5px;font-weight:600;color:#2E6E69;text-align:center}
.bf-pt-fila.sel{border-color:${C.azulDark};box-shadow:0 0 0 1px ${C.azulDark} inset}

/* Computadora (≥ 960 px, ver useEsEscritorio): flujo a la izquierda, Mis tickets al lado */
.bf-pt-barra{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;height:68px;padding:0 32px;
  background:#fff;border-bottom:1px solid ${C.border}}
.bf-pt-quien{display:flex;flex-direction:column;align-items:flex-end;line-height:1.3}
.bf-pt-quien strong{font-size:14px;color:${C.azulDark}}
.bf-pt-quien span{font-size:13px;color:#566F6D}
.bf-pt-escritorio{max-width:1240px;margin:0 auto;padding:28px 32px 48px;display:grid;
  grid-template-columns:minmax(0,1fr) minmax(340px,400px);gap:28px;align-items:start}
.bf-pt-principal{background:#fff;border:1px solid ${C.border};border-radius:20px;min-height:calc(100vh - 124px);
  display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(21,62,62,0.04)}
.escritorio .bf-pt-cuerpo{padding:28px 36px 36px;gap:24px}
.escritorio .bf-pt-top.paso{padding:16px 20px 0}
.escritorio .bf-pt-h1{font-size:30px}
.escritorio .bf-pt-temas{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.escritorio .bf-pt-tema{padding:20px 18px}
.escritorio .bf-pt-envio,.escritorio .bf-pt-responder{align-items:flex-start}
.escritorio .bf-pt-envio .bf-pt-primario,.escritorio .bf-pt-responder .bf-pt-primario{width:auto;min-width:220px;padding:0 32px}
.escritorio .bf-pt-nota{text-align:left}
.escritorio .bf-pt-centro{padding-top:12px}
.escritorio .bf-pt-wa-card,.escritorio .bf-pt-codigo,.escritorio .bf-pt-wa{max-width:520px;width:100%;align-self:center}
.escritorio .bf-pt-dos{max-width:520px;width:100%;align-self:center}
.escritorio .bf-pt-meta{grid-template-columns:repeat(4,minmax(0,1fr))}
.escritorio .bf-pt-msg{max-width:70%}
.bf-pt-lateral{position:sticky;top:96px;max-height:calc(100vh - 124px);overflow-y:auto;display:flex;flex-direction:column;gap:14px;
  padding:2px 2px 8px}
.bf-pt-lateral-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px}
.bf-pt-lateral-head h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${C.azulDark}}
.bf-pt-nuevo-mini{display:flex;align-items:center;gap:6px;height:40px;padding:0 14px;border:none;border-radius:12px;
  background:#B9531F;color:#fff;font-size:14px;font-weight:700}
.bf-pt-nuevo-mini:hover{background:#A3481A}

`;

export default App;
