import { describe, expect, it, vi } from "vitest";
import { validar, idPositivo, fechaISO, hora, folio } from "@/lib/validacion/comun";
import { entradaCambioPassword, entradaLogin } from "@/lib/validacion/auth";
import {
  entradaCancelarAdmin,
  entradaCambiarEstado,
  entradaEliminarVisitas,
  entradaReprogramar,
  datosVisita,
} from "@/lib/validacion/visitas";
import { entradaRol, entradaTecnico, entradaUsuario } from "@/lib/validacion/maestros";
import { actaEntrada, entradaGuardarBorrador, PAYLOAD_BORRADOR_MAX, trozoVideo } from "@/lib/validacion/actas";
import { borradorChecklist } from "@/lib/validacion/checklist";

const ok = (esquema: Parameters<typeof validar>[0], valor: unknown) => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return validar(esquema, valor, "test").ok;
};

describe("primitivas", () => {
  it("idPositivo: enteros positivos", () => {
    expect(ok(idPositivo, 1)).toBe(true);
    for (const malo of [0, -1, 1.5, "1", null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      expect(ok(idPositivo, malo)).toBe(false);
    }
  });

  it("fechaISO y hora", () => {
    expect(ok(fechaISO, "2026-03-09")).toBe(true);
    expect(ok(fechaISO, "09-03-2026")).toBe(false);
    expect(ok(hora, "08:30")).toBe(true);
    expect(ok(hora, "08:30:15")).toBe(true);
    expect(ok(hora, "8:30")).toBe(false);
  });

  it("folio: de 1 a 16 caracteres", () => {
    expect(ok(folio, "V-0001")).toBe(true);
    expect(ok(folio, "")).toBe(false);
    expect(ok(folio, "x".repeat(17))).toBe(false);
  });
});

describe("validar", () => {
  it("devuelve los datos o el primer mensaje, sin filtrar el valor al log", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validar(idPositivo, 3, "c")).toEqual({ ok: true, datos: 3 });
    const r = validar(entradaReprogramar, { folio: "V1", tecnicoId: 1, fecha: "ayer", hora: null }, "reprogramar");
    expect(r).toEqual({ ok: false, error: "La fecha no es válida." });
    const registrado = aviso.mock.calls.map((c) => String(c[0])).join(" ");
    expect(registrado).toContain("fecha");
    expect(registrado).not.toContain("ayer");
  });

  it("sin mensaje propio usa el genérico con el campo", () => {
    const r = validar(entradaCancelarAdmin, { folio: "V1" }, "c");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Dato no válido: motivo.");
  });
});

describe("login y contraseñas", () => {
  it("acepta credenciales normales", () => {
    expect(ok(entradaLogin, { email: "a@example.com", password: "x" })).toBe(true);
  });

  it("rechaza correo o contraseña absurdamente largos", () => {
    expect(ok(entradaLogin, { email: "a".repeat(161), password: "x" })).toBe(false);
    expect(ok(entradaLogin, { email: "a@example.com", password: "x".repeat(257) })).toBe(false);
    expect(ok(entradaLogin, { email: "a@example.com" })).toBe(false);
    expect(ok(entradaLogin, null)).toBe(false);
  });

  it("cambio de contraseña: el mensaje de largo es el de siempre", () => {
    const r = validar(entradaCambioPassword, { nueva: "x".repeat(300), repetida: "x" }, "c");
    expect(r).toEqual({ ok: false, error: "La contraseña es demasiado larga (máximo 72 caracteres)." });
  });
});

describe("visitas", () => {
  const visita = {
    clienteId: 1,
    sucursalId: 2,
    tecnicoId: 3,
    motivoCodigo: "INSTALACION",
    fechaProgramada: "2026-03-09",
    horaProgramada: "09:00",
    trabajoSolicitado: "Instalar",
    indicacionesAcceso: null,
    responsableNombre: null,
    responsableRut: null,
    responsableTelefono: null,
  };

  it("acepta una visita completa y con campos opcionales vacíos", () => {
    expect(ok(datosVisita, visita)).toBe(true);
    expect(ok(datosVisita, { ...visita, fechaProgramada: "", horaProgramada: null })).toBe(true);
  });

  it("los ids obligatorios fallan con el mensaje de la pantalla", () => {
    const r = validar(datosVisita, { ...visita, tecnicoId: 0 }, "c");
    expect(r).toEqual({ ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." });
  });

  it("rechaza fecha mala, RUT largo y texto gigante", () => {
    expect(ok(datosVisita, { ...visita, fechaProgramada: "mañana" })).toBe(false);
    expect(ok(datosVisita, { ...visita, responsableRut: "1".repeat(13) })).toBe(false);
    expect(ok(datosVisita, { ...visita, trabajoSolicitado: "x".repeat(20_001) })).toBe(false);
  });

  it("cambiar estado solo admite los tres estados del técnico", () => {
    const base = { folio: "V1", motivo: "cliente ausente" };
    for (const estado of ["REAGENDADA", "PENDIENTE", "CANCELADA"]) {
      expect(ok(entradaCambiarEstado, { ...base, estado })).toBe(true);
    }
    expect(ok(entradaCambiarEstado, { ...base, estado: "COMPLETADA" })).toBe(false);
  });

  it("eliminar en lote: tope de folios por tanda", () => {
    const folios = (n: number) => Array.from({ length: n }, (_, i) => `V${i}`);
    expect(ok(entradaEliminarVisitas, { folios: folios(50), total: 50, confirmacion: "ELIMINAR" })).toBe(true);
    expect(ok(entradaEliminarVisitas, { folios: folios(51), total: 51, confirmacion: "ELIMINAR" })).toBe(false);
    expect(ok(entradaEliminarVisitas, { folios: [], total: -1, confirmacion: "x" })).toBe(false);
  });
});

describe("maestros", () => {
  const usuario = { email: "a@example.com", rol: "COORDINADOR", tecnicoId: null, activo: true, password: "" };

  it("usuario: rol dentro de la lista", () => {
    expect(ok(entradaUsuario, { id: null, datos: usuario })).toBe(true);
    expect(ok(entradaUsuario, { id: 4, datos: { ...usuario, rol: "ROOT" } })).toBe(false);
    expect(ok(entradaUsuario, { id: 0, datos: usuario })).toBe(false);
    expect(ok(entradaUsuario, { id: null, datos: { ...usuario, password: "x".repeat(257) } })).toBe(false);
  });

  it("rol: topes de nombre y permisos", () => {
    const rol = { nombre: "Soporte", descripcion: null, permisos: ["visitas.ver"] };
    expect(ok(entradaRol, { id: null, datos: rol })).toBe(true);
    expect(ok(entradaRol, { id: null, datos: { ...rol, nombre: "x".repeat(61) } })).toBe(false);
    expect(ok(entradaRol, { id: null, datos: { ...rol, permisos: Array(301).fill("a.b") } })).toBe(false);
  });

  it("técnico: apellido materno opcional, correo acotado", () => {
    const tecnico = {
      rut: "11.111.111-1",
      nombres: "Ana",
      apellidoPaterno: "Prueba",
      apellidoMaterno: null,
      email: "ana@example.com",
      telefono: null,
      activo: true,
    };
    expect(ok(entradaTecnico, { id: null, datos: tecnico })).toBe(true);
    expect(ok(entradaTecnico, { id: null, datos: { ...tecnico, email: "x".repeat(161) } })).toBe(false);
    expect(ok(entradaTecnico, { id: null, datos: { ...tecnico, activo: "si" } })).toBe(false);
  });
});

describe("acta y borrador", () => {
  const acta = {
    folio: "V1",
    responsableNombre: "Persona de Prueba",
    responsableRut: null,
    responsableTelefono: null,
    motivosCodigos: ["INSTALACION"],
    observaciones: null,
    comentarioInterno: null,
    trabajos: [],
    problemas: [],
    fotos: [],
    firma: { nombre: "Persona", rut: null, dataUrl: "data:image/png;base64,AAAA" },
    dispositivo: null,
  };

  it("acepta un acta mínima", () => {
    expect(ok(actaEntrada, acta)).toBe(true);
  });

  it("la firma y las fotos deben ser data URL de imagen", () => {
    expect(ok(actaEntrada, { ...acta, firma: { ...acta.firma, dataUrl: "http://x/y.png" } })).toBe(false);
    expect(ok(actaEntrada, { ...acta, firma: { ...acta.firma, dataUrl: "data:text/html;base64,AA" } })).toBe(false);
    expect(ok(actaEntrada, { ...acta, fotos: [{ dataUrl: "javascript:alert(1)", etiqueta: null }] })).toBe(false);
  });

  it("tope de fotos y de trabajos", () => {
    const foto = { dataUrl: "data:image/png;base64,AAAA", etiqueta: null };
    expect(ok(actaEntrada, { ...acta, fotos: Array(60).fill(foto) })).toBe(true);
    expect(ok(actaEntrada, { ...acta, fotos: Array(61).fill(foto) })).toBe(false);
  });

  it("borrador: el payload tiene tope", () => {
    expect(ok(entradaGuardarBorrador, { folio: "V1", payload: "x".repeat(PAYLOAD_BORRADOR_MAX) })).toBe(true);
    expect(ok(entradaGuardarBorrador, { folio: "V1", payload: "x".repeat(PAYLOAD_BORRADOR_MAX + 1) })).toBe(false);
  });

  it("trozo de video: no vacío y con offset acotado", () => {
    expect(ok(trozoVideo, { folio: "V1", videoId: 1, desde: 0, trozoBase64: "AAAA" })).toBe(true);
    expect(ok(trozoVideo, { folio: "V1", videoId: 1, desde: 0, trozoBase64: "" })).toBe(false);
    expect(ok(trozoVideo, { folio: "V1", videoId: 1, desde: -1, trozoBase64: "AAAA" })).toBe(false);
  });
});

describe("checklist", () => {
  it("acepta un borrador con altas (id null) y rechaza ids o nombres inválidos", () => {
    const motivo = { id: null, nombre: "Instalación" };
    expect(ok(borradorChecklist, { motivos: [motivo], problemas: [], trabajos: [] })).toBe(true);
    expect(ok(borradorChecklist, { motivos: [{ id: 0, nombre: "x" }], problemas: [], trabajos: [] })).toBe(false);
    expect(ok(borradorChecklist, { motivos: [{ id: null, nombre: "x".repeat(81) }], problemas: [], trabajos: [] })).toBe(
      false
    );
    expect(ok(borradorChecklist, { motivos: [] })).toBe(false);
  });
});
