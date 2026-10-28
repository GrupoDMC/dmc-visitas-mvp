import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/reservas");
vi.mock("@/lib/data/borradores");
vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/ediciones");
vi.mock("@/lib/data/auditoria");
vi.mock("@/lib/data/personas-local");
vi.mock("@/lib/data/contactos", async (importar) => {
  const real = await importar<typeof import("@/lib/data/contactos")>();
  return { ...real, guardarContacto: vi.fn() };
});

import { revalidatePath } from "next/cache";
import { liberarReservaAction, renovarReservaAction } from "@/app/actions/reservas";
import { descartarBorradorAction, guardarBorradorAction, leerBorradorAction } from "@/app/actions/borradores";
import { editarActaAdminAction, editarActaTecnicoAction, permitirEditarTecnicoAction } from "@/app/actions/ediciones";
import { personasDelLocalAction } from "@/app/actions/personas-local";
import { guardarContactoAction } from "@/app/actions/contactos";
import { liberarReserva, tomarReserva } from "@/lib/data/reservas";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/data/borradores";
import { getEquipoDeVisita, getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { editarActa, habilitarEdicionTecnico } from "@/lib/data/ediciones";
import { auditar } from "@/lib/data/auditoria";
import { listarPersonasLocal, tecnicoTieneVisitaEn } from "@/lib/data/personas-local";
import { AlcanceInexistente, guardarContacto } from "@/lib/data/contactos";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const MIO = TECNICO_PRUEBA.id;

beforeEach(() => {
  vi.resetAllMocks();
  salir();
});

describe("reserva del acta", () => {
  beforeEach(() => entrarComo("tecnico"));

  it("renovar: ok cuando toma o renueva", async () => {
    vi.mocked(tomarReserva).mockResolvedValue({ ok: true } as never);
    expect(await renovarReservaAction("V-1")).toEqual({ ok: true });
    expect(tomarReserva).toHaveBeenCalledWith("V-1", { usuarioId: 3, tecnicoId: MIO });
  });

  it("renovar: si otro técnico la tiene, dice quién y cuánto falta", async () => {
    vi.mocked(tomarReserva).mockResolvedValue({ ok: false, motivo: "ajena", nombre: "Beto", desde: "10:00", liberaEnSeg: 240 } as never);
    expect(await renovarReservaAction("V-1")).toEqual({
      ok: false,
      reservaAjena: { nombre: "Beto", desde: "10:00", liberaEnSeg: 240 },
    });
  });

  it("renovar: si la visita ya no está abierta, avisa que se cerró", async () => {
    vi.mocked(tomarReserva).mockResolvedValue({ ok: false, motivo: "cerrada", error: "x" } as never);
    expect(await renovarReservaAction("V-1")).toEqual({ ok: false, cerrada: true });
  });

  it("renovar nunca tumba el formulario: un fallo de la base devuelve ok:false", async () => {
    vi.mocked(tomarReserva).mockRejectedValue(new Error("boom"));
    expect(await renovarReservaAction("V-1")).toEqual({ ok: false });
  });

  it("sin técnico en la sesión (o con un folio inválido) no toca la base", async () => {
    entrarComo("admin");
    expect(await renovarReservaAction("V-1")).toEqual({ ok: false });
    expect(await liberarReservaAction("V-1")).toEqual({ ok: false });
    entrarComo("tecnico");
    expect(await renovarReservaAction("")).toEqual({ ok: false });
    expect(tomarReserva).not.toHaveBeenCalled();
    expect(liberarReserva).not.toHaveBeenCalled();
  });

  it("liberar: suelta solo la reserva de quien sale", async () => {
    expect(await liberarReservaAction("V-1")).toEqual({ ok: true });
    expect(liberarReserva).toHaveBeenCalledWith("V-1", 3);
  });
});

describe("respaldo del borrador en el servidor", () => {
  const suya = { id: 100, folio: "V-1", tecnicoId: MIO, tecnicoAyudanteId: null };

  beforeEach(() => {
    entrarComo("tecnico");
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(suya as never);
    vi.mocked(tomarReserva).mockResolvedValue({ ok: true } as never);
    vi.mocked(guardarBorrador).mockResolvedValue(true);
  });

  it("guarda el respaldo y renueva la reserva (subir el respaldo es actividad)", async () => {
    expect(await guardarBorradorAction("V-1", '{"a":1}')).toEqual({ ok: true });
    expect(tomarReserva).toHaveBeenCalled();
    expect(guardarBorrador).toHaveBeenCalledWith("V-1", 3, '{"a":1}');
  });

  it("si otro técnico tiene la reserva, no sube el respaldo y lo informa", async () => {
    vi.mocked(tomarReserva).mockResolvedValue({ ok: false, motivo: "ajena", nombre: "Beto", desde: "10:00", liberaEnSeg: 60 } as never);
    const r = await guardarBorradorAction("V-1", "{}");
    expect(r.ok).toBe(false);
    expect(r.reservaAjena?.nombre).toBe("Beto");
    expect(guardarBorrador).not.toHaveBeenCalled();
  });

  it("falla en silencio (ok:false) ante visita ajena, payload enorme o error de la base", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue({ ...suya, tecnicoId: 999 } as never);
    expect(await guardarBorradorAction("V-1", "{}")).toEqual({ ok: false });
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(suya as never);
    expect(await guardarBorradorAction("V-1", "x".repeat(3_000_001))).toEqual({ ok: false });
    vi.mocked(guardarBorrador).mockRejectedValue(new Error("boom"));
    expect(await guardarBorradorAction("V-1", "{}")).toEqual({ ok: false });
  });

  it("leer: devuelve el payload guardado, o ok sin payload si no hay", async () => {
    vi.mocked(leerBorrador).mockResolvedValueOnce({ payload: "{}", guardadoEn: "2026-10-28T10:00:00" } as never);
    expect(await leerBorradorAction("V-1")).toEqual({ ok: true, payload: "{}", guardadoEn: "2026-10-28T10:00:00" });
    vi.mocked(leerBorrador).mockResolvedValueOnce(null as never);
    expect(await leerBorradorAction("V-1")).toEqual({ ok: true });
  });

  it("descartar: borra el de este técnico y esta visita", async () => {
    expect(await descartarBorradorAction("V-1")).toEqual({ ok: true });
    expect(borrarBorrador).toHaveBeenCalledWith("V-1", 3);
  });

  it("nadie lee ni borra el borrador de una visita que no es suya", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue({ ...suya, tecnicoId: 999 } as never);
    expect(await leerBorradorAction("V-1")).toEqual({ ok: false });
    expect(await descartarBorradorAction("V-1")).toEqual({ ok: false });
    expect(leerBorrador).not.toHaveBeenCalled();
    expect(borrarBorrador).not.toHaveBeenCalled();
  });

  it("el cliente sube el respaldo SIN fotos (el tope de 1 MB por string de una Server Action no alcanza para base64)", async () => {
    // Regresión de diseño: el payload viaja como string suelto, así que solo
    // es seguro mientras el celular lo mande sin imágenes. Si alguien quita
    // `fotos: []` del hook, este test avisa antes de que el respaldo falle en producción.
    const { readFileSync } = await import("node:fs");
    const fuente = readFileSync("components/mobile/formulario/useFormularioVisita.tsx", "utf8");
    expect(fuente).toMatch(/guardarBorradorAction\(visita\.folio, JSON\.stringify\(\{ \.\.\.b, fotos: \[\], sinFotos: true \}\)\)/);
  });
});

describe("edición del acta ya cerrada", () => {
  const edicion = (extra: Record<string, unknown> = {}) => ({
    folio: "V-1",
    motivoEdicion: "Error de tipeo en el nombre",
    edicionesVistas: 0,
    responsableNombre: "María Soto",
    responsableRut: null,
    responsableTelefono: null,
    motivosCodigos: ["VISITA"],
    observaciones: null,
    comentarioInterno: null,
    internosCodigos: [],
    trabajos: [],
    problemas: [],
    fotosConservadas: [],
    fotosNuevas: [],
    videosIds: [],
    videosInternosIds: [],
    ...extra,
  });

  describe("el técnico (desde el celular, dentro del plazo)", () => {
    beforeEach(() => {
      entrarComo("tecnico");
      vi.mocked(getEquipoDeVisita).mockResolvedValue({ estado: "COMPLETADA", tecnicoId: MIO, tecnicoAyudanteId: null, tomadaPorTecnicoId: MIO });
      vi.mocked(editarActa).mockResolvedValue({ ok: true } as never);
    });

    it("edita con origen MOVIL y respetando el plazo", async () => {
      expect((await editarActaTecnicoAction(edicion() as never)).ok).toBe(true);
      expect(editarActa).toHaveBeenCalledWith(expect.objectContaining({ folio: "V-1" }), { usuarioId: 3, tecnicoId: MIO, origen: "MOVIL", sinPlazo: false });
      expect(revalidatePath).toHaveBeenCalledWith("/admin/visitas/V-1");
    });

    it("sin el permiso «celular.editarActa» no puede", async () => {
      entrarComo("tecnico", { permisos: ["celular.estado"] });
      expect((await editarActaTecnicoAction(edicion() as never)).error).toMatch(/Tu rol no puede editar actas ya cerradas/);
      expect(editarActa).not.toHaveBeenCalled();
    });

    it("exige explicar por qué se edita (queda en el registro)", async () => {
      expect((await editarActaTecnicoAction(edicion({ motivoEdicion: "ok" }) as never)).error).toMatch(/Escribe por qué se edita/);
    });

    it("no edita el acta de una visita ajena", async () => {
      vi.mocked(getEquipoDeVisita).mockResolvedValue({ estado: "COMPLETADA", tecnicoId: 999, tecnicoAyudanteId: null, tomadaPorTecnicoId: null });
      expect((await editarActaTecnicoAction(edicion() as never)).error).toBe("Esa visita no está asignada a ti.");
      vi.mocked(getEquipoDeVisita).mockResolvedValue(null as never);
      expect((await editarActaTecnicoAction(edicion() as never)).error).toBe("No encontramos esa visita.");
    });

    it("si el plazo venció, la capa de datos lo rechaza y se devuelve tal cual (sin revalidar)", async () => {
      vi.mocked(editarActa).mockResolvedValue({ ok: false, error: "Pasó el plazo para editar." } as never);
      expect(await editarActaTecnicoAction(edicion() as never)).toEqual({ ok: false, error: "Pasó el plazo para editar." });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("un cambio del checklist a mitad de la edición se explica", async () => {
      vi.mocked(editarActa).mockRejectedValue(new Error("FOREIGN KEY constraint fk_problema_tipo"));
      expect((await editarActaTecnicoAction(edicion() as never)).error).toMatch(/El checklist cambió mientras editabas/);
    });
  });

  describe("el panel (sin plazo)", () => {
    beforeEach(() => {
      entrarComo("coordinador", { permisos: ["visitas.ver", "visitas.editarActa"] });
      vi.mocked(editarActa).mockResolvedValue({ ok: true } as never);
    });

    it("edita con origen WEB, sin técnico y sin plazo", async () => {
      expect((await editarActaAdminAction(edicion() as never)).ok).toBe(true);
      expect(editarActa).toHaveBeenCalledWith(expect.anything(), { usuarioId: 2, tecnicoId: null, origen: "WEB", sinPlazo: true });
    });

    it("un problema «Otro» sin descripción se rechaza antes de guardar", async () => {
      const r = await editarActaAdminAction(edicion({ problemas: [{ id: null, tipoCodigo: "OTRO", descripcion: " ", items: [] }] }) as never);
      expect(r.error).toMatch(/«Otro»/);
      expect(editarActa).not.toHaveBeenCalled();
    });

    it("permitirEditarTecnico: abre la edición del técnico y lo deja en la auditoría", async () => {
      vi.mocked(habilitarEdicionTecnico).mockResolvedValueOnce(true as never);
      expect(await permitirEditarTecnicoAction("V-1")).toEqual({ ok: true });
      expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "acta.habilitar_tecnico", entidadId: "V-1" }));
      vi.mocked(habilitarEdicionTecnico).mockResolvedValueOnce(false as never);
      expect((await permitirEditarTecnicoAction("V-1")).error).toMatch(/ya está cerrada/);
      expect((await permitirEditarTecnicoAction("")).error).toBe("No encontramos esa visita.");
    });
  });
});

describe("personas del local (datos personales)", () => {
  const personas = [{ nombre: "María Soto", cargo: "Jefa", rut: "11.111.111-1" }];

  beforeEach(() => {
    vi.mocked(listarPersonasLocal).mockResolvedValue(personas as never);
  });

  it("sin sesión, nada", async () => {
    expect(await personasDelLocalAction(5)).toEqual([]);
    expect(listarPersonasLocal).not.toHaveBeenCalled();
  });

  it("un id inválido, nada", async () => {
    entrarComo("admin");
    expect(await personasDelLocalAction(0)).toEqual([]);
    expect(await personasDelLocalAction("x" as never)).toEqual([]);
  });

  it("el panel puede con «ver» o «crear» visitas; sin ninguno de los dos, no", async () => {
    entrarComo("coordinador", { permisos: ["visitas.ver"] });
    expect(await personasDelLocalAction(5)).toEqual(personas);
    entrarComo("coordinador", { permisos: ["visitas.crear"] });
    expect(await personasDelLocalAction(5)).toEqual(personas);
    entrarComo("coordinador", { permisos: ["tecnicos.ver"] });
    expect(await personasDelLocalAction(5)).toEqual([]);
  });

  it("un técnico ve las personas de las tiendas donde tiene visita", async () => {
    entrarComo("tecnico", { permisos: ["celular.estado"] });
    vi.mocked(tecnicoTieneVisitaEn).mockResolvedValue(true);
    expect(await personasDelLocalAction(5)).toEqual(personas);
    expect(tecnicoTieneVisitaEn).toHaveBeenCalledWith(MIO, 5);
    vi.mocked(tecnicoTieneVisitaEn).mockResolvedValue(false);
    expect(await personasDelLocalAction(5)).toEqual([]);
  });

  it("con «agregar visitas en terreno» el técnico ve las de la tienda que elige, aun sin visita previa", async () => {
    entrarComo("tecnico", { permisos: ["celular.crearVisita"] });
    expect(await personasDelLocalAction(5)).toEqual(personas);
    expect(tecnicoTieneVisitaEn).not.toHaveBeenCalled();
  });
});

describe("guardarContactoAction", () => {
  const contacto = (extra: Record<string, unknown> = {}) => ({
    nombre: "Pedro Gómez",
    email: "pedro@example.com",
    telefono: " +56 9 1111 1111 ",
    activo: true,
    cargos: [{ cargo: "Gerente", alcanceTipo: "CLIENTE", alcanceId: 1, alcanceTexto: null }],
    ...extra,
  });

  beforeEach(() => {
    entrarComo("admin");
    vi.mocked(guardarContacto).mockResolvedValue(30);
  });

  it("guarda recortando nombre, correo y teléfono", async () => {
    expect(await guardarContactoAction(null, contacto({ nombre: "  Pedro Gómez " }) as never)).toEqual({ ok: true, id: 30 });
    expect(guardarContacto).toHaveBeenCalledWith(null, expect.objectContaining({ nombre: "Pedro Gómez", telefono: "+56 9 1111 1111" }));
  });

  it("el nombre es obligatorio y el correo debe tener @", async () => {
    expect((await guardarContactoAction(null, contacto({ nombre: "  " }) as never)).error).toBe("El nombre del contacto es obligatorio.");
    expect((await guardarContactoAction(null, contacto({ email: "sin-arroba" }) as never)).error).toBe("Escribe un correo válido.");
  });

  it("un alcance que ya no existe se explica", async () => {
    vi.mocked(guardarContacto).mockRejectedValue(new AlcanceInexistente("cliente" as never));
    expect((await guardarContactoAction(null, contacto() as never)).error).toMatch(/ya no existe\. Recarga la página/);
  });

  it("un fallo inesperado no filtra detalles", async () => {
    vi.mocked(guardarContacto).mockRejectedValue(new Error("Login failed for user 'x'"));
    expect((await guardarContactoAction(null, contacto() as never)).error).toBe("No se pudo guardar. Revisa los datos e inténtalo otra vez.");
  });
});
