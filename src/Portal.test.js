import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

/* El portal del usuario final: lo que ve un administrativo.
   Lo que se prueba aquí es el contrato que lo separa del dashboard de TI —
   que con rol "usuario" no aparezca la cola de trabajo por ningún lado. */

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
  ticketsActuales = [T_ESPERA, T_RESUELTO];
  creados = [];
  mensajesEnviados = [];
  vinculacionesPedidas = 0;
  global.fetch = mockFetch();
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const portal = () => document.querySelector(".bf-portal");

test("con rol de usuario se pinta el portal, nunca la cola de TI", async () => {
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());

  // Lo que el administrativo SÍ ve
  expect(screen.getByText("¿En qué podemos ayudarte?")).toBeInTheDocument();
  expect(screen.getByText("Mis tickets")).toBeInTheDocument();
  expect(screen.getByText("Laura Ortiz")).toBeInTheDocument();
  expect(screen.getByText("Contabilidad")).toBeInTheDocument();

  // Y lo que NO debe ver por ningún lado: la cola de trabajo de TI
  expect(document.querySelector(".bf-sidebar")).toBeNull();
  expect(document.querySelector(".bf-cola")).toBeNull();
  expect(screen.queryByText("Sin atender")).toBeNull();
  expect(screen.queryByText(/Guías/)).toBeNull();
  expect(screen.queryByText(/Configuración/)).toBeNull();

  // El portal no debe tocar los endpoints de TI. Se descartan las rutas /mi/*,
  // que son las propias del portal y también acaban en "/tickets".
  const deTI = global.fetch.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => !u.includes("/mi/"));
  expect(deTI.some((u) => u.includes("/tickets"))).toBe(false);
  expect(deTI.some((u) => u.includes("/stats"))).toBe(false);
  expect(deTI.some((u) => u.includes("/agentes"))).toBe(false);
  expect(deTI.some((u) => u.includes("/guias"))).toBe(false);
});

test("avisa arriba cuando TI está esperando respuesta del usuario", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-pt-alerta")).toBeInTheDocument());

  const alerta = document.querySelector(".bf-pt-alerta");
  expect(alerta).toBeInTheDocument();
  expect(alerta).toHaveTextContent("TI te preguntó algo");
  expect(within(alerta).getByText("BFX-0247")).toBeInTheDocument();
});

test("la lista dice quién lo atiende y traduce el estado a lenguaje de usuario", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-pt-fila")).toBeInTheDocument());

  const filas = [...document.querySelectorAll(".bf-pt-fila")];
  const espera = filas.find((f) => f.textContent.includes("BFX-0247"));

  // "WAITING_FOR_USER" no se le muestra nunca al usuario
  expect(espera).toHaveTextContent("Te preguntaron");
  expect(espera).not.toHaveTextContent("WAITING_FOR_USER");
  // El nombre del técnico, no su id: es lo que evita el "¿cómo va mi ticket?"
  expect(espera).toHaveTextContent("Carlos Méndez lo está atendiendo");
  expect(espera).not.toHaveTextContent("ag_carlos");

  // Los cerrados se separan de los abiertos
  expect(screen.getByText("Cerrados")).toBeInTheDocument();
  const resuelto = filas.find((f) => f.textContent.includes("BFX-0198"));
  expect(resuelto).toHaveTextContent("Resuelto");
  expect(resuelto).toHaveTextContent("WhatsApp");  // el canal de origen se ve
});

test("un solo campo obligatorio: el botón espera la descripción", async () => {
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());

  const enviar = screen.getByRole("button", { name: "Enviar" });
  expect(enviar).toBeDisabled();

  const texto = document.querySelector(".bf-pt-textarea");
  fireEvent.change(texto, { target: { value: "corto" } });
  expect(enviar).toBeDisabled();

  fireEvent.change(texto, {
    target: { value: "No puedo entrar al correo, dice contrasena incorrecta" },
  });
  expect(enviar).not.toBeDisabled();
});

test("levantar un ticket manda solo lo que se llenó y confirma con el folio", async () => {
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());

  fireEvent.change(document.querySelector(".bf-pt-textarea"), {
    target: { value: "No puedo entrar al correo, dice contrasena incorrecta" },
  });
  fireEvent.click(screen.getByText("🔑 Accesos"));
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0]).toEqual({
    descripcion: "No puedo entrar al correo, dice contrasena incorrecta",
    categoria: "🔑 Accesos",
  });

  // La confirmación da el folio, que es lo que el usuario puede citar
  await waitFor(() => expect(screen.getByText("BFX-0301")).toBeInTheDocument());
  expect(screen.getByText(/ya lo registramos/i)).toBeInTheDocument();
});

test("sin categoría elegida, el campo no viaja y lo deduce el backend", async () => {
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());

  fireEvent.change(document.querySelector(".bf-pt-textarea"), {
    target: { value: "La impresora del piso 2 saca las hojas rayadas" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].categoria).toBeUndefined();
});

test("el detalle muestra la conversación y deja responder a TI", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-pt-fila")).toBeInTheDocument());

  const fila = [...document.querySelectorAll(".bf-pt-fila")]
    .find((f) => f.textContent.includes("BFX-0247"));
  fireEvent.click(fila);
  await waitFor(() => expect(document.querySelector(".bf-pt-chat")).toBeInTheDocument());

  expect(screen.getByText(/El error sale también desde tu celular/)).toBeInTheDocument();
  expect(screen.getByText("Carlos Méndez lo está atendiendo.")).toBeInTheDocument();

  const caja = document.querySelector(".bf-pt-responder .bf-pt-textarea");
  fireEvent.change(caja, { target: { value: "Ya probé desde mi celular y tampoco entra" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar a TI" }));

  await waitFor(() => expect(mensajesEnviados).toEqual([
    "Ya probé desde mi celular y tampoco entra",
  ]));
});

test("un ticket cerrado no se puede responder", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-pt-fila")).toBeInTheDocument());

  fireEvent.click([...document.querySelectorAll(".bf-pt-fila")]
    .find((f) => f.textContent.includes("BFX-0198")));
  await waitFor(() => expect(document.querySelector(".bf-pt-chat")).toBeInTheDocument());

  expect(document.querySelector(".bf-pt-responder")).toBeNull();
  expect(screen.getByText(/ya está cerrado/i)).toBeInTheDocument();
});

test("la vinculación de WhatsApp es un tap con el mensaje ya escrito", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-pt-vinc")).toBeInTheDocument());

  expect(screen.getByText("Levanta tickets desde WhatsApp")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vincular mi WhatsApp" }));

  await waitFor(() => expect(vinculacionesPedidas).toBe(1));
  const link = await screen.findByText("Abrir WhatsApp y enviar");
  expect(link).toHaveAttribute("href", "https://wa.me/524771234567?text=VINCULAR%20K7M2");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByText("VINCULAR K7M2")).toBeInTheDocument();
});

test("con el WhatsApp ya vinculado, la invitación desaparece", async () => {
  perfilActual = { ...PERFIL, whatsapp: "5214771112222", whatsapp_vinculado: true };
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("Mis tickets")).toBeInTheDocument());

  expect(document.querySelector(".bf-pt-vinc")).toBeNull();
});

test("sin tickets, el portal explica para qué sirve en vez de quedarse vacío", async () => {
  ticketsActuales = [];
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());

  await waitFor(() =>
    expect(screen.getByText(/Todavía no has levantado ningún ticket/)).toBeInTheDocument());
  expect(document.querySelector(".bf-pt-alerta")).toBeNull();
});

test("sin área en el perfil, el portal la pide antes de dejar enviar", async () => {
  // Mismo criterio que en WhatsApp: ningún ticket llega a TI sin saber de dónde
  // viene. Quien ya tiene área en su perfil no la vuelve a escribir.
  perfilActual = { ...PERFIL, area: null };
  render(<App />);
  await waitFor(() => expect(portal()).toBeInTheDocument());
  await waitFor(() => expect(screen.getByLabelText("¿De qué área eres?")).toBeInTheDocument());

  const enviar = screen.getByRole("button", { name: "Enviar" });
  fireEvent.change(document.querySelector(".bf-pt-textarea"), {
    target: { value: "No puedo entrar al correo, dice contrasena incorrecta" },
  });
  expect(enviar).toBeDisabled();            // falta el área

  fireEvent.change(screen.getByLabelText("¿De qué área eres?"), {
    target: { value: "Recursos Humanos" },
  });
  expect(enviar).not.toBeDisabled();

  fireEvent.click(enviar);
  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].area).toBe("Recursos Humanos");
});

test("con área en el perfil, no se vuelve a preguntar", async () => {
  render(<App />);   // PERFIL trae area: "Contabilidad"
  await waitFor(() => expect(portal()).toBeInTheDocument());
  expect(screen.queryByLabelText("¿De qué área eres?")).toBeNull();

  fireEvent.change(document.querySelector(".bf-pt-textarea"), {
    target: { value: "La impresora del piso 2 saca hojas rayadas" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(creados.length).toBe(1));
  expect(creados[0].area).toBeUndefined();   // el backend la toma del perfil
});
