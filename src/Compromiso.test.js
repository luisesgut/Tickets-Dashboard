import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const hace = (min) => new Date(Date.now() - min * 60000).toISOString();

const TICKET = {
  id: "BFX-0042", numero: "5214771234567", nombre: "Juan Pérez", estado: "OPEN",
  asignado_a: null, area: "Contabilidad", maquina: null, prioridad: "mejora", categoria: "Software",
  preview: "Favor de enviar consulta de productos",
  fecha: "05/11/2026 10:00", fecha_iso: hace(30), fecha_cierre: null, fecha_cierre_iso: null,
  pasos_intentados: null, notas_internas: null, descripcion: null, canal: "whatsapp",
  fecha_compromiso: "2020-01-15",   // ya pasó: debe verse vencida
};

let patches;

beforeEach(() => {
  patches = [];
  localStorage.setItem("bf_token", "tok");
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    if (opts.method === "PATCH") patches.push(JSON.parse(opts.body));
    const json = u.includes("/auth/yo") ? { nombre: "Luis", rol: "admin", es_ti: true }
      : u.includes("/tickets/version") ? { v: "1" }
      : u.includes("/agentes") ? {}
      : u.match(/\/tickets\/BFX-/) ? { ...TICKET, historial: [], imagenes: [] }
      : u.includes("/tickets") ? { tickets: { [TICKET.id]: TICKET }, total: 1, page: 1, pages: 1 }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

test("la fecha compromiso vencida se marca en la cola y se edita en el detalle", async () => {
  render(<App />);
  const chip = await waitFor(() => {
    const el = document.querySelector(".bf-compromiso");
    expect(el).toBeInTheDocument();
    return el;
  });
  expect(chip).toHaveClass("is-vencida");
  expect(chip.textContent).toMatch(/Vencida/);

  fireEvent.click(document.querySelector(".bf-fila"));
  const input = await screen.findByLabelText("Fecha compromiso");
  expect(input.value).toBe("2020-01-15");
  expect(input).toHaveClass("is-vencida");

  fireEvent.change(input, { target: { value: "2099-12-31" } });
  await waitFor(() => expect(patches).toContainEqual({ fecha_compromiso: "2099-12-31" }));

  fireEvent.click(screen.getByLabelText("Quitar fecha compromiso"));
  await waitFor(() => expect(patches).toContainEqual({ fecha_compromiso: null }));
});
