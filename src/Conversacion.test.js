import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import App from "./App";

const hace = (min) => new Date(Date.now() - min * 60000).toISOString();

const BASE = {
  id:"BFX-0042", numero:"5214771234567", nombre:"Juan Pérez", estado:"OPEN",
  asignado_a:null, area:"POUCH", maquina:"POUCH 7", prioridad:"normal", categoria:"💻 Hardware",
  preview:"la 7", fecha:"25/08/2026 12:30", fecha_iso:hace(8),
  fecha_cierre:null, fecha_cierre_iso:null,
  pasos_intentados:null, notas_internas:null, descripcion:null, canal:"whatsapp",
};

const HISTORIAL = [
  { role:"user", content:"La selladora no calienta y se despegan las bolsas" },
  { role:"assistant", content:"¿En qué área está el problema?" },
  { role:"user", content:"[Área] POUCH" },
  { role:"user", content:"[Máquina] POUCH 7" },
];

let llamadasDetalle = 0;

beforeEach(() => {
  llamadasDetalle = 0;
  localStorage.setItem("bf_token", "tok");
  localStorage.setItem("bf_nombre", "Luis Espinosa");
  global.fetch = jest.fn((url) => {
    const u = String(url);
    let json;
    if (u.includes("/auth/yo")) json = { email:"luis@bioflex.com", nombre:"Luis Espinosa",
      rol:"admin", area:null, whatsapp:null, es_ti:true };
    else if (u.includes("/tickets/version")) json = { v: "1-2026-08-25T18:00:00" };
    else if (u.includes("/agentes")) json = {};
    else if (u.match(/\/tickets\/BFX-/)) { llamadasDetalle++; json = { ...BASE, historial: HISTORIAL, imagenes: [] }; }    
    else if (u.includes("/tickets")) json = { tickets: { "BFX-0042": BASE }, total: 1, page: 1, pages: 1 };
    else json = {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

test("al abrir un ticket recién creado se ve la conversación", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-fila-id")).toBeInTheDocument());

  await act(async () => { fireEvent.click(document.querySelector(".bf-fila")); });

  await waitFor(() =>
    expect(document.querySelector(".bf-chat")).toBeInTheDocument());

  const chat = document.querySelector(".bf-chat");
  expect(chat.textContent).not.toMatch(/Aún no hay mensajes/);
  expect(chat.textContent).toMatch(/La selladora no calienta/);
  expect(document.querySelectorAll(".bf-bubble").length).toBe(HISTORIAL.length);
});

test("una sincronización mientras el ticket está abierto no borra la conversación", async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector(".bf-fila-id")).toBeInTheDocument());
  await act(async () => { fireEvent.click(document.querySelector(".bf-fila")); });
  await waitFor(() => expect(document.querySelectorAll(".bf-bubble").length).toBe(4));

  // Forzar una sincronización como la que dispara el centinela
  await act(async () => {
    document.querySelector(".bf-sync").click();
    await Promise.resolve();
  });
  await waitFor(() => expect(document.querySelectorAll(".bf-bubble").length).toBe(4));
  expect(document.querySelector(".bf-chat").textContent).not.toMatch(/Aún no hay mensajes/);
});
