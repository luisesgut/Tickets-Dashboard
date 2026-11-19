import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const RESUELTO = {
  id: "BFX-0050", numero: "5214770000009", nombre: "Pedro", estado: "CLOSED", asignado_a: "agente_irving",
  area: "TI", prioridad: "mejora", categoria: "Software", preview: "x", fecha: "01/11/2026 10:00",
  fecha_iso: "2026-11-01T16:00:00Z", fecha_cierre: "02/11/2026 10:00", fecha_cierre_iso: "2026-11-02T16:00:00Z",
  fecha_compromiso: null, descripcion: "x", canal: "whatsapp",
};
const CONV = {
  numero: "5214771262872", nombre: "Anna Eliza Zaragoza Asomoza", area: "Diseño", con_cuenta: true,
  mensajes: [
    { role: "user", content: "[El usuario envió una foto]", fecha: "19/11/2026 10:25", fecha_iso: "2026-11-19T16:25:00Z" },
    { role: "assistant", content: "Hola 👋 No tengo registrado este número.", fecha: "19/11/2026 10:25", fecha_iso: "2026-11-19T16:25:00Z" },
    { role: "user", content: "Bueno me avisan si me pueden apoyar o no", fecha: "19/11/2026 10:26", fecha_iso: "2026-11-19T16:26:00Z" },
  ],
  fotos: [],
  primero_iso: "2026-11-19T16:25:00Z", ultimo_iso: "2026-11-19T16:26:00Z",
  descripcion_sugerida: "(No describió el problema)",
};

let posts, conversaciones;

beforeEach(() => {
  posts = [];
  conversaciones = [CONV];
  localStorage.setItem("bf_token", "tok");
  localStorage.setItem("bf_nombre", "Luis");
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    if (opts.method === "POST") posts.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    const json = u.includes("/auth/yo") ? { nombre: "Luis", rol: "admin", es_ti: true }
      : u.includes("/sin-ticket/") && u.endsWith("/ticket") ? { ok: true, ticket: { id: "BFX-0117" } }
      : u.includes("/sin-ticket/") && u.endsWith("/mensaje") ? { ok: true }
      : u.includes("/sin-ticket/") ? { ok: true }
      : u.includes("/sin-ticket") ? { conversaciones, total: conversaciones.length }
      : u.includes("/tickets/version") ? { v: "1" }
      : u.includes("/agentes") ? {}
      : u.includes("/tickets") ? { tickets: { [RESUELTO.id]: RESUELTO }, total: 1, page: 1, pages: 1 }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const botonSinTicket = async () => (await screen.findByText("Sin ticket", { selector: ".bf-cola-label" })).closest("button");

test("«Sin ticket» en la barra lateral, con su conteo, y muestra la conversación", async () => {
  render(<App />);
  const boton = await botonSinTicket();
  await waitFor(() => expect(boton.querySelector(".bf-cola-count").textContent).toBe("1"));
  fireEvent.click(boton);
  expect(await screen.findByText("Anna Eliza Zaragoza Asomoza")).toBeInTheDocument();
  expect(screen.getByText("Bueno me avisan si me pueden apoyar o no")).toBeInTheDocument();
});

test("sin descripción no deja crear; con descripción crea el ticket con el actor", async () => {
  render(<App />);
  fireEvent.click(await botonSinTicket());
  const crear = await screen.findByRole("button", { name: /Crear ticket/ });
  expect(crear).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descripción del ticket"), { target: { value: "No abre Packz" } });
  expect(crear).not.toBeDisabled();
  fireEvent.click(crear);
  await waitFor(() => expect(posts).toContainEqual({
    url: expect.stringContaining("/sin-ticket/5214771262872/ticket"),
    body: { descripcion: "No abre Packz", area: "Diseño", actor: "Luis" },
  }));
});

test("descartar pide confirmación y llama al backend", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  render(<App />);
  fireEvent.click(await botonSinTicket());
  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(posts.some((p) => p.url.includes("/sin-ticket/5214771262872/descartar"))).toBe(true));
});

test("el conteo de «Resueltos» es el mismo que la lista, no solo los de hoy", async () => {
  render(<App />);
  const resueltos = (await screen.findByText("Resueltos", { selector: ".bf-cola-label" })).closest("button");
  await waitFor(() => expect(resueltos.querySelector(".bf-cola-count").textContent).toBe("1"));
});

test("se le puede preguntar ahí mismo; los mensajes de TI se ven con su nombre", async () => {
  conversaciones = [{ ...CONV, ti_conversa: true, mensajes: [...CONV.mensajes,
    { role: "assistant", content: "[Irving] ¿Qué programa es?", fecha: "19/11/2026 10:40", fecha_iso: "2026-11-19T16:40:00Z" },
    { role: "user", content: "Es Packz, pide licencia", fecha: "19/11/2026 10:41", fecha_iso: "2026-11-19T16:41:00Z" },
  ] }];
  render(<App />);
  fireEvent.click(await botonSinTicket());
  expect(await screen.findByText("¿Qué programa es?")).toBeInTheDocument();
  expect(screen.getByText(/Irving · TI/)).toBeInTheDocument();
  expect(screen.getByText("Respondió")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Preguntarle por WhatsApp"), { target: { value: "¿Desde cuándo?" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));
  await waitFor(() => expect(posts).toContainEqual({
    url: expect.stringContaining("/sin-ticket/5214771262872/mensaje"),
    body: { texto: "¿Desde cuándo?", actor: "Luis" },
  }));
});
