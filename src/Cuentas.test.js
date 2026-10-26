import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

/* Cuentas: solo un admin la ve. Desactivar en vez de borrar, áreas de un
   catálogo, y el WhatsApp se puede escribir o quitar. El backend valida; aquí
   se prueba que el front mande lo que debe y muestre lo que el backend dice. */

const YO_ADMIN = { usuario: "aadmin", email: "ana@bioflex.mx", nombre: "Ana Admin", rol: "admin",
  area: null, whatsapp: null, es_ti: true };

const PERSONAS = [
  { id: 1, usuario: "aadmin", nombre: "Ana Admin", email: "ana@bioflex.mx", rol: "admin",
    area: null, whatsapp: null, activo: true },
  { id: 2, usuario: "lortiz", nombre: "Laura Ortiz", email: "laura@bioflex.mx", rol: "usuario",
    area: "Contabilidad", whatsapp: "5214771112222", activo: true },
  { id: 3, usuario: "prami", nombre: "Pedro Ramírez", email: null, rol: "usuario",
    area: "Contabilidad", whatsapp: null, activo: true },
  { id: 4, usuario: "rviejo", nombre: "Rosa Vieja", email: null, rol: "usuario",
    area: "RH", whatsapp: null, activo: false },
];
const AREAS = [
  { id: 10, nombre: "Contabilidad", activo: true },
  { id: 11, nombre: "RH", activo: true },
  { id: 12, nombre: "Ventas", activo: false },
];

let yo, peticiones, respuestaPatch;

beforeEach(() => {
  yo = YO_ADMIN;
  peticiones = [];
  respuestaPatch = { ok: true, json: {} };
  localStorage.setItem("bf_token", "tok");
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || "GET";
    if (metodo !== "GET") peticiones.push({ u, metodo, body: JSON.parse(opts.body || "null") });
    let ok = true, json = {};
    if (u.includes("/auth/yo")) json = yo;
    else if (u.includes("/tickets/version")) json = { v: "1" };
    else if (u.includes("/personas") && metodo === "GET") json = { personas: PERSONAS };
    else if (u.includes("/personas") && metodo === "PATCH") ({ ok, json } = respuestaPatch);
    else if (u.includes("/personas") && metodo === "POST") json = { id: 9 };
    else if (u.includes("/areas-cuenta") && metodo === "GET") json = { areas: AREAS };
    else if (u.includes("/areas-cuenta")) json = { id: 13 };
    else if (u.includes("/agentes")) json = {};
    else if (u.includes("/tickets")) json = { tickets: {}, total: 0, page: 1, pages: 1 };
    return Promise.resolve({ ok, status: ok ? 200 : 409, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const fila = (nombre) =>
  [...document.querySelectorAll(".bf-cta .bf-cfg-row")].find((r) => r.textContent.includes(nombre));

const filaArea = (nombre) =>
  [...document.querySelectorAll(".bf-cta .bf-cfg-row")]
    .find((r) => r.querySelector(".bf-cfg-nombre")?.textContent === nombre);

const abrirCuentas = async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Cuentas" }));
  await waitFor(() => expect(fila("Laura Ortiz")).toBeTruthy());
};

test("solo un admin ve la sección de Cuentas", async () => {
  yo = { ...YO_ADMIN, rol: "tecnico" };
  render(<App />);
  await screen.findByRole("button", { name: /Configuración/ });
  expect(screen.queryByRole("button", { name: "Cuentas" })).toBeNull();
});

test("lista las cuentas activas; las desactivadas se ven con el filtro", async () => {
  await abrirCuentas();
  expect(fila("Pedro Ramírez")).toHaveTextContent("sin correo");
  expect(fila("Laura Ortiz")).toHaveTextContent("WhatsApp");
  expect(fila("Rosa Vieja")).toBeUndefined();

  fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "desactivadas" } });
  expect(fila("Rosa Vieja")).toHaveTextContent("desactivada");
  expect(fila("Laura Ortiz")).toBeUndefined();
});

test("el buscador encuentra por área, usuario o número", async () => {
  await abrirCuentas();
  const buscar = screen.getByLabelText("Buscar cuenta");
  fireEvent.change(buscar, { target: { value: "contab" } });
  expect(fila("Laura Ortiz")).toBeTruthy();
  expect(fila("Ana Admin")).toBeUndefined();
  fireEvent.change(buscar, { target: { value: "1112222" } });
  expect(fila("Laura Ortiz")).toBeTruthy();
  expect(fila("Pedro Ramírez")).toBeUndefined();
});

test("editar: área del catálogo, quitar el WhatsApp y desactivar van en un PATCH", async () => {
  await abrirCuentas();
  fireEvent.click(screen.getByRole("button", { name: "Editar Laura Ortiz" }));

  // Las áreas desactivadas del catálogo no se ofrecen
  const area = screen.getByLabelText("Área");
  expect(within(area).queryByText("Ventas")).toBeNull();
  fireEvent.change(area, { target: { value: "RH" } });
  fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
  fireEvent.click(screen.getByLabelText("Cuenta activa"));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(peticiones.length).toBe(1));
  expect(peticiones[0].u).toMatch(/\/personas\/2$/);
  expect(peticiones[0].body).toMatchObject({ area: "RH", whatsapp: "", activo: false });
});

test("el error del backend se muestra (WhatsApp de otra cuenta)", async () => {
  respuestaPatch = { ok: false, json: { detail: "Ese número ya es de Laura Ortiz (lortiz). Quítaselo primero." } };
  await abrirCuentas();
  fireEvent.click(screen.getByRole("button", { name: "Editar Pedro Ramírez" }));
  fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "4771112222" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText(/Ese número ya es de Laura Ortiz/)).toBeInTheDocument();
});

test("un admin no puede desactivarse a sí mismo", async () => {
  await abrirCuentas();
  fireEvent.click(screen.getByRole("button", { name: "Editar Ana Admin" }));
  expect(screen.getByLabelText("Cuenta activa")).toBeDisabled();
});

test("alta de cuenta con contraseña inicial", async () => {
  await abrirCuentas();
  fireEvent.click(screen.getByRole("button", { name: "Nueva cuenta" }));
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "jnuevo" } });
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Juan Nuevo" } });
  fireEvent.change(screen.getByLabelText("Área"), { target: { value: "Contabilidad" } });
  fireEvent.change(screen.getByLabelText("Contraseña inicial"), { target: { value: "inicial123" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

  await waitFor(() => expect(peticiones.length).toBe(1));
  expect(peticiones[0]).toMatchObject({ metodo: "POST" });
  expect(peticiones[0].body).toMatchObject({
    usuario: "jnuevo", nombre: "Juan Nuevo", area: "Contabilidad", rol: "usuario", password: "inicial123",
  });
});

test("áreas: cuenta las cuentas activas, se crean y se renombran", async () => {
  await abrirCuentas();
  expect(filaArea("Contabilidad")).toHaveTextContent("2 cuentas");   // Rosa (RH) está desactivada
  expect(filaArea("RH")).toHaveTextContent("0 cuentas");

  fireEvent.click(screen.getByRole("button", { name: "Nueva área" }));
  fireEvent.change(screen.getByLabelText("Nombre del área nueva"), { target: { value: "Compras" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear área" }));
  await waitFor(() => expect(peticiones[0]).toMatchObject({ metodo: "POST", body: { nombre: "Compras" } }));

  fireEvent.click(screen.getByRole("button", { name: "Renombrar RH" }));
  fireEvent.change(screen.getByLabelText("Nuevo nombre de RH"), { target: { value: "Recursos Humanos" } });
  fireEvent.click(screen.getByRole("button", { name: "Renombrar" }));
  await waitFor(() => expect(peticiones[1]).toMatchObject({
    metodo: "PATCH", body: { nombre: "Recursos Humanos" },
  }));
  expect(peticiones[1].u).toMatch(/\/areas-cuenta\/11$/);
});
