import { describe, expect, it } from "vitest";
import {
  CERRADA_POR_OTRO,
  PLAZO_RESERVA_SEG,
  debeRenovar,
  detalleActaEnCurso,
  evaluarReserva,
  horaDeMarca,
  intervaloAvisoMs,
  minutosDelPlazo,
  plazoConfigurado,
  reservaVencida,
  segundosParaVencer,
  textoActaEnCurso,
  type ReservaLeida,
} from "@/lib/reserva";

const reserva = (cambios: Partial<ReservaLeida> = {}): ReservaLeida => ({
  usuarioId: 10,
  tecnicoId: 1,
  nombre: "Ana Pérez",
  desde: "2026-10-14T14:05:30",
  segundosInactiva: 0,
  ...cambios,
});

describe("vigencia de la reserva", () => {
  it("el plazo son 15 minutos", () => {
    expect(PLAZO_RESERVA_SEG).toBe(900);
  });

  it("vigente hasta un segundo antes del plazo; en el plazo ya venció", () => {
    expect(reservaVencida(0)).toBe(false);
    expect(reservaVencida(899)).toBe(false);
    expect(reservaVencida(900)).toBe(true);
    expect(reservaVencida(5000)).toBe(true);
  });

  it("respeta un plazo distinto", () => {
    expect(reservaVencida(59, 60)).toBe(false);
    expect(reservaVencida(60, 60)).toBe(true);
  });

  it("un valor ilegible no deja a nadie bloqueado", () => {
    expect(reservaVencida(Number.NaN)).toBe(true);
    expect(segundosParaVencer(Number.NaN)).toBe(0);
  });

  it("cuánto falta para que venza, sin bajar de cero", () => {
    expect(segundosParaVencer(0)).toBe(900);
    expect(segundosParaVencer(840)).toBe(60);
    expect(segundosParaVencer(900)).toBe(0);
    expect(segundosParaVencer(4000)).toBe(0);
    // Un reloj que va unos segundos atrás no suma tiempo de más.
    expect(segundosParaVencer(-30)).toBe(900);
  });
});

describe("quién puede escribir", () => {
  it("sin reserva, está libre", () => {
    expect(evaluarReserva(null, { tecnicoId: 2 })).toEqual({ estado: "libre" });
  });

  it("la reserva vigente es de quien la tomó", () => {
    expect(evaluarReserva(reserva(), { tecnicoId: 1 })).toEqual({ estado: "propia" });
  });

  it("el otro técnico la ve ajena, con quién, desde cuándo y cuándo se libera", () => {
    expect(evaluarReserva(reserva({ segundosInactiva: 300 }), { tecnicoId: 2 })).toEqual({
      estado: "ajena",
      nombre: "Ana Pérez",
      desde: "2026-10-14T14:05:30",
      liberaEnSeg: 600,
    });
  });

  it("vencida, queda libre para el otro técnico", () => {
    expect(evaluarReserva(reserva({ segundosInactiva: 900 }), { tecnicoId: 2 })).toEqual({ estado: "libre" });
  });

  it("vencida y sin que nadie la tomara, quien la tenía la recupera como libre", () => {
    expect(evaluarReserva(reserva({ segundosInactiva: 1200 }), { tecnicoId: 1 })).toEqual({ estado: "libre" });
  });

  it("con un plazo corto de pruebas", () => {
    expect(evaluarReserva(reserva({ segundosInactiva: 59 }), { tecnicoId: 2 }, 60).estado).toBe("ajena");
    expect(evaluarReserva(reserva({ segundosInactiva: 60 }), { tecnicoId: 2 }, 60).estado).toBe("libre");
  });
});

describe("renovación por actividad", () => {
  it("renueva si hubo actividad desde el último aviso", () => {
    expect(debeRenovar({ ultimaActividadMs: 2000, ultimoAvisoMs: 1000, subiendo: false })).toBe(true);
  });

  it("una pantalla abierta sin actividad no renueva", () => {
    expect(debeRenovar({ ultimaActividadMs: 1000, ultimoAvisoMs: 1000, subiendo: false })).toBe(false);
    expect(debeRenovar({ ultimaActividadMs: 500, ultimoAvisoMs: 1000, subiendo: false })).toBe(false);
  });

  it("un video subiendo cuenta como actividad", () => {
    expect(debeRenovar({ ultimaActividadMs: 0, ultimoAvisoMs: 1000, subiendo: true })).toBe(true);
  });

  it("avisa varias veces dentro del plazo: una quinta parte, entre 3 s y 3 min", () => {
    expect(intervaloAvisoMs(900)).toBe(180_000);
    expect(intervaloAvisoMs(60)).toBe(12_000);
    expect(intervaloAvisoMs(5)).toBe(3_000);
    expect(intervaloAvisoMs(100_000)).toBe(180_000);
    expect(intervaloAvisoMs(900)).toBeLessThan(PLAZO_RESERVA_SEG * 1000);
  });
});

describe("el plazo en desarrollo", () => {
  it("en producción siempre son 15 minutos, diga lo que diga la variable", () => {
    expect(plazoConfigurado("30", true)).toBe(900);
  });

  it("en desarrollo se acorta con un entero razonable", () => {
    expect(plazoConfigurado("60", false)).toBe(60);
  });

  it("sin variable, o con un valor raro, quedan 15 minutos", () => {
    expect(plazoConfigurado(undefined, false)).toBe(900);
    expect(plazoConfigurado("", false)).toBe(900);
    expect(plazoConfigurado("abc", false)).toBe(900);
    expect(plazoConfigurado("2", false)).toBe(900);
    expect(plazoConfigurado("5000", false)).toBe(900);
    expect(plazoConfigurado("12.5", false)).toBe(900);
  });
});

describe("los textos que ve el técnico", () => {
  it("dice quién la tiene", () => {
    expect(textoActaEnCurso({ nombre: "Ana Pérez" })).toBe("Esta acta está en curso por Ana Pérez");
  });

  it("dice desde qué hora y que se libera tras 15 minutos sin actividad", () => {
    const t = detalleActaEnCurso({ desde: "2026-10-14T14:05:30" });
    expect(t).toContain("14:05");
    expect(t).toContain("15 minutos");
  });

  it("en singular con un minuto", () => {
    expect(minutosDelPlazo(60)).toBe(1);
    expect(detalleActaEnCurso({ desde: "2026-10-14T09:00:00" }, 60)).toContain("1 minuto sin");
  });

  it("la hora de una marca, y la marca tal cual si no se entiende", () => {
    expect(horaDeMarca("2026-10-14T07:03:00")).toBe("07:03");
    expect(horaDeMarca("sin hora")).toBe("sin hora");
  });

  it("el aviso de visita cerrada por el otro dice que nada se envió", () => {
    expect(CERRADA_POR_OTRO).toMatch(/sin enviarse/);
  });
});
