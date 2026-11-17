import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const TICKET = {
  id: "BFX-0057", numero: "5214771234567", nombre: "Elías V.", estado: "IN_PROGRESS",
  asignado_a: "agente_irving", area: "TI", maquina: null, prioridad: "afecta", categoria: "Software",
  preview: "Favor de crear workflow en SAP",
  fecha: "05/11/2026 10:00", fecha_iso: new Date(Date.now() - 3600000).toISOString(),
  fecha_cierre: null, fecha_cierre_iso: null, fecha_compromiso: null,
  pasos_intentados: null, notas_internas: null, descripcion: "Favor de crear workflow en SAP",
  canal: "whatsapp",
};
const AGENTES = { agente_irving: { nombre: "Irving Coronado", whatsapp: "524731376576", activo: true } };

let posts;
let ticket;

beforeEach(() => {
  posts = [];
  ticket = TICKET;
  localStorage.setItem("bf_token", "tok");
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    if (opts.method === "POST") posts.push({ url: u, body: JSON.parse(opts.body) });
    const json = u.includes("/auth/yo") ? { nombre: "Luis", rol: "admin", es_ti: true }
      : u.includes("/tickets/version") ? { v: "1" }
      : u.includes("/agentes") ? AGENTES
      : u.includes("/eventos") ? { eventos: [] }
      : u.match(/\/tickets\/BFX-/) ? { ...ticket, historial: [], imagenes: [] }
      : u.includes("/tickets") ? { tickets: { [ticket.id]: ticket }, total: 1, page: 1, pages: 1 }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const abrirTicket = async () => {
  render(<App />);
  // El ticket asignado vive en «En progreso», no en el grupo por defecto
  const enProgreso = await screen.findByText("En progreso");
  fireEvent.click(enProgreso.closest("button"));
  await waitFor(() => expect(document.querySelector(".bf-fila")).toBeInTheDocument());
  fireEvent.click(document.querySelector(".bf-fila"));
  await screen.findByRole("button", { name: /Resolver y avisar/ });
};

test("«Resolver y avisar» transiciona a RESOLVED con la nota y el técnico", async () => {
  await abrirTicket();
  fireEvent.change(screen.getByPlaceholderText(/Escribe un mensaje personalizado/),
    { target: { value: "Ya quedó el workflow, pruébalo" } });
  fireEvent.click(screen.getByRole("button", { name: /Resolver y avisar/ }));

  await waitFor(() => expect(posts).toContainEqual({
    url: expect.stringContaining("/tickets/BFX-0057/transicion"),
    body: { estado: "RESOLVED", actor: "Irving Coronado", notas: "Ya quedó el workflow, pruébalo" },
  }));
  // No sale además como mensaje suelto
  expect(posts.some((p) => p.url.includes("/mensaje"))).toBe(false);
});

test("ya no hay respuestas rápidas que digan «resuelto» sin resolver, y los estados van arriba", async () => {
  await abrirTicket();
  expect(screen.queryByText("Caso resuelto")).not.toBeInTheDocument();
  expect(screen.queryByText("¿Ya funcionó?")).not.toBeInTheDocument();

  const barra = document.querySelector(".bf-transitions");
  const meta = document.querySelector(".bf-meta-grid");
  // La barra de estados aparece antes que la ficha del ticket
  expect(barra.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(barra.querySelector(".is-principal").textContent).toBe("Resolver");
});

test("un ticket REABIERTO se puede resolver sin «Retomar» antes", async () => {
  ticket = { ...TICKET, estado: "REOPENED" };
  await abrirTicket();
  const barra = document.querySelector(".bf-transitions");
  expect(barra.querySelector(".is-principal").textContent).toBe("Resolver");
  fireEvent.click(screen.getByRole("button", { name: /Resolver y avisar/ }));
  await waitFor(() => expect(posts).toContainEqual({
    url: expect.stringContaining("/tickets/BFX-0057/transicion"),
    body: expect.objectContaining({ estado: "RESOLVED" }),
  }));
});

test("sin prioridad no se puede resolver: los dos botones quedan deshabilitados", async () => {
  ticket = { ...TICKET, prioridad: null };
  await abrirTicket();
  const barra = document.querySelector(".bf-transitions");
  const resolver = [...barra.querySelectorAll("button")].find((b) => b.textContent === "Resolver");
  expect(resolver).toBeDisabled();
  expect(screen.getByRole("button", { name: /Resolver y avisar/ })).toBeDisabled();
});
