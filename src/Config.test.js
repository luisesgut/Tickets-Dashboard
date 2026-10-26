import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

// Avisos por canal: cada agente prende y apaga el correo y el WhatsApp por separado.
const AGENTES = {
  agente_ulises: { nombre:"Ulises Granados", whatsapp:"524777013566", email:"ugranados@bioflex.mx",
    avisos_correo:true, avisos_whatsapp:true, notificar:true, activo:true },
  agente_irving: { nombre:"Irving Coronado", whatsapp:"524731376576", email:null,
    avisos_correo:true, avisos_whatsapp:false, notificar:true, activo:true },
  agente_elias:  { nombre:"Elias Velazquez", whatsapp:"524775774189", email:"evelazquez@bioflex.mx",
    avisos_correo:false, avisos_whatsapp:false, notificar:false, activo:true },
};

const YO_TI = { email:"luis@bioflex.com", nombre:"Luis Espinosa", rol:"admin",
  area:null, whatsapp:null, es_ti:true };

let patches;
beforeEach(() => {
  patches = [];
  localStorage.setItem("bf_token", "tok");
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    if (opts.method === "PATCH") patches.push({ url: u, body: JSON.parse(opts.body) });
    const json = u.includes("/auth/yo")         ? YO_TI
      : u.includes("/tickets/version")          ? { v: "1" }
      : opts.method === "PATCH"                 ? { ok: true }
      : u.includes("/agentes")                  ? AGENTES
      : u.includes("/usuarios")                 ? { usuarios: [], whitelist_activa: false }
      : u.includes("/tickets")                  ? { tickets: {}, total: 0, page: 1, pages: 1 }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const filaDe = (nombre) =>
  [...document.querySelectorAll(".bf-cfg-row")].find((r) => r.textContent.includes(nombre));

const abrirConfig = async () => {
  render(<App />);
  fireEvent.click(await screen.findByText("Configuración"));
  await waitFor(() => expect(filaDe("Ulises Granados")).toBeTruthy());
};

test("la lista dice qué canal le llega a cada agente", async () => {
  await abrirConfig();
  const pills = (n) => [...filaDe(n).querySelectorAll(".bf-cfg-pill")].map((p) => p.textContent);
  expect(pills("Ulises Granados")).toEqual(["correo", "WhatsApp"]);
  // Correo prendido pero sin dirección: se avisa, porque en la práctica no le llega
  expect(pills("Irving Coronado")).toEqual(["correo: falta el correo"]);
  expect(pills("Elias Velazquez")).toEqual(["sin avisos"]);
});

test("apagar solo el WhatsApp manda los dos canales por separado", async () => {
  await abrirConfig();
  fireEvent.click(within(filaDe("Ulises Granados")).getByTitle("Editar agente"));

  const whatsapp = within(document.querySelector(".bf-cfg-toggles")).getByLabelText("Avisos por WhatsApp");
  expect(within(document.querySelector(".bf-cfg-toggles")).getByLabelText("Avisos por correo")).toBeChecked();
  expect(whatsapp).toBeChecked();
  fireEvent.click(whatsapp);
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(patches.length).toBe(1));
  expect(patches[0].url).toMatch(/\/agentes\/agente_ulises$/);
  expect(patches[0].body).toMatchObject({ avisos_correo: true, avisos_whatsapp: false });
  expect(patches[0].body).not.toHaveProperty("notificar");
});
