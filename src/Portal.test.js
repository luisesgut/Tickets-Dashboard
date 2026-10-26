import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import App from "./App";

/* El portal del usuario final: lo que ve un administrativo.
   Se recorre como en el celular, una pantalla a la vez:
   tema → detalles → enviado → vincular, más "Mis tickets" y el detalle.
   Lo que no cambia es el contrato que lo separa del dashboard de TI —
   con rol "usuario" la cola de trabajo no aparece por ningún lado. */

const hace = (min) => new Date(Date.now() - min * 60000).toISOString();

const YO_USUARIO = {
  email: "laura@bioflex.com", nombre: "Laura Ortiz", rol: "usuario",
  area: "Contabilidad", whatsapp: null, es_ti: false,
};

const PERFIL = {
  email: "laura@bioflex.com", nombre: "Laura Ortiz", rol: "usuario",
  area: "Contabilidad", whatsapp: null, whatsapp_vinculado: false,
  categorias: ["🌐 Red", "🖨️ Impresora", "🔑 Accesos", "💻 Hardware", "⚙️ Software", "📋 General"],
  bot_configurado: true,
};

const T_ESPERA = {
  id: "BFX-0247", numero: "", solicitante_email: "laura@bioflex.com",
  nombre: "Laura Ortiz", estado: "WAITING_FOR_USER", asignado_a: "ag_carlos",
  asignado_nombre: "Carlos Méndez", area: "Contabilidad", maquina: null,
  prioridad: "normal", categoria: "🔑 Accesos", canal: "web",
  descripcion: "No puedo entrar al correo, dice contraseña incorrecta",
  preview: "Bot: ¿El error sale también desde tu celular?",
  fecha: "12/10/2026 09:15", fecha_iso: hace(130),
  fecha_cierre: null, fecha_cierre_iso: null,
};

const T_PROCESO = {
  ...T_ESPERA, id: "BFX-0250", estado: "IN_PROGRESS", fecha_iso: hace(20),
  descripcion: "La impresora del piso 2 saca las hojas rayadas",
};

const T_RESUELTO = {
  ...T_ESPERA, id: "BFX-0198", estado: "RESOLVED", canal: "whatsapp",
  numero: "5214771112222", asignado_nombre: "Carlos Méndez",
  descripcion: "Excel no abre el archivo de nómina",
  fecha_iso: hace(4000), fecha_cierre: "10/10/2026 11:00", fecha_cierre_iso: hace(3800),
};

let perfilActual, ticketsActuales, creados, mensajesEnviados, vinculacionesPedidas;

const mockFetch = () => jest.fn((url, opts = {}) => {
  const u = String(url);
  const metodo = opts.method || "GET";
  let json = {};

  if (u.includes("/auth/yo")) json = YO_USUARIO;
  else if (u.includes("/mi/perfil")) json = perfilActual;
  else if (u.includes("/mi/vinculacion") && metodo === "POST") {
    vinculacionesPedidas++;
    json = { codigo: "K7M2", expira_minutos: 15, mensaje: "VINCULAR K7M2",
             wa_link: "https://wa.me/524771234567?text=VINCULAR%20K7M2",
             numero_bot: "524771234567" };
  }
  else if (u.match(/\/mi\/tickets\/BFX-[\w-]+\/mensaje/)) {
    mensajesEnviados.push(JSON.parse(opts.body).texto);
    json = { ok: true };
  }
  else if (u.match(/\/mi\/tickets\/BFX-/)) {
    const id = u.split("/mi/tickets/")[1];
    const t = ticketsActuales.find((x) => x.id === id);
    json = t ? { ...t, historial: [
      { role: "user", content: t.descripcion },
      { role: "assistant", content: "[Carlos Méndez] ¿El error sale también desde tu celular?" },
    ], imagenes: [] } : {};
  }
  else if (u.includes("/mi/tickets") && metodo === "POST") {
    creados.push(JSON.parse(opts.body));
    json = { ok: true, id: "BFX-0301", categoria: "🔑 Accesos", estado: "OPEN" };
  }
  else if (u.includes("/mi/tickets")) json = { tickets: ticketsActuales, total: ticketsActuales.length };

  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
});

beforeEach(() => {
  localStorage.setItem("bf_token", "tok");
  localStorage.setItem("bf_nombre", "Laura Ortiz");
  perfilActual = { ...PERFIL };
  ticketsActuales = [T_ESPERA, T_PROCESO, T_RESUELTO];
  creados = [];
  mensajesEnviados = [];
  vinculacionesPedidas = 0;
  global.fetch = mockFetch();
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); jest.useRealTimers(); });

const portal = () => document.querySelector(".bf-portal");
const inicio = async () => {
  render(<App />);
  await screen.findByRole("heading", { name: /Qué está fallando/ });
  // Espera a que lleguen perfil y tickets, no solo el armazón
  await waitFor(() => expect(screen.getByRole("button", { name: /Mis tickets/ })).toHaveTextContent("2"));
};
const aMisTickets = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Mis tickets/ }));
  await screen.findByRole("heading", { name: "Mis tickets" });
};
const elegir = (tema) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tema}`) }));
const detalles = () => screen.getByLabelText("Detalles");
const enviar = () => screen.getByRole("button", { name: "Enviar a TI" });

test("con rol de usuario se pinta el portal, nunca la cola de TI", async () => {
  await inicio();

  // Lo que el administrativo SÍ ve: el paso 1, con su nombre
  expect(screen.getByRole("heading", { name: "¿Qué está fallando, Laura?" })).toBeInTheDocument();
  expect(screen.getByText("Paso 1 de 2")).toBeInTheDocument();

  // Y lo que NO debe ver por ningún lado: la cola de trabajo de TI
  expect(document.querySelector(".bf-sidebar")).toBeNull();
  expect(document.querySelector(".bf-cola")).toBeNull();
  expect(screen.queryByText("Sin atender")).toBeNull();
  expect(screen.queryByText(/Configuración/)).toBeNull();

  // El portal no debe tocar los endpoints de TI. Se descartan las rutas /mi/*,
  // que son las propias del portal y también acaban en "/tickets".
  const deTI = global.fetch.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => !u.includes("/mi/"));
  expect(deTI.some((u) => u.includes("/tickets"))).toBe(false);
  expect(deTI.some((u) => u.includes("/stats"))).toBe(false);
  expect(deTI.some((u) => u.includes("/agentes"))).toBe(false);
});

test("los temas son los de la gente, y cada uno manda la categoría del backend", async () => {
  await inicio();
  for (const t of ["Accesos", "Red", "Impresora", "Mi equipo", "Programas", "No sé / otro"]) {
    expect(screen.getByRole("button", { name: new RegExp(`^${t}`) })).toBeInTheDocument();
  }

  elegir("Mi equipo");
  expect(screen.getByText("Paso 2 de 2")).toBeInTheDocument();
  fireEvent.change(detalles(), { target: { value: "La computadora no prende desde la mañana" } });
  fireEvent.click(enviar());

  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0]).toEqual({
    descripcion: "La computadora no prende desde la mañana",
    categoria: "💻 Hardware",
  });
});

test("avisa en el inicio cuando TI está esperando respuesta, y lleva al ticket", async () => {
  await inicio();
  const alerta = document.querySelector(".bf-pt-alerta");
  expect(alerta).toHaveTextContent("TI te preguntó algo en BFX-0247");

  fireEvent.click(alerta);
  await waitFor(() => expect(document.querySelector(".bf-pt-chat")).toBeInTheDocument());
  expect(screen.getByLabelText("TI está esperando tu respuesta")).toBeInTheDocument();
});

test("un solo campo obligatorio: el botón espera la descripción", async () => {
  await inicio();
  elegir("Accesos");

  expect(enviar()).toBeDisabled();
  fireEvent.change(detalles(), { target: { value: "corto" } });
  expect(enviar()).toBeDisabled();
  fireEvent.change(detalles(), {
    target: { value: "No puedo entrar al correo, dice contrasena incorrecta" },
  });
  expect(enviar()).not.toBeDisabled();
});

test("las sugerencias escriben por la persona y el folio se confirma en grande", async () => {
  await inicio();
  elegir("Accesos");

  const sug = screen.getByRole("button", { name: "Olvidé mi contraseña" });
  fireEvent.click(sug);
  expect(sug).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(detalles(), { target: { value: detalles().value + "Es la de SISPRO." } });
  fireEvent.click(enviar());

  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0]).toEqual({
    descripcion: "Olvidé mi contraseña. Es la de SISPRO.",
    categoria: "🔑 Accesos",
  });

  // La confirmación da el folio, que es lo que el usuario puede citar
  expect(await screen.findByText("BFX-0301")).toBeInTheDocument();
  expect(screen.getByText(/Ya lo registramos/)).toBeInTheDocument();
  expect(screen.getByText("También te lo mandamos a tu correo.")).toBeInTheDocument();
});

test("con «No sé / otro», la categoría no viaja y la deduce el backend", async () => {
  await inicio();
  elegir("No sé / otro");
  fireEvent.change(detalles(), { target: { value: "La pantalla parpadea cuando abro la cámara" } });
  fireEvent.click(enviar());

  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].categoria).toBeUndefined();
});

test("«cambiar» regresa al paso 1 sin perder lo escrito", async () => {
  await inicio();
  elegir("Red");
  fireEvent.change(detalles(), { target: { value: "No tengo internet desde las 9" } });
  fireEvent.click(screen.getByRole("button", { name: /Red · cambiar/ }));
  elegir("Impresora");
  expect(detalles()).toHaveValue("No tengo internet desde las 9");
});

test("Mis tickets: lo que espera tu respuesta va primero, y el estado en lenguaje de usuario", async () => {
  await inicio();
  await aMisTickets();

  expect(screen.getByText("Laura Ortiz · Contabilidad")).toBeInTheDocument();
  const filas = [...document.querySelectorAll(".bf-pt-fila")];
  expect(filas.map((f) => f.querySelector(".bf-pt-folio").textContent)).toEqual(["BFX-0247", "BFX-0250"]);

  // "WAITING_FOR_USER" no se le muestra nunca al usuario
  expect(filas[0]).toHaveTextContent("Te preguntaron");
  expect(filas[0]).not.toHaveTextContent("WAITING_FOR_USER");
  expect(filas[0]).toHaveTextContent("Carlos necesita tu respuesta para seguir");
  // El nombre del técnico, no su id: es lo que evita el "¿cómo va mi ticket?"
  expect(filas[1]).toHaveTextContent("Carlos Méndez lo está atendiendo");
  expect(filas[1]).not.toHaveTextContent("ag_carlos");
  expect(filas[1].querySelector(".bf-pt-avance")).toHaveAttribute("aria-label", "Avance: En proceso");

  // Los resueltos van en su pestaña, con el canal de origen a la vista
  fireEvent.click(screen.getByRole("tab", { name: /Resueltos · 1/ }));
  const resuelto = document.querySelector(".bf-pt-fila");
  expect(resuelto).toHaveTextContent("BFX-0198");
  expect(resuelto).toHaveTextContent("Resuelto");
  expect(resuelto).toHaveTextContent("WhatsApp");
});

test("el detalle muestra la conversación y deja responder a TI", async () => {
  await inicio();
  await aMisTickets();
  fireEvent.click(screen.getByText("BFX-0247").closest("button"));
  await waitFor(() => expect(document.querySelector(".bf-pt-chat")).toBeInTheDocument());

  expect(screen.getByText(/El error sale también desde tu celular/)).toBeInTheDocument();
  expect(screen.getByText("Carlos Méndez lo está atendiendo.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("TI está esperando tu respuesta"), {
    target: { value: "Ya probé desde mi celular y tampoco entra" },
  });
  fireEvent.click(enviar());
  await waitFor(() => expect(mensajesEnviados).toEqual([
    "Ya probé desde mi celular y tampoco entra",
  ]));
});

test("un ticket cerrado no se puede responder", async () => {
  await inicio();
  await aMisTickets();
  fireEvent.click(screen.getByRole("tab", { name: /Resueltos/ }));
  fireEvent.click(screen.getByText("BFX-0198").closest("button"));
  await waitFor(() => expect(document.querySelector(".bf-pt-chat")).toBeInTheDocument());

  expect(document.querySelector(".bf-pt-responder")).toBeNull();
  expect(screen.getByText(/ya está cerrado/i)).toBeInTheDocument();
});

test("después de enviar se invita a ligar WhatsApp: un tap con el mensaje ya escrito", async () => {
  await inicio();
  elegir("Red");
  fireEvent.change(detalles(), { target: { value: "No tengo internet desde las 9" } });
  fireEvent.click(enviar());
  fireEvent.click(await screen.findByRole("button", { name: "Activar avisos por WhatsApp" }));

  // El código se pide solo, al entrar a la pantalla
  await waitFor(() => expect(vinculacionesPedidas).toBe(1));
  const link = await screen.findByRole("link", { name: "Abrir WhatsApp y enviar" });
  expect(link).toHaveAttribute("href", "https://wa.me/524771234567?text=VINCULAR%20K7M2");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByLabelText("VINCULAR K7M2")).toBeInTheDocument();
  expect(screen.getByText(/Vence en 1[45]:\d\d/)).toBeInTheDocument();
  // Plan B si WhatsApp no se abre: el número del bot, legible
  expect(screen.getByText("+52 477 123 4567")).toBeInTheDocument();
});

test("en cuanto el bot canjea el código, la pantalla de vincular lo celebra sola", async () => {
  await inicio();
  await aMisTickets();
  fireEvent.click(screen.getByRole("button", { name: /Activa avisos por WhatsApp/ }));
  await screen.findByRole("link", { name: "Abrir WhatsApp y enviar" });

  // El usuario manda el mensaje en WhatsApp y vuelve a la pestaña
  perfilActual = { ...PERFIL, whatsapp: "5214771112222", whatsapp_vinculado: true };
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(await screen.findByRole("heading", { name: "Tu WhatsApp quedó ligado" })).toBeInTheDocument();
});

test("se puede ligar el WhatsApp desde el inicio, sin levantar un ticket", async () => {
  await inicio();
  fireEvent.click(screen.getByRole("button", { name: /Activa avisos por WhatsApp/ }));
  expect(await screen.findByRole("link", { name: "Abrir WhatsApp y enviar" })).toBeInTheDocument();
  expect(creados).toEqual([]);

  // "Ahora no" regresa a donde estaba: el inicio
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  expect(await screen.findByRole("heading", { name: /Qué está fallando/ })).toBeInTheDocument();
});

test("el link ?vincular entra directo a ligar el WhatsApp y se limpia de la URL", async () => {
  window.history.pushState(null, "", "/?vincular");
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Liga tu WhatsApp en un toque" })).toBeInTheDocument();
  await waitFor(() => expect(vinculacionesPedidas).toBe(1));
  expect(window.location.search).toBe("");
});

test("con el WhatsApp ya vinculado, no se invita a ligarlo", async () => {
  perfilActual = { ...PERFIL, whatsapp: "5214771112222", whatsapp_vinculado: true };
  await inicio();
  expect(screen.queryByText(/Activa avisos por WhatsApp/)).toBeNull();
  await aMisTickets();
  expect(screen.queryByText(/Activa avisos por WhatsApp/)).toBeNull();
});

test("sin tickets, Mis tickets explica para qué sirve en vez de quedarse vacío", async () => {
  ticketsActuales = [];
  render(<App />);
  await screen.findByRole("heading", { name: /Qué está fallando/ });
  expect(document.querySelector(".bf-pt-alerta")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Mis tickets/ }));
  expect(await screen.findByText(/Todavía no has levantado ningún ticket/)).toBeInTheDocument();
  expect(within(portal()).getByRole("button", { name: /Nuevo ticket/ })).toBeInTheDocument();
});

test("sin área en el perfil, el portal la pide antes de dejar enviar", async () => {
  // Mismo criterio que en WhatsApp: ningún ticket llega a TI sin saber de dónde
  // viene. Quien ya tiene área en su perfil no la vuelve a escribir.
  perfilActual = { ...PERFIL, area: null };
  await inicio();
  elegir("Accesos");

  fireEvent.change(detalles(), {
    target: { value: "No puedo entrar al correo, dice contrasena incorrecta" },
  });
  expect(enviar()).toBeDisabled();            // falta el área

  fireEvent.change(screen.getByLabelText("¿De qué área eres?"), {
    target: { value: "Recursos Humanos" },
  });
  expect(enviar()).not.toBeDisabled();

  fireEvent.click(enviar());
  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].area).toBe("Recursos Humanos");
});

test("con área en el perfil, no se vuelve a preguntar", async () => {
  await inicio();   // PERFIL trae area: "Contabilidad"
  elegir("Impresora");
  expect(screen.queryByLabelText("¿De qué área eres?")).toBeNull();

  fireEvent.change(detalles(), { target: { value: "La impresora del piso 2 saca hojas rayadas" } });
  fireEvent.click(enviar());
  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].area).toBeUndefined();   // el backend la toma del perfil
});

describe("en computadora", () => {
  // jsdom no trae matchMedia: se simula una pantalla ancha
  beforeEach(() => {
    window.matchMedia = jest.fn((q) => ({
      matches: q === "(min-width: 960px)", media: q,
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
    }));
  });
  afterEach(() => { delete window.matchMedia; });

  test("Mis tickets está siempre al lado del flujo para levantar uno", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /Qué está fallando/ });
    const lateral = screen.getByRole("complementary", { name: "Mis tickets" });
    await waitFor(() => expect(within(lateral).getByText("BFX-0247")).toBeInTheDocument());

    // La invitación a ligar WhatsApp está en el inicio, no repetida en el lateral
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Activa avisos por WhatsApp/ })).toHaveLength(1));
    expect(within(lateral).queryByText(/Activa avisos por WhatsApp/)).toBeNull();

    // La barra de arriba dice quién eres; no hay botón para "ir" a Mis tickets
    expect(screen.getByText("Laura Ortiz")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Mis tickets/ })).toBeNull();

    // Abrir un ticket lo muestra en la columna principal y lo marca en la lista
    fireEvent.click(within(lateral).getByText("BFX-0247").closest("button"));
    await waitFor(() => expect(document.querySelector(".bf-pt-principal .bf-pt-chat")).toBeInTheDocument());
    expect(within(lateral).getByText("BFX-0247").closest("button")).toHaveAttribute("aria-current", "true");

    // Y desde ahí se vuelve a levantar uno sin perder la lista
    fireEvent.click(within(lateral).getByRole("button", { name: /Nuevo ticket/ }));
    expect(await screen.findByRole("heading", { name: /Qué está fallando/ })).toBeInTheDocument();
    expect(within(lateral).getByText("BFX-0247")).toBeInTheDocument();
  });
});
