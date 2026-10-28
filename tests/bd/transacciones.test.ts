import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { consulta } from "@/lib/data/sql";
import {
  cancelarVisitaPorAdmin,
  crearVisita,
  eliminarVisita,
  guardarActa,
  iniciarVisita,
  liberarVisita,
} from "@/lib/data/visitas";
import type { ActaEntrada } from "@/lib/contratos/acta";
import type { DatosVisita } from "@/lib/contratos/visitas";
import { hoyISO, sumarDias } from "@/lib/ui/fecha";
import { hayBd, limpiarDatos, sembrarMundo, uno, type Mundo } from "./_ayuda";

// PNG de 1×1 píxel: pasa la validación de firma/foto por cabecera.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const cuenta = async (tabla: string, donde = "1=1") =>
  Number((await uno<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.${tabla} WHERE ${donde}`))!.n);

describe.skipIf(!hayBd)("BD · escrituras reales de la capa de datos (transacciones)", () => {
  let m: Mundo;
  const datos = (extra: Partial<DatosVisita> = {}): DatosVisita => ({
    clienteId: m.clienteId,
    sucursalId: m.sucursalId,
    tecnicoId: m.tecnicoId,
    tecnicoAyudanteId: null,
    motivoCodigo: "VISITA",
    motivosCodigos: ["VISITA"],
    // Siempre a futuro: una visita con fecha vencida la cancela sola la lectura (ver vencimiento.test.ts).
    fechaProgramada: sumarDias(hoyISO(), 7),
    horaProgramada: null,
    trabajoSolicitado: "Revisar antenas",
    indicacionesAcceso: null,
    responsableNombre: "María Soto",
    responsableRut: "11.111.111-1",
    responsableTelefono: "+56911111111",
    ...extra,
  });
  const ctxA = () => ({ tecnicoId: m.tecnicoId, usuarioId: m.usuarioTecnicoId });
  const ctxB = () => ({ tecnicoId: m.tecnico2Id, usuarioId: m.usuarioTecnico2Id });

  const acta = (folio: string, extra: Partial<ActaEntrada> = {}): ActaEntrada => ({
    folio,
    responsableNombre: "María Soto",
    responsableRut: "11.111.111-1",
    responsableTelefono: "+56911111111",
    responsableCargo: null,
    motivosCodigos: ["VISITA"],
    observaciones: "Todo en orden",
    comentarioInterno: null,
    internosCodigos: [],
    trabajos: [{ codigo: "REVISION_ANTENAS", motivoCodigo: "VISITA", detalle: "Se revisaron 3 antenas", subtrabajos: [] }],
    problemas: [
      { tipoCodigo: "ANTENA_NO_DETECTA", estado: "ABIERTO", descripcion: "Antena 2 sin lectura", solucion: null, items: [{ etiqueta: "Antena 2", cantidad: 1 }] },
    ],
    fotos: [],
    firma: { nombre: "María Soto", rut: "11.111.111-1", dataUrl: PNG },
    dispositivo: "Pixel de prueba",
    ...extra,
  });

  beforeEach(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
  });
  afterAll(() => limpiarDatos());

  /** Crea una visita y la deja EN_CURSO por el técnico A. */
  async function enCurso() {
    const v = await crearVisita(datos(), m.adminId);
    expect(await iniciarVisita(v.folio, "María Soto", ctxA())).toBeNull();
    return v;
  }

  describe("crearVisita", () => {
    it("crea la visita PROGRAMADA con su folio, motivos del plan y bitácora, y la devuelve completa", async () => {
      const v = await crearVisita(datos({ motivosCodigos: ["VISITA", "CALIBRACION"] }), m.adminId);
      expect(v.folio).toMatch(/^V-\d{4}-00001$/);
      expect(v.estado).toBe("PROGRAMADA");
      expect(v.sucursalId).toBe(m.sucursalId);
      expect(await cuenta("visita_motivo", `visita_id = ${v.id} AND ambito = 'PLAN'`)).toBe(2);
      expect(await cuenta("visita_estado_historial", `visita_id = ${v.id}`)).toBe(1);
      const f = await uno<{ creada_por: number }>(`SELECT creada_por FROM dmc.visita WHERE id = ${v.id}`);
      expect(Number(f!.creada_por)).toBe(m.adminId);
    });

    it("si algo falla a mitad (motivo inexistente en un motivo secundario) no queda NADA a medias", async () => {
      await expect(crearVisita(datos({ motivosCodigos: ["VISITA", "NO_EXISTE"] }), m.adminId)).rejects.toThrow();
      expect(await cuenta("visita")).toBe(0);
      expect(await cuenta("visita_motivo")).toBe(0);
      expect(await cuenta("visita_estado_historial")).toBe(0);
    });

    it("rechaza con el nombre de la restricción un ayudante igual al técnico", async () => {
      await expect(crearVisita(datos({ tecnicoAyudanteId: m.tecnicoId }), m.adminId)).rejects.toThrow(/ck_visita_ayudante/);
      expect(await cuenta("visita")).toBe(0);
    });

    it("el aviso de problemas es obligatorio si la sucursal tiene problemas sin resolver", async () => {
      const primera = await crearVisita(datos(), m.adminId);
      await iniciarVisita(primera.folio, null, ctxA());
      expect((await guardarActa(acta(primera.folio), ctxA())).ok).toBe(true);
      // La sucursal ahora tiene un problema abierto: agendar sin responder falla y no deja visita.
      await expect(crearVisita(datos({ fechaProgramada: sumarDias(hoyISO(), 8) }), m.adminId, { exigirAviso: true })).rejects.toThrow(/problemas sin resolver/i);
      expect(await cuenta("visita")).toBe(1);
    });
  });

  describe("iniciar y soltar", () => {
    it("el técnico la inicia (EN_CURSO) y el otro no puede mientras la tiene tomada", async () => {
      const v = await crearVisita(datos({ tecnicoAyudanteId: m.tecnico2Id }), m.adminId);
      expect(await iniciarVisita(v.folio, null, ctxA())).toBeNull();
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("EN_CURSO");
      const otro = await iniciarVisita(v.folio, null, ctxB());
      expect(otro?.error).toBeTruthy();
    });

    it("un técnico ajeno a la visita no la puede iniciar", async () => {
      const v = await crearVisita(datos(), m.adminId);
      expect((await iniciarVisita(v.folio, null, ctxB()))?.error).toBeTruthy();
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("PROGRAMADA");
    });

    it("el administrador la libera y vuelve a PROGRAMADA", async () => {
      const v = await enCurso();
      expect(await liberarVisita({ folio: v.folio, usuarioId: m.adminId })).toBeNull();
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("PROGRAMADA");
    });
  });

  describe("guardarActa (cierre del acta, todo en una transacción)", () => {
    it("escribe responsable, motivos reales, trabajos, problemas con sus items, firma y cierra la visita", async () => {
      const v = await enCurso();
      const r = await guardarActa(acta(v.folio), ctxA());
      expect(r.ok).toBe(true);

      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("COMPLETADA");
      const e = await uno<{ responsable_nombre: string; hora_termino: Date | null; dispositivo: string; registrado_offline: boolean }>(
        `SELECT responsable_nombre, hora_termino, dispositivo, registrado_offline FROM dmc.visita_ejecucion WHERE visita_id = ${v.id}`
      );
      expect(e).toMatchObject({ responsable_nombre: "María Soto", dispositivo: "Pixel de prueba", registrado_offline: false });
      expect(e!.hora_termino).toBeTruthy();
      expect(await cuenta("visita_motivo", `visita_id = ${v.id} AND ambito = 'REAL'`)).toBe(1);
      expect(await cuenta("visita_trabajo", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("problema", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("problema_item")).toBe(1);
      expect(await cuenta("visita_firma", `visita_id = ${v.id} AND rol = 'TIENDA'`)).toBe(1);
      const historial = await consulta<{ estado: string }>(`SELECT estado FROM dmc.visita_estado_historial WHERE visita_id = ${v.id} ORDER BY id`);
      expect(historial.map((h) => h.estado)).toEqual(["PROGRAMADA", "EN_CURSO", "COMPLETADA"]);
    });

    it("si algo falla a mitad del guardado (tipo de problema inexistente) se deshace TODO", async () => {
      const v = await enCurso();
      const rota = acta(v.folio, {
        problemas: [
          { tipoCodigo: "ANTENA_NO_DETECTA", estado: "ABIERTO", descripcion: "ok", solucion: null, items: [] },
          { tipoCodigo: "TIPO_QUE_NO_EXISTE", estado: "ABIERTO", descripcion: "esta rompe", solucion: null, items: [] },
        ],
      });
      await expect(guardarActa(rota, ctxA())).rejects.toThrow(/fk_problema_tipo/);

      // La visita sigue EN_CURSO y no quedó ni un rastro del intento.
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("EN_CURSO");
      expect(await cuenta("problema")).toBe(0);
      expect(await cuenta("problema_item")).toBe(0);
      expect(await cuenta("visita_trabajo")).toBe(0);
      expect(await cuenta("visita_firma")).toBe(0);
      expect(await cuenta("visita_motivo", `visita_id = ${v.id} AND ambito = 'REAL'`)).toBe(0);
      const e = await uno<{ hora_termino: Date | null; observaciones: string | null }>(
        `SELECT hora_termino, observaciones FROM dmc.visita_ejecucion WHERE visita_id = ${v.id}`
      );
      expect(e!.hora_termino).toBeNull();
      expect(e!.observaciones).toBeNull();
    });

    it("tras el fallo, el técnico puede reintentar con el acta corregida sin duplicar nada", async () => {
      const v = await enCurso();
      await expect(
        guardarActa(acta(v.folio, { problemas: [{ tipoCodigo: "NO_EXISTE", estado: "ABIERTO", descripcion: "x", solucion: null, items: [] }] }), ctxA())
      ).rejects.toThrow();
      expect((await guardarActa(acta(v.folio), ctxA())).ok).toBe(true);
      expect(await cuenta("problema", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("visita_firma", `visita_id = ${v.id}`)).toBe(1);
    });

    it("guardar dos veces el mismo cierre (reintento tras perder la respuesta) no duplica filas", async () => {
      const v = await enCurso();
      expect((await guardarActa(acta(v.folio), ctxA())).ok).toBe(true);
      const segunda = await guardarActa(acta(v.folio), ctxA());
      expect(segunda.ok).toBe(false);
      expect(await cuenta("problema", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("visita_trabajo", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("visita_firma", `visita_id = ${v.id}`)).toBe(1);
    });

    it("un técnico ajeno a la visita no puede cerrarla y no se escribe nada", async () => {
      const v = await enCurso();
      const r = await guardarActa(acta(v.folio), ctxB());
      expect(r.ok).toBe(false);
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("EN_CURSO");
      expect(await cuenta("visita_firma")).toBe(0);
    });

    it("una firma ilegible se rechaza antes de abrir la transacción", async () => {
      const v = await enCurso();
      const r = await guardarActa(acta(v.folio, { firma: { nombre: "x", rut: null, dataUrl: "data:image/png;base64,AAAA" } }), ctxA());
      expect(r.ok).toBe(false);
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("EN_CURSO");
    });

    it("un problema «Otro» sin descripción lo frena la base misma y revierte el cierre", async () => {
      const v = await enCurso();
      await expect(
        guardarActa(acta(v.folio, { problemas: [{ tipoCodigo: "OTRO", estado: "ABIERTO", descripcion: null, solucion: null, items: [] }] }), ctxA())
      ).rejects.toThrow(/ck_problema_otro_desc/);
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("EN_CURSO");
    });
  });

  describe("cancelar y eliminar", () => {
    it("cancelar por administración deja el motivo en la bitácora", async () => {
      const v = await crearVisita(datos(), m.adminId);
      expect(await cancelarVisitaPorAdmin({ folio: v.folio, motivo: "Local cerrado definitivamente", usuarioId: m.adminId })).toBeNull();
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("CANCELADA_ADMIN");
      const h = await uno<{ motivo: string }>(`SELECT TOP 1 motivo FROM dmc.visita_estado_historial WHERE visita_id = ${v.id} ORDER BY id DESC`);
      expect(h!.motivo).toContain("Local cerrado definitivamente");
    });

    it("una visita COMPLETADA (con acta firmada) no se puede cancelar por admin", async () => {
      const v = await enCurso();
      await guardarActa(acta(v.folio), ctxA());
      const r = await cancelarVisitaPorAdmin({ folio: v.folio, motivo: "Intento de cancelar una cerrada", usuarioId: m.adminId });
      expect(r?.error).toBeTruthy();
      expect((await uno<{ estado: string }>(`SELECT estado FROM dmc.visita WHERE id = ${v.id}`))!.estado).toBe("COMPLETADA");
    });

    it("eliminar es lógico: exige escribir el folio, deja registro y conserva el acta", async () => {
      const v = await enCurso();
      await guardarActa(acta(v.folio), ctxA());
      const mala = await eliminarVisita({ folio: v.folio, confirmacionFolio: "V-0000", usuarioId: m.adminId });
      expect(mala?.error).toBeTruthy();
      expect((await uno<{ activo: boolean }>(`SELECT activo FROM dmc.visita WHERE id = ${v.id}`))!.activo).toBe(true);

      expect(await eliminarVisita({ folio: v.folio, confirmacionFolio: v.folio, usuarioId: m.adminId })).toBeNull();
      expect((await uno<{ activo: boolean }>(`SELECT activo FROM dmc.visita WHERE id = ${v.id}`))!.activo).toBe(false);
      expect(await cuenta("visita_eliminacion", `visita_id = ${v.id}`)).toBe(1);
      // El acta y la firma siguen en la base.
      expect(await cuenta("visita_firma", `visita_id = ${v.id}`)).toBe(1);
      expect(await cuenta("problema", `visita_id = ${v.id}`)).toBe(1);
    });
  });
});
