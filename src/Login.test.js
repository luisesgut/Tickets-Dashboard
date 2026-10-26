import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

/* Login con el usuario de la mesa de ayuda anterior, y el cambio obligatorio
   de la contraseña que venía de ese sistema (estaba en texto plano). */

const SESION = {
  token: "tk", nombre: "Laura Ortiz", rol: "usuario", usuario: "lortiz",
  email: "laura@bioflex.mx", area: "Contabilidad", whatsapp: null,
};

let peticiones, cambioResponde;

beforeEach(() => {
  localStorage.clear();
  peticiones = [];
  cambioResponde = { ok: true, json: { ok: true } };
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    peticiones.push({ u, metodo: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    let ok = true, json = {};
    if (u.endsWith("/auth/login")) json = { ...SESION, debe_cambiar_password: !!global.__debeCambiar };
    else if (u.endsWith("/mi/password")) ({ ok, json } = cambioResponde);
    else if (u.includes("/mi/perfil")) json = { ...SESION, whatsapp_vinculado: false, categorias: [], bot_configurado: true };
    else if (u.includes("/mi/tickets")) json = { tickets: [], total: 0 };
    return Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(json) });
  });
});

afterEach(() => { delete global.__debeCambiar; });

const entrar = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "LOrtiz " } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "vieja" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
};

test("se entra con usuario y contraseña, no con correo", async () => {
  entrar();
  await waitFor(() => expect(peticiones.some((p) => p.u.endsWith("/auth/login"))).toBe(true));
  const login = peticiones.find((p) => p.u.endsWith("/auth/login"));
  expect(login.body).toEqual({ usuario: "lortiz", password: "vieja" });
  expect(screen.queryByPlaceholderText(/correo/i)).toBeNull();
});

test("al salir, el formulario queda vacío para el siguiente", async () => {
  entrar();
  // "Salir" vive en Mis tickets
  fireEvent.click(await screen.findByRole("button", { name: /Mis tickets/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Salir" }));
  expect(await screen.findByLabelText("Usuario")).toHaveValue("");
  expect(screen.getByLabelText("Contraseña")).toHaveValue("");
});

test("con la contraseña del sistema anterior, pide cambiarla antes de entrar", async () => {
  global.__debeCambiar = true;
  entrar();
  expect(await screen.findByText(/cambia la contraseña que usabas/i)).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Contraseña actual"), { target: { value: "vieja" } });
  fireEvent.change(screen.getByPlaceholderText(/Nueva contraseña/), { target: { value: "NuevaClave1" } });
  fireEvent.change(screen.getByPlaceholderText(/Repite/), { target: { value: "NuevaClave1" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar y continuar/ }));

  await waitFor(() => expect(screen.queryByText(/cambia la contraseña que usabas/i)).toBeNull());
  expect(peticiones.find((p) => p.u.endsWith("/mi/password")).body)
    .toEqual({ actual: "vieja", nueva: "NuevaClave1" });
});

test("si las nuevas no coinciden, no llama al servidor", async () => {
  global.__debeCambiar = true;
  entrar();
  await screen.findByText(/cambia la contraseña que usabas/i);
  fireEvent.change(screen.getByPlaceholderText("Contraseña actual"), { target: { value: "vieja" } });
  fireEvent.change(screen.getByPlaceholderText(/Nueva contraseña/), { target: { value: "NuevaClave1" } });
  fireEvent.change(screen.getByPlaceholderText(/Repite/), { target: { value: "OtraClave1" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar y continuar/ }));

  expect(await screen.findByText(/no coinciden/)).toBeInTheDocument();
  expect(peticiones.some((p) => p.u.endsWith("/mi/password"))).toBe(false);
});

test("muestra el error del servidor si la contraseña actual es incorrecta", async () => {
  global.__debeCambiar = true;
  cambioResponde = { ok: false, json: { detail: "La contraseña actual no es correcta" } };
  entrar();
  await screen.findByText(/cambia la contraseña que usabas/i);
  fireEvent.change(screen.getByPlaceholderText("Contraseña actual"), { target: { value: "mal" } });
  fireEvent.change(screen.getByPlaceholderText(/Nueva contraseña/), { target: { value: "NuevaClave1" } });
  fireEvent.change(screen.getByPlaceholderText(/Repite/), { target: { value: "NuevaClave1" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar y continuar/ }));

  expect(await screen.findByText("La contraseña actual no es correcta")).toBeInTheDocument();
});

test("las cuentas vienen de la mesa anterior: no hay alta, se pide a TI", () => {
  render(<App />);
  expect(screen.getByText(/mismo usuario y contraseña/)).toBeInTheDocument();
  expect(screen.queryByText(/Crear cuenta/i)).toBeNull();
  expect(screen.getByText("Contáctanos")).toBeInTheDocument();
});

test("el ojo deja ver la contraseña antes de entrar", () => {
  render(<App />);
  const pass = screen.getByLabelText("Contraseña");
  expect(pass).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
  expect(pass).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
  expect(pass).toHaveAttribute("type", "password");
});
