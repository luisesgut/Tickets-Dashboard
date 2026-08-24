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

const ESTADOS_ACTIVOS_SET = new Set(["OPEN","ASSIGNED","IN_PROGRESS","WAITING_FOR_USER","REOPENED"]);
const ESTADOS_TERMINALES_SET = new Set(["RESOLVED","CLOSED"]);

// Transiciones disponibles por estado para mostrar en el dashboard
const TRANSICIONES_UI = {
  OPEN:             [{ estado:"ASSIGNED",         label:"Asignar" }, { estado:"IN_PROGRESS", label:"Iniciar" }, { estado:"CLOSED", label:"Archivar" }],
  ASSIGNED:         [{ estado:"IN_PROGRESS",      label:"Iniciar atención" }, { estado:"RESOLVED", label:"Resolver" }, { estado:"CLOSED", label:"Archivar" }],
  IN_PROGRESS:      [{ estado:"WAITING_FOR_USER", label:"Esperando usuario" }, { estado:"RESOLVED", label:"Resolver" }, { estado:"CLOSED", label:"Archivar" }],
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

const TEMPLATES_RAPIDOS = [
  { label: "En atención",   texto: "Hola, tu caso ya está siendo atendido por nuestro equipo de TI. Te contactamos en breve. 👍" },
  { label: "¿Ya funcionó?", texto: "¿Pudiste resolver el problema? Por favor confirma para poder cerrar tu caso. ✅" },
  { label: "Reinicia equipo", texto: "Por favor reinicia tu equipo y vuelve a intentarlo. Si el problema persiste, avísanos." },
  { label: "Caso resuelto", texto: "Tu caso ha sido resuelto. Si el problema vuelve a ocurrir, responde este mensaje y con gusto te ayudamos. 🙌" },
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
const IcInbox = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>
    }
  />
);
const IcPulse = (p) => (
  <Icon {...p} d={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />} />
);
const IcCheck = (p) => <Icon {...p} d={<path d="M20 6 9 17l-5-5" />} />;
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
const IcChat = (p) => (
  <Icon
    {...p}
    d={
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    }
  />
);
const IcSliders = (p) => (
  <Icon
    {...p}
    d={
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    }
  />
);
const IcBook = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    }
  />
);
const IcPlus = (p) => <Icon {...p} d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />;
const IcTrash = (p) => (
  <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>} />
);
const IcImage = (p) => (
  <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>} />
);
const IcSend = (p) => (
  <Icon {...p} d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>} />
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
function App() {
  // ── Autenticación ────────────────────────────────────────────
  const [token, setToken] = useState(localStorage.getItem("bf_token") || "");
  const [autenticado, setAutenticado] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState(localStorage.getItem("bf_nombre") || "");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [nombreInput, setNombreInput] = useState("");
  const [modoRegistro, setModoRegistro] = useState(false);
  const [loginError, setLoginError] = useState("");
  // loginChecking=true mientras verificamos el token guardado en localStorage
  const [loginChecking, setLoginChecking] = useState(
    !!localStorage.getItem("bf_token")
  );

  // ── Estado del dashboard ─────────────────────────────────────
  const [vista, setVista] = useState("tickets"); // "tickets" | "guias"
  const [tickets, setTickets] = useState({});
  const [stats, setStats] = useState({ total: 0, abiertos: 0, cerrados: 0 });
  const [agentes, setAgentes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [syncing, setSyncing] = useState(false);

  // ── Imágenes del ticket seleccionado ─────────────────────────
  const [selectedImagenes, setSelectedImagenes] = useState([]); // [{id, mime_type, analisis, fecha, blobUrl}]
  const blobUrlsRef = useRef([]); // para revocar al cambiar de ticket

  // ── Refs para notificaciones ──────────────────────────────────
  const notifGranted = useRef(false);
  const prevTicketIds = useRef(new Set()); // IDs vistos en el último poll
  const initialLoadDone = useRef(false);   // evita notificar en la carga inicial

  // ── Estado de guías ──────────────────────────────────────────
  const [guias, setGuias] = useState([]);
  const [guiaSelId, setGuiaSelId] = useState(null);
  const [guiaDetalle, setGuiaDetalle] = useState(null);

  // ── Estado de configuración ───────────────────────────────────
  const [configAgentes, setConfigAgentes] = useState({});
  const [configUsuarios, setConfigUsuarios] = useState([]);
  const [whitelistActiva, setWhitelistActiva] = useState(false);

  // El ticket seleccionado se deriva del estado — se mantiene sincronizado con el polling
  const ticketSeleccionado = selectedId ? tickets[selectedId] : null;

  // ── Login / Registro ─────────────────────────────────────────
  const _guardarSesion = (t, nombre) => {
    localStorage.setItem("bf_token", t);
    localStorage.setItem("bf_nombre", nombre);
    setToken(t);
    setNombreUsuario(nombre);
    setAutenticado(true);
    setLoginError("");
  };

  const login = async () => {
    const email = emailInput.trim().toLowerCase();
    const password = passwordInput;
    if (!email || !password) return;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        _guardarSesion(data.token, data.nombre);
      } else {
        setLoginError(data.detail || "Correo o contraseña incorrectos.");
      }
    } catch {
      setLoginError("No se pudo conectar con el servidor.");
    }
  };

  const registro = async () => {
    const email = emailInput.trim().toLowerCase();
    const password = passwordInput;
    const nombre = nombreInput.trim();
    if (!email || !password || !nombre) {
      setLoginError("Completa todos los campos.");
      return;
    }
    if (password.length < 6) {
      setLoginError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    try {
      const res = await fetch(`${API}/auth/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, nombre }),
      });
      const data = await res.json();
      if (res.ok) {
        _guardarSesion(data.token, data.nombre);
      } else {
        setLoginError(data.detail || "Error al registrar.");
      }
    } catch {
      setLoginError("No se pudo conectar con el servidor.");
    }
  };

  const logout = () => {
    localStorage.removeItem("bf_token");
    localStorage.removeItem("bf_nombre");
    setToken("");
    setNombreUsuario("");
    setAutenticado(false);
    setTickets({});
    setStats({ total: 0, abiertos: 0, cerrados: 0 });
  };

  // Verificar token guardado en localStorage al montar la app
  useEffect(() => {
    const saved = localStorage.getItem("bf_token");
    if (!saved) {
      setLoginChecking(false);
      return;
    }
    fetch(`${API}/stats`, { headers: { Authorization: `Bearer ${saved}` } })
      .then((r) => {
        if (r.ok) {
          setToken(saved);
          setAutenticado(true);
        } else {
          localStorage.removeItem("bf_token");
          setToken("");
        }
      })
      .catch(() => {})
      .finally(() => setLoginChecking(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Permisos de notificación ──────────────────────────────────
  useEffect(() => {
    if (autenticado && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(p => { notifGranted.current = p === "granted"; });
    }
    if (autenticado && Notification.permission === "granted") notifGranted.current = true;
  }, [autenticado]);

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
  const fetchTicketImagenes = async (ticketId) => {
    const t = localStorage.getItem("bf_token");
    // Revocar blob URLs previas
    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    setSelectedImagenes([]);
    try {
      const res = await fetch(`${API}/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      const imgs = data.imagenes || [];
      if (!imgs.length) return;
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
      setSelectedImagenes(cargadas.filter(Boolean));
    } catch (e) { console.error("Error al cargar imágenes", e); }
  };

  useEffect(() => {
    if (selectedId) fetchTicketImagenes(selectedId);
    else { blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); blobUrlsRef.current = []; setSelectedImagenes([]); }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Acciones sobre tickets ────────────────────────────────────
  const transicionarTicket = async (ticketId, nuevoEstado) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      await fetch(`${API}/tickets/${ticketId}/transicion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ estado: nuevoEstado, actor: "dashboard" }),
      });
      fetchData();
      fetchAuditLog(ticketId);
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
      fetchData();
    } catch (e) {
      console.error("Error al actualizar ticket", e);
    }
  };

  // ── Gestión de guías ─────────────────────────────────────────
  const fetchGuias = async () => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/guias`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      setGuias(data.guias || []);
    } catch (e) { console.error("Error al cargar guías", e); }
  };

  const fetchGuiaDetalle = async (id) => {
    const t = localStorage.getItem("bf_token");
    try {
      const res = await fetch(`${API}/guias/${id}`, { headers: { Authorization: `Bearer ${t}` } });
      setGuiaDetalle(await res.json());
    } catch (e) { console.error("Error al cargar detalle de guía", e); }
  };

  useEffect(() => {
    if (guiaSelId) fetchGuiaDetalle(guiaSelId);
    else setGuiaDetalle(null);
  }, [guiaSelId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autenticado && vista === "guias") fetchGuias();
  }, [vista, autenticado]); // eslint-disable-line react-hooks/exhaustive-deps

  const apiGuia = async (url, opts = {}) => {
    const t = localStorage.getItem("bf_token");
    const res = await fetch(`${API}${url}`, {
      ...opts,
      headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  const crearGuia = async (id, titulo, descripcion_ticket) => {
    const data = await apiGuia("/guias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, titulo, descripcion_ticket }),
    });
    if (data.ok) { await fetchGuias(); setGuiaSelId(id); }
    return data;
  };

  const actualizarGuia = async (id, campos) => {
    await apiGuia(`/guias/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    fetchGuias();
    if (guiaSelId === id) fetchGuiaDetalle(id);
  };

  const crearPaso = async (guiaId, texto) => {
    await apiGuia(`/guias/${guiaId}/pasos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    fetchGuiaDetalle(guiaId);
  };

  const actualizarPaso = async (guiaId, pasoId, campos) => {
    await apiGuia(`/guias/${guiaId}/pasos/${pasoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    fetchGuiaDetalle(guiaId);
  };

  const eliminarPaso = async (guiaId, pasoId) => {
    await apiGuia(`/guias/${guiaId}/pasos/${pasoId}`, { method: "DELETE" });
    fetchGuiaDetalle(guiaId);
  };

  const subirImagenPaso = async (guiaId, pasoId, file) => {
    const t = localStorage.getItem("bf_token");
    const form = new FormData();
    form.append("file", file);
    await fetch(`${API}/guias/${guiaId}/pasos/${pasoId}/imagen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
      body: form,
    });
    fetchGuiaDetalle(guiaId);
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

  const crearAgente = async (id, nombre, whatsapp, notificar) => {
    const t = localStorage.getItem("bf_token");
    const res = await fetch(`${API}/agentes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ id, nombre, whatsapp, notificar }),
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
    fetchConfigAgentes();
    fetchData(); // refresca sidebar
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
    fetchConfigUsuarios();
  };

  // ── Data fetching ────────────────────────────────────────────
  const fetchData = async () => {
    const currentToken = localStorage.getItem("bf_token");
    if (!currentToken) return;
    setSyncing(true);
    try {
      const headers = { Authorization: `Bearer ${currentToken}` };
      const [ticketsRes, statsRes, agentesRes] = await Promise.all([
        fetch(`${API}/tickets`, { headers }).then((r) => r.json()),
        fetch(`${API}/stats`, { headers }).then((r) => r.json()),
        fetch(`${API}/agentes`, { headers }).then((r) => r.json()),
      ]);
      const nuevosTickets = ticketsRes.tickets || ticketsRes || {};
      setTickets(nuevosTickets);
      setStats(statsRes || { total: 0, abiertos: 0, cerrados: 0 });
      setAgentes(agentesRes || {});

      // Notificaciones: detectar tickets OPEN nuevos sin asignar
      if (initialLoadDone.current && notifGranted.current) {
        Object.values(nuevosTickets).forEach(t => {
          if (t.estado === "OPEN" && !t.asignado_a && !prevTicketIds.current.has(t.id)) {
            new Notification("Nuevo ticket sin asignar", {
              body: `${t.id} · +${t.numero}`,
              icon: "/favicon.ico",
              tag: t.id,
            });
          }
        });
      }
      prevTicketIds.current = new Set(Object.keys(nuevosTickets));
      initialLoadDone.current = true;
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
      fetchData();
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
      if (data.ok) fetchData(); // refresca historial
      return data;
    } catch (e) {
      console.error("Error al enviar mensaje", e);
      return { error: "Error de red" };
    }
  };

  const cerrarTicket = async (id) => {
    const currentToken = localStorage.getItem("bf_token");
    try {
      await fetch(`${API}/tickets/${id}/cerrar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      fetchData();
    } catch (e) {
      console.error("Error al cerrar ticket", e);
    }
  };

  // Arrancar polling solo cuando el usuario está autenticado
  useEffect(() => {
    if (!autenticado) return;
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autenticado]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Derivados ─────────────────────────────────────────────────── */
  const arr = useMemo(() => Object.values(tickets || {}), [tickets]);
  const nAbiertos = arr.filter((t) => ESTADOS_ACTIVOS_SET.has(t.estado)).length;
  const nCerrados = arr.filter((t) => ESTADOS_TERMINALES_SET.has(t.estado)).length;
  const nSinAsignar = arr.filter(
    (t) => ESTADOS_ACTIVOS_SET.has(t.estado) && !t.asignado_a
  ).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return arr
      .filter((t) => {
        if (filtro === "todos") return true;
        if (filtro === "abierto") return ESTADOS_ACTIVOS_SET.has(t.estado);
        if (filtro === "cerrado") return ESTADOS_TERMINALES_SET.has(t.estado);
        return true;
      })
      .filter((t) =>
        !q
          ? true
          : String(t.numero).includes(q) ||
            String(t.id).toLowerCase().includes(q)
      )
      .sort((a, b) =>
        ESTADOS_ACTIVOS_SET.has(a.estado) === ESTADOS_ACTIVOS_SET.has(b.estado)
          ? 0
          : ESTADOS_ACTIVOS_SET.has(a.estado) ? -1 : 1
      );
  }, [arr, filtro, busqueda]);

  const navItems = [
    { id: "todos",   label: "Bandeja",        icon: IcInbox,    count: arr.length,   vista: "tickets" },
    { id: "abierto", label: "Activos",         icon: IcPulse,    count: nAbiertos,    vista: "tickets" },
    { id: "cerrado", label: "Resueltos",       icon: IcCheck,    count: nCerrados,    vista: "tickets" },
    { id: "guias",   label: "Guías",           icon: IcBook,     count: guias.length, vista: "guias" },
    { id: "config",  label: "Configuración",   icon: IcSettings, count: null,         vista: "config" },
  ];

  const kpis = [
    {
      label: "Total recibidos",
      value: stats.total ?? arr.length,
      color: C.azulDark,
      tint: "rgba(21,62,62,0.08)",
      icon: IcInbox,
    },
    {
      label: "Casos activos",
      value: stats.abiertos ?? nAbiertos,
      color: C.amarillo,
      tint: C.openBg,
      icon: IcPulse,
    },
    {
      label: "Resueltos",
      value: stats.cerrados ?? nCerrados,
      color: C.doneText,
      tint: C.doneBg,
      icon: IcCheckCircle,
    },
    {
      label: "Sin asignar",
      value: nSinAsignar,
      color: C.rojo,
      tint: C.urgentBg,
      icon: IcUser,
    },
  ];

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

  /* ── Pantalla: login / registro ──────────────────────────────── */
  if (!autenticado) {
    const submitAuth = modoRegistro ? registro : login;
    return (
      <div className="bf-app bf-login-wrap">
        <style>{CSS}</style>
        <div className="bf-login-card">
          <div className="bf-logo-box">b</div>
          <h1 className="bf-login-title">bioflex</h1>
          <p className="bf-login-sub">
            {modoRegistro ? "Crear cuenta — Mesa de Soporte TI" : "Mesa de Soporte TI — Acceso restringido"}
          </p>
          {modoRegistro && (
            <input
              type="text"
              className="bf-login-input"
              placeholder="Nombre completo"
              value={nombreInput}
              onChange={(e) => setNombreInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAuth()}
            />
          )}
          <input
            type="email"
            className="bf-login-input"
            placeholder="Correo electrónico"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAuth()}
            autoFocus={!modoRegistro}
          />
          <input
            type="password"
            className="bf-login-input"
            placeholder="Contraseña"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAuth()}
          />
          {loginError && <p className="bf-login-error">{loginError}</p>}
          <button
            className="bf-resolve"
            style={{ width: "100%", marginTop: 4 }}
            onClick={submitAuth}
          >
            {modoRegistro ? "Crear cuenta" : "Entrar"}
          </button>
          <button
            style={{ background: "none", border: "none", color: "#607d8b", fontSize: 12, marginTop: 12, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => { setModoRegistro(m => !m); setLoginError(""); }}
          >
            {modoRegistro ? "¿Ya tienes cuenta? Inicia sesión" : "¿Primera vez? Crear cuenta"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Dashboard principal ─────────────────────────────────────── */
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
            const active = vista === item.vista && (item.vista !== "tickets" || filtro === item.id);
            return (
              <button
                key={item.id}
                className={`bf-nav-item${active ? " is-active" : ""}`}
                onClick={() => {
                  setVista(item.vista);
                  if (item.vista === "tickets") setFiltro(item.id);
                }}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.count !== null && (
                  <span className="bf-nav-count">{item.count}</span>
                )}
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
                  <div
                    className="bf-avatar"
                    style={{ background: colorPara(id) }}
                  >
                    {iniciales(agente.nombre)}
                    <span className="bf-online" />
                  </div>
                  <div className="bf-team-info">
                    <span className="bf-team-name">{agente.nombre}</span>
                    <span className="bf-team-role">Agente TI</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bf-side-footer">
          <span className={`bf-live-dot${syncing ? " is-busy" : ""}`} />
          <span style={{ flex: 1 }}>Sincronización · 10s</span>
          <button
            className="bf-logout-btn"
            onClick={logout}
            title="Cerrar sesión"
          >
            <IcLogout size={15} />
          </button>
        </div>
      </aside>

      {/* ───── Main ───── */}
      <main className="bf-main">
        {/* Header */}
        <header className="bf-header">
          <div>
            <h1 className="bf-title">
              {vista === "guias" ? "Guías de soporte"
                : vista === "config" ? "Configuración"
                : (TITULOS[filtro] || "Bandeja de entrada")}
            </h1>
            <p className="bf-subtitle">
              {vista === "guias"
                ? `${guias.length} ${guias.length === 1 ? "guía" : "guías"} configuradas`
                : vista === "config"
                ? "Agentes de soporte y whitelist de usuarios"
                : `${visibles.length} ${visibles.length === 1 ? "ticket" : "tickets"} · canal WhatsApp`}
            </p>
          </div>
          <div className="bf-header-actions">
            {vista === "tickets" && (
              <div className="bf-search">
                <IcSearch size={16} className="bf-search-ic" />
                <input
                  placeholder="Buscar por número o folio…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            )}
            <button className="bf-sync" onClick={fetchData} disabled={syncing}>
              <IcRefresh size={16} className={syncing ? "bf-spin" : ""} />
              {syncing ? "Sincronizando" : "Sincronizar"}
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section className="bf-kpis">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bf-kpi"
              style={{ "--accent": k.color }}
            >
              <div
                className="bf-kpi-icon"
                style={{ background: k.tint, color: k.color }}
              >
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
        {vista === "guias" ? (
          <GestorGuias
            guias={guias}
            guiaSelId={guiaSelId}
            guiaDetalle={guiaDetalle}
            onSeleccionar={setGuiaSelId}
            onCrear={crearGuia}
            onActualizar={actualizarGuia}
            onCrearPaso={crearPaso}
            onActualizarPaso={actualizarPaso}
            onEliminarPaso={eliminarPaso}
            onSubirImagen={subirImagenPaso}
            onRefresh={fetchGuias}
          />
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
                  <div className="bf-empty-ic">
                    <IcCheckCircle size={28} />
                  </div>
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
                  const abierto = ESTADOS_ACTIVOS_SET.has(ticket.estado);
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

                      <p className="bf-card-preview">
                        {ultimoMensaje(ticket)}
                      </p>

                      <div className="bf-card-foot">
                        <span className="bf-card-meta">
                          <IcPhone size={13} /> +{ticket.numero}
                        </span>
                        {agente ? (
                          <span className="bf-card-agent">
                            <span
                              className="bf-avatar bf-avatar-sm"
                              style={{
                                background: colorPara(ticket.asignado_a),
                              }}
                            >
                              {iniciales(agente.nombre)}
                            </span>
                            {agente.nombre.split(" ")[0]}
                          </span>
                        ) : sinAsignar ? (
                          <span className="bf-pill-urgent">Sin asignar</span>
                        ) : (
                          <span className="bf-card-date">
                            <IcClock size={12} /> {ticket.fecha}
                          </span>
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
                onClose={() => setSelectedId(null)}
                onAsignar={asignarTicket}
                onResolver={cerrarTicket}
                onTransicionar={transicionarTicket}
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

function DetalleTicket({ ticket, agentes, auditLog, imagenes = [], onClose, onAsignar, onTransicionar, onPatch, onEnviarMensaje }) {
  const [notas, setNotas] = useState(ticket.notas_internas || "");
  const [pasos, setPasos] = useState(ticket.pasos_intentados || "");
  const [prioridad, setPrioridad] = useState(ticket.prioridad || "normal");
  const [imgExpanded, setImgExpanded] = useState(null);
  const [msgTexto, setMsgTexto] = useState("");
  const [msgEnviando, setMsgEnviando] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState(null); // "ok" | "error"
  const agente = agentes[ticket.asignado_a];
  const transiciones = TRANSICIONES_UI[ticket.estado] || [];

  const guardarNotas = () => onPatch(ticket.id, { notas_internas: notas });
  const guardarPasos = () => onPatch(ticket.id, { pasos_intentados: pasos });
  const cambiarPrioridad = (p) => { setPrioridad(p); onPatch(ticket.id, { prioridad: p }); };

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

      {/* Meta grid */}
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
        <div className="bf-meta">
          <span className="bf-meta-k">Categoría</span>
          <span className="bf-meta-v">{ticket.categoria || "—"}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k">Canal</span>
          <span className="bf-meta-v" style={{ textTransform: "capitalize" }}>{ticket.canal || "whatsapp"}</span>
        </div>
        <div className="bf-meta">
          <span className="bf-meta-k">Prioridad</span>
          <span className="bf-meta-v">
            <select
              className="bf-prio-select"
              value={prioridad}
              onChange={(e) => cambiarPrioridad(e.target.value)}
            >
              {["baja","normal","alta","urgente"].map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {/* Descripción */}
      {(ticket.descripcion || ticket.resumen_ia) && (
        <div className="bf-descripcion">
          <div className="bf-chat-label">Descripción del problema</div>
          <p className="bf-desc-text">{ticket.descripcion || ticket.resumen_ia}</p>
        </div>
      )}

      {/* Historial */}
      <div className="bf-chat-label">Historial de conversación</div>
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
          <button className="bf-notas-save" onClick={guardarPasos}>Guardar pasos</button>
        )}
      </div>

      {/* Agente */}
      <div className="bf-assign">
        <label className="bf-assign-label">Agente asignado</label>
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
          <button className="bf-notas-save" onClick={guardarNotas}>
            Guardar notas
          </button>
        )}
      </div>

      {/* Mensaje directo vía WhatsApp */}
      <div className="bf-msg-direct">
        <label className="bf-assign-label">Mensaje directo al usuario</label>

        {/* Templates rápidos */}
        <div className="bf-msg-templates">
          {TEMPLATES_RAPIDOS.map(tpl => (
            <button
              key={tpl.label}
              className="bf-msg-tpl-btn"
              onClick={() => enviar(tpl.texto)}
              disabled={msgEnviando}
              title={tpl.texto}
            >
              {tpl.label}
            </button>
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
          <button
            className="bf-msg-send-btn"
            onClick={() => enviar()}
            disabled={!msgTexto.trim() || msgEnviando}
          >
            <IcSend size={15} />
            {msgEnviando ? "Enviando…" : "Enviar"}
          </button>
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
              <button
                key={estado}
                className="bf-trans-btn"
                style={{ "--tc": TRANS_COLOR[estado] || "#5E7B79" }}
                onClick={() => onTransicionar(ticket.id, estado)}
              >
                {label}
              </button>
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
    </>
  );
}

function GestorGuias({ guias, guiaSelId, guiaDetalle, onSeleccionar, onCrear, onActualizar, onCrearPaso, onActualizarPaso, onEliminarPaso, onSubirImagen, onRefresh }) {
  const [creando, setCreando] = useState(false);
  const [nuevaId, setNuevaId] = useState("");
  const [nuevaTitulo, setNuevaTitulo] = useState("");
  const [nuevaDesc, setNuevaDesc] = useState("");
  const [errCrear, setErrCrear] = useState("");

  const handleCrear = async () => {
    if (!nuevaId.trim() || !nuevaTitulo.trim()) { setErrCrear("ID y título son requeridos"); return; }
    if (nuevaTitulo.length > 24) { setErrCrear("El título debe tener máximo 24 caracteres"); return; }
    const res = await onCrear(nuevaId.trim(), nuevaTitulo.trim(), nuevaDesc.trim());
    if (res && res.ok) {
      setCreando(false); setNuevaId(""); setNuevaTitulo(""); setNuevaDesc(""); setErrCrear("");
    } else {
      setErrCrear(res?.error || "Error al crear la guía");
    }
  };

  return (
    <section className="bf-work">
      {/* Lista de guías */}
      <div className="bf-panel bf-list">
        <div className="bf-panel-head">
          <IcBook size={16} />
          <span>Guías ({guias.length})</span>
          <button className="bf-guia-add-btn" onClick={() => setCreando(true)} title="Nueva guía">
            <IcPlus size={15} />
          </button>
        </div>

        <div className="bf-list-body bf-scroll">
          {creando && (
            <div className="bf-guia-new-form">
              <input
                className="bf-guia-input"
                placeholder="ID (ej: guia_no_imprime)"
                value={nuevaId}
                onChange={e => setNuevaId(e.target.value)}
              />
              <input
                className="bf-guia-input"
                placeholder="Título (máx 24 caracteres)"
                value={nuevaTitulo}
                maxLength={24}
                onChange={e => setNuevaTitulo(e.target.value)}
              />
              <textarea
                className="bf-guia-input"
                placeholder="Descripción del ticket (opcional)"
                value={nuevaDesc}
                onChange={e => setNuevaDesc(e.target.value)}
                rows={2}
              />
              {errCrear && <p className="bf-guia-err">{errCrear}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="bf-guia-save-btn" onClick={handleCrear}>Crear</button>
                <button className="bf-guia-cancel-btn" onClick={() => { setCreando(false); setErrCrear(""); }}>Cancelar</button>
              </div>
            </div>
          )}

          {guias.length === 0 && !creando ? (
            <div className="bf-empty">
              <div className="bf-empty-ic"><IcBook size={28} /></div>
              <p className="bf-empty-title">Sin guías</p>
              <p className="bf-empty-text">Crea la primera guía para el bot de WhatsApp.</p>
            </div>
          ) : (
            guias.map(g => (
              <button
                key={g.id}
                className={`bf-guia-card${guiaSelId === g.id ? " is-selected" : ""}${!g.activo ? " is-inactive" : ""}`}
                onClick={() => onSeleccionar(g.id)}
              >
                <div className="bf-guia-card-top">
                  <span className="bf-guia-card-title">{g.titulo}</span>
                  {!g.activo && <span className="bf-guia-badge-off">inactiva</span>}
                </div>
                <span className="bf-guia-card-id">{g.id}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="bf-panel bf-detail">
        {!guiaSelId ? (
          <div className="bf-detail-empty">
            <div className="bf-empty-ic"><IcBook size={30} /></div>
            <p className="bf-empty-title">Selecciona una guía</p>
            <p className="bf-empty-text">Elige una guía de la lista para ver y editar sus pasos.</p>
          </div>
        ) : guiaDetalle ? (
          <EditorGuia
            key={guiaSelId}
            guia={guiaDetalle}
            onActualizar={onActualizar}
            onCrearPaso={onCrearPaso}
            onActualizarPaso={onActualizarPaso}
            onEliminarPaso={onEliminarPaso}
            onSubirImagen={onSubirImagen}
          />
        ) : (
          <div className="bf-detail-empty">
            <p className="bf-empty-text">Cargando…</p>
          </div>
        )}
      </div>
    </section>
  );
}

function EditorGuia({ guia, onActualizar, onCrearPaso, onActualizarPaso, onEliminarPaso, onSubirImagen }) {
  const [titulo, setTitulo] = useState(guia.titulo || "");
  const [desc, setDesc] = useState(guia.descripcion_ticket || "");
  const [activo, setActivo] = useState(guia.activo !== false);
  const [metaDirty, setMetaDirty] = useState(false);
  const [nuevoPaso, setNuevoPaso] = useState("");
  const [editPasoId, setEditPasoId] = useState(null);
  const [editPasoTexto, setEditPasoTexto] = useState("");

  const guardarMeta = () => {
    onActualizar(guia.id, { titulo, descripcion_ticket: desc, activo });
    setMetaDirty(false);
  };

  const iniciarEditPaso = (paso) => { setEditPasoId(paso.id); setEditPasoTexto(paso.texto); };

  const guardarPaso = () => {
    onActualizarPaso(guia.id, editPasoId, { texto: editPasoTexto });
    setEditPasoId(null);
  };

  const agregarPaso = () => {
    if (!nuevoPaso.trim()) return;
    onCrearPaso(guia.id, nuevoPaso.trim());
    setNuevoPaso("");
  };

  return (
    <>
      <div className="bf-detail-head">
        <div>
          <div className="bf-detail-id">{guia.id}</div>
          <p className="bf-detail-sub">{guia.pasos?.length ?? 0} pasos · {activo ? "Activa" : "Inactiva"}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="bf-guia-meta">
        <div className="bf-guia-field">
          <label className="bf-assign-label">Título <span style={{ color: C.textFaint, fontWeight: 400 }}>(máx 24 caracteres)</span></label>
          <input
            className="bf-guia-input"
            value={titulo}
            maxLength={24}
            onChange={e => { setTitulo(e.target.value); setMetaDirty(true); }}
          />
        </div>
        <div className="bf-guia-field">
          <label className="bf-assign-label">Descripción del ticket</label>
          <textarea
            className="bf-guia-input"
            value={desc}
            rows={2}
            onChange={e => { setDesc(e.target.value); setMetaDirty(true); }}
            placeholder="Descripción que verá el LLM al crear el ticket automáticamente"
          />
        </div>
        <div className="bf-guia-toggle-row">
          <label className="bf-assign-label" style={{ margin: 0 }}>Activa en el bot</label>
          <input type="checkbox" checked={activo} onChange={e => { setActivo(e.target.checked); setMetaDirty(true); }} />
        </div>
        {metaDirty && (
          <button className="bf-guia-save-btn" onClick={guardarMeta}>Guardar cambios</button>
        )}
      </div>

      {/* Pasos */}
      <div className="bf-chat-label" style={{ marginTop: 4, marginBottom: 10 }}>Pasos de la guía</div>
      <div className="bf-guia-pasos bf-scroll">
        {(!guia.pasos || guia.pasos.length === 0) && (
          <p className="bf-chat-empty">Sin pasos aún. Agrega el primero abajo.</p>
        )}
        {guia.pasos?.map((paso, idx) => (
          <div key={paso.id} className="bf-guia-paso">
            <div className="bf-guia-paso-num">{idx + 1}</div>
            <div className="bf-guia-paso-body">
              {editPasoId === paso.id ? (
                <>
                  <textarea
                    className="bf-guia-input"
                    value={editPasoTexto}
                    onChange={e => setEditPasoTexto(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button className="bf-guia-save-btn" onClick={guardarPaso}>Guardar</button>
                    <button className="bf-guia-cancel-btn" onClick={() => setEditPasoId(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <p className="bf-guia-paso-texto">{paso.texto}</p>
              )}

              {/* Imagen del paso */}
              <div className="bf-guia-paso-img-row">
                {paso.tiene_imagen ? (
                  <>
                    <img
                      className="bf-guia-img-thumb"
                      src={`${API}/guias/${guia.id}/pasos/${paso.orden}/imagen`}
                      alt={`Paso ${idx + 1}`}
                    />
                    <label className="bf-guia-img-btn">
                      <IcImage size={13} /> Cambiar
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && onSubirImagen(guia.id, paso.id, e.target.files[0])} />
                    </label>
                  </>
                ) : (
                  <label className="bf-guia-img-btn">
                    <IcImage size={13} /> Agregar imagen
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && onSubirImagen(guia.id, paso.id, e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>

            {editPasoId !== paso.id && (
              <div className="bf-guia-paso-actions">
                <button className="bf-icon-btn" onClick={() => iniciarEditPaso(paso)} title="Editar paso">
                  <IcSliders size={14} />
                </button>
                <button className="bf-icon-btn bf-icon-btn-danger" onClick={() => onEliminarPaso(guia.id, paso.id)} title="Eliminar paso">
                  <IcTrash size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nuevo paso */}
      <div className="bf-guia-add-paso">
        <div className="bf-chat-label" style={{ marginTop: 0 }}>Agregar paso</div>
        <textarea
          className="bf-guia-input"
          placeholder="Texto del paso (puedes usar *negrita* y saltos de línea)"
          value={nuevoPaso}
          onChange={e => setNuevoPaso(e.target.value)}
          rows={2}
        />
        <button
          className="bf-guia-save-btn"
          style={{ marginTop: 6, alignSelf: "flex-start" }}
          onClick={agregarPaso}
          disabled={!nuevoPaso.trim()}
        >
          <IcPlus size={14} /> Agregar paso
        </button>
      </div>
    </>
  );
}

function GestorConfig({ agentes, usuarios, whitelistActiva, onCrearAgente, onActualizarAgente, onAgregarUsuario, onDesactivarUsuario }) {
  // ── Agentes ──
  const [creandoAgente, setCreandoAgente] = useState(false);
  const [nuevoAId, setNuevoAId] = useState("");
  const [nuevoANombre, setNuevoANombre] = useState("");
  const [nuevoAWa, setNuevoAWa] = useState("");
  const [nuevoANotif, setNuevoANotif] = useState(true);
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
    const res = await onCrearAgente(nuevoAId.trim(), nuevoANombre.trim(), nuevoAWa.trim(), nuevoANotif);
    if (res && res.ok) {
      setCreandoAgente(false); setNuevoAId(""); setNuevoANombre(""); setNuevoAWa(""); setNuevoANotif(true); setErrAgente("");
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
    setEditAgenteCampos({ nombre: a.nombre, whatsapp: a.whatsapp, notificar: a.notificar, activo: a.activo });
  };

  const guardarAgente = () => {
    onActualizarAgente(editAgenteId, editAgenteCampos);
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
              <div className="bf-guia-toggle-row">
                <label className="bf-assign-label" style={{ margin: 0 }}>Recibe notificaciones</label>
                <input type="checkbox" checked={nuevoANotif} onChange={e => setNuevoANotif(e.target.checked)} />
              </div>
              {errAgente && <p className="bf-guia-err">{errAgente}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="bf-guia-save-btn" onClick={handleCrearAgente}>Crear</button>
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
                  <div className="bf-cfg-toggles">
                    <label className="bf-cfg-toggle">
                      <input type="checkbox" checked={editAgenteCampos.notificar} onChange={e => setEditAgenteCampos(p => ({ ...p, notificar: e.target.checked }))} />
                      Notificaciones
                    </label>
                    <label className="bf-cfg-toggle">
                      <input type="checkbox" checked={editAgenteCampos.activo} onChange={e => setEditAgenteCampos(p => ({ ...p, activo: e.target.checked }))} />
                      Activo
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="bf-guia-save-btn" onClick={guardarAgente}>Guardar</button>
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
                      +{a.whatsapp}
                      {a.notificar && <span className="bf-cfg-pill">notif</span>}
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
                <button className="bf-guia-save-btn" onClick={handleCrearUsuario}>Agregar</button>
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
                <button
                  className="bf-icon-btn bf-icon-btn-danger"
                  onClick={() => onDesactivarUsuario(u.numero)}
                  title="Desactivar acceso"
                >
                  <IcTrash size={14} />
                </button>
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
@keyframes bf-spin{to{transform:rotate(360deg)}}

/* ── KPIs ── */
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

/* ── Workspace ── */
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

.bf-meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${C.border};border:1px solid ${C.border};border-radius:14px;overflow:hidden;margin-bottom:16px}
.bf-descripcion{margin-bottom:18px;padding:14px 16px;background:${C.surfaceAlt};border:1px solid ${C.border};border-radius:14px}
.bf-desc-text{font-size:13.5px;color:${C.text};line-height:1.6;white-space:pre-wrap}
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
.bf-select-wrap{position:relative}
.bf-select-wrap::after{content:"";position:absolute;right:16px;top:50%;width:9px;height:9px;border-right:2px solid ${C.textMuted};border-bottom:2px solid ${C.textMuted};transform:translateY(-70%) rotate(45deg);pointer-events:none}
.bf-select-wrap select{
  width:100%;height:46px;padding:0 40px 0 16px;border-radius:12px;
  border:1px solid ${C.border};background:${C.surface};color:${C.text};
  font-size:14px;font-weight:500;cursor:pointer;appearance:none;outline:none;transition:border-color .15s, box-shadow .15s;
}
.bf-select-wrap select:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}

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

/* ── Gestión de Guías ── */
.bf-guia-add-btn{
  margin-left:auto;width:26px;height:26px;border-radius:8px;
  border:1px solid rgba(133,182,196,0.3);background:transparent;color:${C.azulLight};
  cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;
}
.bf-guia-add-btn:hover{background:rgba(133,182,196,0.15);color:#fff}

.bf-guia-card{
  display:block;width:100%;text-align:left;cursor:pointer;
  padding:13px 15px;border-radius:12px;border:1px solid ${C.border};
  background:${C.surface};transition:all .15s ease;
}
.bf-guia-card:hover{border-color:${C.borderStrong};background:${C.surfaceAlt}}
.bf-guia-card.is-selected{border-color:${C.naranja};background:rgba(208,100,48,0.04);box-shadow:0 0 0 1px ${C.naranja} inset}
.bf-guia-card.is-inactive{opacity:.5}
.bf-guia-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.bf-guia-card-title{font-size:14px;font-weight:700;color:${C.azulDark}}
.bf-guia-card-id{font-size:11.5px;color:${C.textFaint};font-family:monospace}
.bf-guia-badge-off{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${C.border};color:${C.textMuted};flex-shrink:0}

.bf-guia-new-form{
  padding:14px;border:1px solid ${C.border};border-radius:12px;
  background:${C.surfaceAlt};display:flex;flex-direction:column;gap:8px;margin-bottom:10px;
}
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

.bf-guia-meta{
  display:flex;flex-direction:column;gap:12px;padding:16px;
  background:${C.surfaceAlt};border:1px solid ${C.border};border-radius:14px;margin-bottom:16px;
}
.bf-guia-field{display:flex;flex-direction:column;gap:6px}
.bf-guia-toggle-row{display:flex;align-items:center;gap:10px}
.bf-guia-input{
  width:100%;padding:10px 14px;border:1px solid ${C.border};border-radius:10px;
  font-size:13.5px;font-family:inherit;color:${C.text};background:${C.surface};
  outline:none;transition:border-color .15s,box-shadow .15s;resize:vertical;
}
.bf-guia-input:focus{border-color:${C.azulLight};box-shadow:0 0 0 3px rgba(133,182,196,0.18)}

.bf-guia-pasos{display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;margin-bottom:14px}
.bf-guia-paso{
  display:flex;gap:12px;padding:14px;border:1px solid ${C.border};
  border-radius:12px;background:${C.surface};align-items:flex-start;
}
.bf-guia-paso-num{
  width:26px;height:26px;border-radius:50%;background:${C.azulDark};color:#fff;
  font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;
}
.bf-guia-paso-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.bf-guia-paso-texto{font-size:13.5px;color:${C.text};line-height:1.55;white-space:pre-wrap}
.bf-guia-paso-actions{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.bf-guia-paso-img-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bf-guia-img-thumb{height:44px;border-radius:8px;border:1px solid ${C.border};object-fit:cover}
.bf-guia-img-btn{
  display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;
  border:1px dashed ${C.borderStrong};background:transparent;color:${C.textMuted};
  font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;font-family:inherit;
}
.bf-guia-img-btn:hover{border-color:${C.azulLight};color:${C.azulDark};background:rgba(133,182,196,0.08)}
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
.bf-cfg-notice{
  padding:12px 14px;border-radius:10px;background:${C.openBg};border:1px solid rgba(226,163,67,0.3);
  font-size:13px;color:${C.openText};line-height:1.5;margin-bottom:8px;
}
.bf-cfg-notice code{font-family:monospace;font-size:12px;background:rgba(226,163,67,0.15);padding:1px 5px;border-radius:4px}

.bf-guia-add-paso{
  padding:14px;border:1px solid ${C.border};border-radius:12px;
  background:${C.surfaceAlt};display:flex;flex-direction:column;gap:8px;
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
