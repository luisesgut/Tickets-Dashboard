import { render, screen, within, waitFor } from "@testing-library/react";
import App from "./App";

const hace = (min) => new Date(Date.now() - min * 60000).toISOString();

const TICKETS = {
  "BFX-0042": { id:"BFX-0042", numero:"5214771234567", nombre:"Juan Pérez", estado:"OPEN",
    asignado_a:null, area:"POUCH", maquina:"POUCH 7", prioridad:"normal", categoria:"💻 Hardware",
    preview:"La selladora no calienta y se despegan las bolsas",
    fecha:"25/08/2026 17:52", fecha_iso:hace(8), fecha_cierre:null, fecha_cierre_iso:null,
    pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp" },
  "BFX-0035": { id:"BFX-0035", numero:"5214779982211", nombre:"María S.", estado:"OPEN",
    asignado_a:null, area:"BOLSEO", maquina:"BOLSEO 4", prioridad:"alta", categoria:"📋 General",
    preview:"La bolsa sale chueca y con arrugas",
    fecha:"25/08/2026 11:00", fecha_iso:hace(420), fecha_cierre:null, fecha_cierre_iso:null,
    pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp" },
  "BFX-0041": { id:"BFX-0041", numero:"5214731376576", nombre:"Ana L.", estado:"IN_PROGRESS",
    asignado_a:"agente_irving", area:"BOLSEO", maquina:"BOLSEO 18", prioridad:"normal", categoria:"🌐 Red",
    preview:"La terminal no enciende, marca error de conexión",
    fecha:"25/08/2026 17:00", fecha_iso:hace(60), fecha_cierre:null, fecha_cierre_iso:null,
    pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp" },
  "BFX-0040": { id:"BFX-0040", numero:"5214775774189", nombre:"Pedro R.", estado:"WAITING_FOR_USER",
    asignado_a:"agente_ulises", area:"REFILADO", maquina:"REFILADO 3", prioridad:"normal", categoria:"🖨️ Impresora",
    preview:"Bot: ¿Ya probaste reiniciar el escáner?",
    fecha:"25/08/2026 16:00", fecha_iso:hace(120), fecha_cierre:null, fecha_cierre_iso:null,
    pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp" },
  "BFX-0030": { id:"BFX-0030", numero:"5214777349702", nombre:"Sofía G.", estado:"RESOLVED",
    asignado_a:"agente_luis", area:"POUCH", maquina:"POUCH 1", prioridad:"normal", categoria:"⚙️ Software",
    preview:"Ya quedó, gracias",
    fecha:"25/08/2026 09:00", fecha_iso:hace(600), fecha_cierre:"25/08/2026 12:00", fecha_cierre_iso:hace(300),
    pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp" },
};

const AGENTES = {
  agente_ulises: { nombre:"Ulises Granados", whatsapp:"524777013566", notificar:true, activo:true },
  agente_irving: { nombre:"Irving Coronado", whatsapp:"524731376576", notificar:true, activo:true },
  agente_luis:   { nombre:"Luis Espinosa",   whatsapp:"524777349702", notificar:true, activo:true },
};

beforeEach(() => {
  localStorage.setItem("bf_token", "tok");
  localStorage.setItem("bf_nombre", "Luis Espinosa");
  global.fetch = jest.fn((url) => {
    const u = String(url);
    const json = u.includes("/tickets/version") ? { v: "5-2026-08-25T18:00:00" }
      : u.includes("/agentes")                  ? AGENTES
      : u.match(/\/tickets\/BFX-/)              ? { ...Object.values(TICKETS)[0], historial: [], imagenes: [] }
      : u.includes("/tickets")                  ? { tickets: TICKETS, total: 5, page: 1, pages: 1 }
      : u.includes("/stats")                    ? { total: 5, abiertos: 4, cerrados: 1 }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const lateral = () => document.querySelector(".bf-sidebar");
const grupo = (label) => {
  const el = [...document.querySelectorAll(".bf-grupo")]
    .find(g => within(g).queryByText(label));
  return el;
};

test("la barra lateral filtra por cola, área y muestra la carga del equipo", async () => {
  render(<App />);
  // Esperar a que los tickets lleguen, no solo a que el armazón exista
  await waitFor(() => expect(document.querySelector(".bf-fila-id")).toBeInTheDocument());
  const lado = lateral();

  // Cada grupo con su conteo
  const cola = lado.querySelector(".bf-cola");
  const filas = [...cola.querySelectorAll(".bf-cola-item")].map(b => [
    b.querySelector(".bf-cola-label").textContent,
    b.querySelector(".bf-cola-count").textContent,
  ]);
  expect(filas).toEqual([
    ["Sin atender", "2"], ["En progreso", "1"],
    ["Esperando al usuario", "1"], ["Resueltos", "1"],
  ]);

  // "Sin atender" arranca enfocado y marcado como urgente
  expect(cola.querySelector(".bf-cola-item.is-active.is-urgente")).toBeInTheDocument();

  // Áreas contadas solo sobre tickets activos (POUCH 1, BOLSEO 2, REFILADO 1)
  const chips = [...lado.querySelectorAll(".bf-area-chip")].map(c => c.textContent.replace(/\s+/g, " ").trim());
  expect(chips).toEqual(["BOLSEO 2", "POUCH 1", "REFILADO 1"]);

  // Carga real por agente; Luis no tiene activos → "libre"
  const cargas = [...lado.querySelectorAll(".bf-carga")].map(c => c.textContent.replace(/\s+/g, " ").trim());
  expect(cargas).toEqual(["UGUlises1", "ICIrving1", "LELuislibre"]);
});

test("la cola agrupa por urgencia y ordena lo más viejo primero", async () => {
  render(<App />);
  await waitFor(() => expect(grupo("Sin atender")).toBeTruthy());

  // El grupo enfocado usa filas expandidas y el más viejo va arriba
  const sin = grupo("Sin atender");
  const ids = [...sin.querySelectorAll(".bf-fila-id")].map(e => e.textContent);
  expect(ids).toEqual(["BFX-0035", "BFX-0042"]);           // 7 h antes que 8 min
  expect(within(sin).getByText("7 h")).toBeInTheDocument();
  expect(within(sin).getByText("8 min")).toBeInTheDocument();

  // Los grupos no enfocados se comprimen a una línea
  const prog = grupo("En progreso");
  expect(prog.querySelectorAll(".bf-fila").length).toBe(0);
  expect(prog.querySelectorAll(".bf-fila-min").length).toBe(1);
  expect(within(prog).getByText("BFX-0041")).toBeInTheDocument();
});

test("un ticket sin dueño ofrece tomarlo sin abrir el detalle", async () => {
  render(<App />);
  await waitFor(() => expect(grupo("Sin atender")).toBeTruthy());
  const sin = grupo("Sin atender");

  // "Tomar yo" aparece porque el nombre de sesión coincide con un agente
  const tomar = within(sin).getAllByText("Tomar yo");
  expect(tomar).toHaveLength(2);

  // Y el selector de asignación lista a los tres agentes
  const select = sin.querySelector(".bf-accion-select select");
  expect([...select.options].map(o => o.textContent))
    .toEqual(["Asignar a…", "Ulises Granados", "Irving Coronado", "Luis Espinosa"]);
});

test("el encabezado avisa cuánto lleva esperando el más viejo", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-fila-id")).toBeInTheDocument());
  expect(screen.getByText("Sin atender", { selector: ".bf-title" })).toBeInTheDocument();
  const sub = document.querySelector(".bf-subtitle");
  expect(sub.textContent).toMatch(/2 tickets esperan a que alguien los tome/);
  expect(sub.textContent).toMatch(/el más viejo lleva\s*7 h/);
});

test("sin nombre de agente en sesión, no se ofrece 'Tomar yo'", async () => {
  localStorage.setItem("bf_nombre", "Alguien Externo");
  render(<App />);
  await waitFor(() => expect(grupo("Sin atender")).toBeTruthy());
  expect(within(grupo("Sin atender")).queryByText("Tomar yo")).toBeNull();
  // pero el selector de asignación sigue disponible
  expect(grupo("Sin atender").querySelector(".bf-accion-select select")).toBeTruthy();
});
