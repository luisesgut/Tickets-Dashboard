import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

/* Uso: solo un admin la ve. Se prueba que pinte lo que manda /uso, que el
   periodo vuelva a pedir los datos y que la actividad del bot distinga a
   quien ya ligó su WhatsApp de quien no. */

const YO_ADMIN = { usuario: "aadmin", email: "ana@bioflex.mx", nombre: "Ana Admin", rol: "admin",
  area: null, whatsapp: null, es_ti: true };

const dias = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(2026, 9, 26 - (n - 1 - i));
  return {
    dia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    tickets_whatsapp: 0, tickets_web: 0, numeros_bot: 0, mensajes_bot: 0, ligaron: 0,
  };
});

const usoDe = (n) => {
  const por_dia = dias(n);
  Object.assign(por_dia[n - 1], { tickets_whatsapp: 3, tickets_web: 1, numeros_bot: 4, mensajes_bot: 9, ligaron: 2 });
  return {
    dias: n,
    cuentas: { usuarios: 40, con_whatsapp: 10, entraron_alguna_vez: 22, entraron_en_periodo: 18 },
    por_area: [
      { area: "Contabilidad", cuentas: 8, con_whatsapp: 4, entraron: 6 },
      { area: "RH", cuentas: 5, con_whatsapp: 0, entraron: 1 },
    ],
    bot: { numeros: 4, sin_cuenta: 1, mensajes: 9 },
    tickets: { whatsapp: 3, web: 1 },
    por_dia,
    escritores: [
      { numero: "5214771112222", nombre: "Laura Ortiz", area: "Contabilidad", ligado: true, ti: false, mensajes: 5, ultimo: "26/10/2026 11:02" },
      { numero: "5214779990000", nombre: null, area: null, ligado: false, ti: false, mensajes: 1, ultimo: "26/10/2026 10:40" },
      { numero: "5214731376576", nombre: "Irving", area: null, ligado: false, ti: true, mensajes: 3, ultimo: "26/10/2026 09:15" },
    ],
    ligaron: [{ nombre: "Laura Ortiz", usuario: "lortiz", area: "Contabilidad", fecha: "26/10/2026 10:01" }],
    accesos: [],
    pendientes: [{ nombre: "Rosa H", usuario: "rhdz", area: "RH", pedido: "26/10/2026 09:00", vencido: true }],
  };
};

let yo, pedidos;
beforeEach(() => {
  yo = YO_ADMIN;
  pedidos = [];
  localStorage.setItem("bf_token", "tok");
  global.fetch = jest.fn((url) => {
    const u = String(url);
    let json = {};
    if (u.includes("/auth/yo")) json = yo;
    else if (u.includes("/uso")) {
      const n = Number(new URL(u).searchParams.get("dias"));
      pedidos.push(n);
      json = usoDe(n);
    }
    else if (u.includes("/tickets/version")) json = { v: "1" };
    else if (u.includes("/agentes")) json = {};
    else if (u.includes("/tickets")) json = { tickets: {}, total: 0, page: 1, pages: 1 };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  });
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

const abrirUso = async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Uso" }));
  await screen.findByText("WhatsApp ligado");
};
const kpi = (titulo) => screen.getByText(titulo).closest(".bf-uso-kpi");

test("solo un admin ve la sección de Uso", async () => {
  yo = { ...YO_ADMIN, rol: "tecnico" };
  render(<App />);
  await screen.findByRole("button", { name: /Configuración/ });
  expect(screen.queryByRole("button", { name: "Uso" })).toBeNull();
});

test("los números grandes resumen la adopción del periodo", async () => {
  await abrirUso();
  expect(pedidos).toEqual([30]);
  expect(kpi("WhatsApp ligado")).toHaveTextContent("10 de 40");
  expect(kpi("WhatsApp ligado")).toHaveTextContent("25% de las cuentas de usuario");
  expect(kpi("Entraron al portal")).toHaveTextContent("18");
  expect(kpi("Le escribieron al bot")).toHaveTextContent("1 sin cuenta ligada · 9 mensajes");
  expect(kpi("Tickets")).toHaveTextContent("3 por WhatsApp · 1 por portal");
});

test("cambiar el periodo vuelve a pedir los datos", async () => {
  await abrirUso();
  fireEvent.click(screen.getByRole("tab", { name: "7 días" }));
  await waitFor(() => expect(pedidos).toEqual([30, 7]));
  expect(await screen.findByText(/en 7 días/)).toBeInTheDocument();
});

test("quién le escribe al bot distingue ligado, sin ligar y TI", async () => {
  await abrirUso();
  const panel = screen.getByText("Quién le escribe al bot").closest(".bf-uso-panel");
  const fila = (texto) => within(panel).getByText(texto).closest("tr");
  expect(fila("Laura Ortiz")).toHaveTextContent("Ligado");
  expect(fila("+5214779990000")).toHaveTextContent("Sin cuenta");
  expect(fila("+5214779990000")).toHaveTextContent("Sin ligar");
  expect(fila("Irving")).toHaveTextContent("TI");
});

test("la gráfica de tickets tiene leyenda y detalle por día", async () => {
  await abrirUso();
  const graf = screen.getByText("Tickets por día").closest("figure");
  const leyenda = graf.querySelector(".bf-uso-leyenda");
  expect(within(leyenda).getByText("WhatsApp")).toBeInTheDocument();
  expect(within(leyenda).getByText("Portal")).toBeInTheDocument();

  const columnas = graf.querySelectorAll(".bf-uso-col");
  expect(columnas).toHaveLength(30);
  fireEvent.mouseEnter(columnas[29]);
  const tip = graf.querySelector(".bf-uso-tip");
  expect(tip).toHaveTextContent("WhatsApp: 3");
  expect(tip).toHaveTextContent("Portal: 1");
});

test("adopción por área y los que se quedaron a medias", async () => {
  await abrirUso();
  expect(screen.getByText("RH").closest("tr")).toHaveTextContent("0 (0%)");
  const medias = screen.getByText("Se quedaron a medias").closest(".bf-uso-panel");
  expect(within(medias).getByText("Rosa H")).toBeInTheDocument();
  expect(within(medias).getByText(/código vencido/)).toBeInTheDocument();
});
