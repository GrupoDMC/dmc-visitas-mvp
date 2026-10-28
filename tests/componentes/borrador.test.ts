import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actasEnCola,
  borradorConDatos,
  borrarBorrador,
  borrarBorradoresDelUsuario,
  encolarActa,
  escribirBorrador,
  haceCuanto,
  hayConexion,
  leerActaEnCola,
  leerBorrador,
  migrarClavesViejas,
  pendientesAlSalir,
  sacarDeCola,
  type ActaEnCola,
  type BorradorActa,
} from "@/lib/ui/borrador";
import { borrarBorradorPapel, escribirBorradorPapel, leerBorradorPapel } from "@/lib/ui/borrador-papel";
import { prepararSalida } from "@/lib/ui/salir";
import { trozoBase64 } from "@/lib/ui/video";

const borrador = (folio: string, extra: Partial<BorradorActa> = {}): BorradorActa => ({
  folio,
  guardadoEn: "2026-10-28T10:00:00",
  respNombre: "",
  respRut: "",
  respTel: "",
  motivosCodigos: [],
  obs: "",
  interno: "",
  trabajos: [],
  problemas: [],
  fotos: [],
  firma: null,
  guardadas: {},
  horaInicio: "10:00",
  ...extra,
});

const acta = (folio: string): ActaEnCola => ({
  folio,
  capturadaEn: "2026-10-28T10:30:00",
  intentos: 0,
  ultimoError: null,
  entrada: {} as never,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("borrador del acta (por usuario y folio)", () => {
  it("escribe y lee ida y vuelta", () => {
    expect(escribirBorrador(1, borrador("V-1", { respNombre: "Ana" }))).toBe(true);
    expect(leerBorrador(1, "V-1")?.respNombre).toBe("Ana");
  });

  it("otro usuario del mismo equipo no lo ve", () => {
    escribirBorrador(1, borrador("V-1", { respNombre: "Ana" }));
    expect(leerBorrador(2, "V-1")).toBeNull();
  });

  it("un JSON corrupto se trata como «sin borrador»", () => {
    localStorage.setItem("dmc.borrador.u1.V-1", "{no es json");
    expect(leerBorrador(1, "V-1")).toBeNull();
  });

  it("si el folio guardado no coincide con la clave, se ignora", () => {
    localStorage.setItem("dmc.borrador.u1.V-1", JSON.stringify(borrador("V-2")));
    expect(leerBorrador(1, "V-1")).toBeNull();
  });

  it("si no caben las fotos, guarda el texto sin ellas y lo marca", () => {
    const original = Storage.prototype.setItem;
    let llamadas = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (++llamadas === 1) throw new DOMException("cuota", "QuotaExceededError");
      return original.call(this, k, v);
    });
    const guardado = escribirBorrador(1, borrador("V-1", { respNombre: "Ana", fotos: [{ id: 1, src: "data:image/jpeg;base64,AAAA" }] }));
    expect(guardado).toBe(true);
    const leido = leerBorrador(1, "V-1");
    expect(leido?.respNombre).toBe("Ana");
    expect(leido?.fotos).toEqual([]);
    expect(leido?.sinFotos).toBe(true);
  });

  it("si ni así cabe, devuelve false sin lanzar", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cuota", "QuotaExceededError");
    });
    expect(escribirBorrador(1, borrador("V-1"))).toBe(false);
  });

  it("borrarBorrador y borrarBorradoresDelUsuario solo tocan lo suyo y dejan la cola", () => {
    escribirBorrador(1, borrador("V-1"));
    escribirBorrador(1, borrador("V-2"));
    escribirBorrador(2, borrador("V-1"));
    encolarActa(1, acta("V-9"));

    borrarBorrador(1, "V-1");
    expect(leerBorrador(1, "V-1")).toBeNull();
    expect(leerBorrador(1, "V-2")).not.toBeNull();

    borrarBorradoresDelUsuario(1);
    expect(leerBorrador(1, "V-2")).toBeNull();
    expect(leerBorrador(2, "V-1")).not.toBeNull();
    expect(leerActaEnCola(1, "V-9")).not.toBeNull();
  });

  it("borradorConDatos ignora los borradores vacíos", () => {
    expect(borradorConDatos(null)).toBe(false);
    expect(borradorConDatos(borrador("V-1"))).toBe(false);
    expect(borradorConDatos(borrador("V-1", { respNombre: "  " }))).toBe(false);
    expect(borradorConDatos(borrador("V-1", { obs: "algo" }))).toBe(true);
    expect(borradorConDatos(borrador("V-1", { internos: ["X"] }))).toBe(true);
    expect(borradorConDatos(borrador("V-1", { firma: { imagen: "x", nombre: "a", rut: "", hora: "10:00" } }))).toBe(true);
  });
});

describe("cola de actas por enviar", () => {
  it("encola, lista por usuario, cuenta y saca", () => {
    expect(encolarActa(1, acta("V-1"))).toBe(true);
    encolarActa(1, acta("V-2"));
    encolarActa(2, acta("V-3"));

    expect(actasEnCola(1).map((a) => a.folio).sort()).toEqual(["V-1", "V-2"]);
    expect(pendientesAlSalir(1)).toBe(2);
    expect(pendientesAlSalir(2)).toBe(1);
    expect(pendientesAlSalir(3)).toBe(0);

    sacarDeCola(1, "V-1");
    expect(leerActaEnCola(1, "V-1")).toBeNull();
    expect(pendientesAlSalir(1)).toBe(1);
  });
});

describe("migrarClavesViejas (formato sin usuario en la clave)", () => {
  it("adopta solo los folios que el servidor confirmó como del usuario", () => {
    localStorage.setItem("dmc.borrador.V-1", JSON.stringify(borrador("V-1", { respNombre: "viejo" })));
    localStorage.setItem("dmc.borrador.V-2", JSON.stringify(borrador("V-2")));
    localStorage.setItem("dmc.acta-pendiente.V-1", JSON.stringify(acta("V-1")));

    migrarClavesViejas(7, ["V-1"]);

    expect(leerBorrador(7, "V-1")?.respNombre).toBe("viejo");
    expect(leerActaEnCola(7, "V-1")).not.toBeNull();
    expect(localStorage.getItem("dmc.borrador.V-1")).toBeNull();
    // V-2 no es de este usuario: se queda donde estaba.
    expect(localStorage.getItem("dmc.borrador.V-2")).not.toBeNull();
    expect(leerBorrador(7, "V-2")).toBeNull();
  });

  it("si ya hay una copia nueva, la vieja no la pisa", () => {
    escribirBorrador(7, borrador("V-1", { respNombre: "nuevo" }));
    localStorage.setItem("dmc.borrador.V-1", JSON.stringify(borrador("V-1", { respNombre: "viejo" })));
    migrarClavesViejas(7, ["V-1"]);
    expect(leerBorrador(7, "V-1")?.respNombre).toBe("nuevo");
    expect(localStorage.getItem("dmc.borrador.V-1")).not.toBeNull();
  });
});

describe("haceCuanto / hayConexion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-10-28T11:59:40", "recién"],
    ["2026-10-28T11:59:00", "hace 1 minuto"],
    ["2026-10-28T11:15:00", "hace 45 minutos"],
    ["2026-10-28T11:00:00", "hace 1 hora"],
    ["2026-10-28T07:00:00", "hace 5 horas"],
    ["2026-10-27T11:00:00", "ayer"],
    ["2026-10-24T12:00:00", "hace 4 días"],
    ["2026-10-29T12:00:00", "recién"], // futuro
    ["basura", "recién"],
  ])("%s → %s", (iso, texto) => {
    expect(haceCuanto(iso)).toBe(texto);
  });

  it("hayConexion sigue a navigator.onLine", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(hayConexion()).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(hayConexion()).toBe(true);
  });
});

describe("borrador de visitas en papel (panel)", () => {
  it("guarda por usuario y borra", () => {
    escribirBorradorPapel(1, '{"a":1}');
    expect(leerBorradorPapel(1)).toBe('{"a":1}');
    expect(leerBorradorPapel(2)).toBeNull();
    borrarBorradorPapel(1);
    expect(leerBorradorPapel(1)).toBeNull();
  });

  it("adopta el borrador del formato anterior (sin usuario) la primera vez", () => {
    localStorage.setItem("dmc.visitas-papel.borrador.v4", '{"viejo":true}');
    expect(leerBorradorPapel(5)).toBe('{"viejo":true}');
    expect(localStorage.getItem("dmc.visitas-papel.borrador.v4")).toBeNull();
    expect(leerBorradorPapel(5)).toBe('{"viejo":true}');
  });
});

describe("prepararSalida (cerrar sesión sin perder actas)", () => {
  it("sin actas pendientes limpia los borradores y deja salir sin preguntar", () => {
    const confirmar = vi.spyOn(window, "confirm");
    escribirBorrador(1, borrador("V-1"));
    escribirBorradorPapel(1, "{}");
    expect(prepararSalida(1)).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
    expect(leerBorrador(1, "V-1")).toBeNull();
    expect(leerBorradorPapel(1)).toBeNull();
  });

  it("con actas sin enviar avisa; si el usuario no confirma, no sale ni borra", () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    encolarActa(1, acta("V-1"));
    escribirBorrador(1, borrador("V-2"));
    expect(prepararSalida(1)).toBe(false);
    expect(confirmar.mock.calls[0][0]).toContain("Tienes 1 acta sin enviar");
    expect(leerBorrador(1, "V-2")).not.toBeNull();
  });

  it("si confirma, sale, borra los borradores y NUNCA borra la cola", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    encolarActa(1, acta("V-1"));
    encolarActa(1, acta("V-2"));
    escribirBorrador(1, borrador("V-3"));
    expect(prepararSalida(1)).toBe(true);
    expect(leerBorrador(1, "V-3")).toBeNull();
    expect(pendientesAlSalir(1)).toBe(2);
  });

  it("el aviso usa el plural cuando son varias", () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    encolarActa(1, acta("V-1"));
    encolarActa(1, acta("V-2"));
    prepararSalida(1);
    expect(confirmar.mock.calls[0][0]).toContain("Tienes 2 actas sin enviar");
  });
});

describe("trozoBase64 (subida del video por trozos)", () => {
  it("devuelve solo el base64 del tramo pedido", async () => {
    const blob = new Blob(["hola mundo"]);
    expect(atob(await trozoBase64(blob, 0, 4))).toBe("hola");
    expect(atob(await trozoBase64(blob, 5, 10))).toBe("mundo");
  });
});
