import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelarVisitasVencidas, DIAS_TOLERANCIA, MOTIVO_VENCIDA } from "@/lib/data/vencimiento";
import { hoyISO, sumarDias } from "@/lib/ui/fecha";
import { consulta } from "@/lib/data/sql";
import { hayBd, insertarVisita, limpiarDatos, sembrarMundo, uno, type Mundo } from "./_ayuda";

// Una visita que el técnico no cerró a tiempo se cancela sola: el día asignado
// más un día de tolerancia. No hay cron: se revisa al leer.
describe.skipIf(!hayBd)("BD · cancelación automática por vencimiento", () => {
  let m: Mundo;
  const estadoDe = async (id: number) => (await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${id}`))!.estado;
  const dias = (n: number) => sumarDias(hoyISO(), n);

  beforeEach(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
    // La revisión se limita a una vez cada 5 minutos por instancia: se adelanta el reloj.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 * (1 + Math.floor(Math.random() * 1000)));
  });
  afterAll(async () => {
    vi.useRealTimers();
    await limpiarDatos();
  });

  it("la tolerancia es de un día", () => {
    expect(DIAS_TOLERANCIA).toBe(1);
  });

  it("cancela las que pasaron la tolerancia y deja el motivo en la bitácora", async () => {
    const vieja = await insertarVisita(m, { fecha: dias(-5) });
    await cancelarVisitasVencidas();
    expect(await estadoDe(vieja.id)).toBe("CANCELADA");
    const h = await uno<{ motivo: string; origen: string }>(`SELECT TOP 1 motivo, origen FROM dmc.visita_estado_historial WHERE visita_id = ${vieja.id} ORDER BY id DESC`);
    expect(h!.motivo).toContain(MOTIVO_VENCIDA);
    expect(h!.origen).toBe("WEB");
  });

  it("hoy y ayer siguen en plazo; anteayer ya no", async () => {
    const hoy = await insertarVisita(m, { fecha: dias(0) });
    const ayer = await insertarVisita(m, { fecha: dias(-1) });
    const anteayer = await insertarVisita(m, { fecha: dias(-2) });
    await cancelarVisitasVencidas();
    expect(await estadoDe(hoy.id)).toBe("PROGRAMADA");
    expect(await estadoDe(ayer.id)).toBe("PROGRAMADA");
    expect(await estadoDe(anteayer.id)).toBe("CANCELADA");
  });

  it("con margen de días, el plazo corre desde el último día del margen", async () => {
    const conMargen = await insertarVisita(m, { fecha: dias(-5), hasta: dias(0) });
    await cancelarVisitasVencidas();
    expect(await estadoDe(conMargen.id)).toBe("PROGRAMADA");
  });

  it("solo toca PROGRAMADA, EN_CURSO y REAGENDADA: una PENDIENTE o COMPLETADA conserva su motivo", async () => {
    const ids: Record<string, number> = {};
    for (const estado of ["EN_CURSO", "REAGENDADA", "PENDIENTE", "COMPLETADA", "CANCELADA_ADMIN"]) {
      ids[estado] = (await insertarVisita(m, { fecha: dias(-9), estado })).id;
    }
    await cancelarVisitasVencidas();
    expect(await estadoDe(ids.EN_CURSO)).toBe("CANCELADA");
    expect(await estadoDe(ids.REAGENDADA)).toBe("CANCELADA");
    expect(await estadoDe(ids.PENDIENTE)).toBe("PENDIENTE");
    expect(await estadoDe(ids.COMPLETADA)).toBe("COMPLETADA");
    expect(await estadoDe(ids.CANCELADA_ADMIN)).toBe("CANCELADA_ADMIN");
  });

  it("no toca las visitas eliminadas (activo = 0)", async () => {
    const v = await insertarVisita(m, { fecha: dias(-9) });
    await consulta(`UPDATE dmc.visita SET activo = 0 WHERE id = ${v.id}`);
    await cancelarVisitasVencidas();
    expect(await estadoDe(v.id)).toBe("PROGRAMADA");
  });

  it("es idempotente: una segunda pasada no vuelve a escribir en la bitácora", async () => {
    const v = await insertarVisita(m, { fecha: dias(-9) });
    await cancelarVisitasVencidas();
    vi.setSystemTime(Date.now() + 20 * 60 * 1000);
    await cancelarVisitasVencidas();
    const n = await uno<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.visita_estado_historial WHERE visita_id = ${v.id} AND estado = 'CANCELADA'`);
    expect(Number(n!.n)).toBe(1);
  });
});
