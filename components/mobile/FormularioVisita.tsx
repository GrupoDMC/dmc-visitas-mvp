"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import Confirmar, { type ConfirmarCfg } from "./Confirmar";
import CamaraSheet from "./CamaraSheet";
import FirmaSheet, { type FirmaGuardada } from "./FirmaSheet";
import { Toast, useToast } from "./toast";
import { fmtRut, fmtTel, rutCompleto, telCompleto } from "@/lib/ui/formato";
import { ESTADO_PROBLEMA_LABEL } from "@/lib/ui/estado";
import type {
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoTrabajo,
  EstadoProblema,
  Visita,
} from "@/lib/types";

interface TrabajoForm {
  id: number;
  codigo: string;
  subs: string[];
  detalle: string;
}
interface ProblemaItemForm {
  etiqueta: string;
  cantidad: number;
}
interface ProblemaForm {
  id: number;
  codigo: string;
  items: ProblemaItemForm[];
  desc: string;
  sol: string;
  estado: EstadoProblema;
}
interface FotoForm {
  id: number;
  src: string;
}

type Seccion = "sucursal" | "motivo" | "problemas" | "fotos" | "firmas";
const SECCIONES: Seccion[] = ["sucursal", "motivo", "problemas", "fotos", "firmas"];

const ESTADOS_PROBLEMA: EstadoProblema[] = ["ABIERTO", "PENDIENTE", "RESUELTO"];

let autoId = 1;

export default function FormularioVisita({
  visita,
  motivos,
  catalogoTrabajo,
  catalogoProblema,
}: {
  visita: Visita;
  motivos: CatalogoMotivo[];
  catalogoTrabajo: CatalogoTrabajo[];
  catalogoProblema: CatalogoProblema[];
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();

  const [paso, setPaso] = useState<"form" | "preview" | "ok">("form");
  const [abierta, setAbierta] = useState<Seccion | null>("sucursal");
  const [guardadas, setGuardadas] = useState<Partial<Record<Seccion, boolean>>>({});
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [horaInicio, setHoraInicio] = useState("—");
  const [horaTermino, setHoraTermino] = useState("—");

  // 1 · Sucursal y responsable
  const [respNombre, setRespNombre] = useState(visita.responsableNombre ?? "");
  const [respRut, setRespRut] = useState(fmtRut(visita.ejecucion?.responsableRut ?? ""));
  const [respTel, setRespTel] = useState(fmtTel(visita.responsableTelefono ?? ""));

  // 2 · Motivo y trabajo realizado
  const [motivoCodigo, setMotivoCodigo] = useState(visita.motivoCodigo);
  const [obs, setObs] = useState("");
  const [trabajos, setTrabajos] = useState<TrabajoForm[]>([]);

  // 3 · Problemas detectados
  const [problemas, setProblemas] = useState<ProblemaForm[]>([]);
  const [interno, setInterno] = useState("");

  // 4 · Fotos
  const [fotos, setFotos] = useState<FotoForm[]>([]);

  // 5 · Firma
  const [firma, setFirma] = useState<FirmaGuardada | null>(null);

  // Hojas inferiores
  const [sheet, setSheet] = useState<"trabajo" | "problema" | "firma" | "camara" | null>(null);
  const [nt, setNt] = useState<{ codigo: string; subs: string[]; detalle: string }>({ codigo: "", subs: [], detalle: "" });
  const [np, setNp] = useState<{ codigo: string; items: ProblemaItemForm[]; desc: string; sol: string; estado: EstadoProblema }>({
    codigo: "",
    items: [],
    desc: "",
    sol: "",
    estado: "ABIERTO",
  });

  useEffect(() => {
    setHoraInicio(ahora());
  }, []);

  const nGuardadas = SECCIONES.filter((k) => guardadas[k]).length;
  const puedeRevisar = !!guardadas.sucursal && !!guardadas.motivo;
  const puedeGuardar = puedeRevisar && !!firma;

  const falta = useMemo(() => {
    const f: string[] = [];
    if (!guardadas.sucursal) f.push("los datos del responsable");
    if (!guardadas.motivo) f.push("el motivo");
    if (!firma) f.push("la firma de la tienda");
    return f;
  }, [guardadas.sucursal, guardadas.motivo, firma]);

  function guardarSeccion(clave: Seccion, etiqueta: string) {
    setGuardadas((g) => ({ ...g, [clave]: true }));
    setAbierta(null);
    aviso(`${etiqueta} guardada`);
  }

  function toggleSeccion(clave: Seccion) {
    setAbierta((a) => (a === clave ? null : clave));
  }

  const nombreMotivo = (codigo: string) => motivos.find((m) => m.codigo === codigo)?.nombre ?? "Sin motivo";
  const nombreTrabajo = (codigo: string) => catalogoTrabajo.find((t) => t.codigo === codigo)?.nombre ?? "Trabajo";
  const nombreProblema = (codigo: string) => catalogoProblema.find((p) => p.codigo === codigo)?.nombre ?? "Problema";

  // ─────────────────────────────── pantalla OK ───────────────────────────────
  if (paso === "ok") {
    return (
      <div className="px-4 pt-11 pb-6.5 flex flex-col min-h-[70vh] animate-fade-in">
        <div className="w-14 h-14 bg-[var(--color-accent)] grid place-items-center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="2.6">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
        <h1 className="font-extrabold text-[34px] leading-[1.05] tracking-[-.03em] mt-5 mb-2">
          Visita
          <br />
          guardada
        </h1>
        <div className="text-[13px] tabular-nums opacity-60">
          {visita.folio} · {visita.sucursal?.nombre} · {horaTermino}
        </div>
        <div className="h-0.5 bg-[var(--color-divider)] mt-5 mb-4" />
        <div className="flex gap-2.5 items-start px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
          <div className="text-[13px]">Enviada al servidor. Coordinación ya la ve en el panel.</div>
        </div>
        <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
          <button
            onClick={() => router.push("/tecnico/visitas")}
            className="w-full min-h-[58px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
          >
            <span>Siguiente visita</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <button
            onClick={() => setPaso("preview")}
            className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Ver el acta guardada
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────── pantalla PREVIEW ─────────────────────────────
  if (paso === "preview") {
    const resumen: { k: string; v: string }[] = [
      { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
      { k: "Sucursal", v: `${visita.sucursal?.nombre} · ${visita.sucursal?.direccion}, ${visita.sucursal?.comuna}` },
      { k: "Motivo de la visita", v: nombreMotivo(motivoCodigo) },
      { k: "Nombre", v: respNombre || "—" },
      { k: "Rut", v: respRut || "Sin RUT" },
      { k: "Teléfono de contacto", v: respTel || "—" },
      { k: "Observación escrita del técnico", v: obs || "Sin observaciones." },
    ];
    if (interno) resumen.push({ k: "Comentario interno (no lo ve el cliente)", v: interno });

    return (
      <div className="animate-fade-in">
        <div className="px-4 pt-5">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Antes de guardar</div>
          <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] mt-2 mb-1.5">
            Revisa lo que
            <br />
            se va a guardar
          </h1>
          <p className="m-0 mb-4 text-sm opacity-60">Lee cada punto con el encargado de la tienda antes de confirmar.</p>
        </div>

        <div className="mx-4 border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <div className="px-4 py-3.5 border-b-2 border-[var(--color-divider)] flex items-center gap-2.5">
            <div className="font-extrabold text-[13px] tracking-[.06em] uppercase">Acta de visita</div>
            <span className="tag tag-accent ml-auto">Quedará Completada</span>
          </div>
          <div className="px-4 pt-1 pb-3.5">
            {resumen.map((r) => (
              <div key={r.k} className="py-3.5 border-b border-black/[.2]">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66">{r.k}</div>
                <div className="text-[17px] leading-[1.4] mt-1.5">{r.v}</div>
              </div>
            ))}

            {trabajos.length > 0 ? (
              <div className="pt-3.5">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Trabajo realizado</div>
                <div className="flex flex-col gap-2.5">
                  {trabajos.map((t) => (
                    <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3">
                      <div className="font-extrabold text-base leading-[1.25]">{nombreTrabajo(t.codigo)}</div>
                      {t.subs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {t.subs.map((s) => (
                            <span key={s} className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {problemas.length > 0 ? (
              <div className="pt-3.5">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Problemas detectados</div>
                <div className="flex flex-col gap-2.5">
                  {problemas.map((p) => (
                    <div key={p.id} className="border-l-[3px] border-[var(--color-accent)] pl-3">
                      <div className="font-extrabold text-base leading-[1.25]">{nombreProblema(p.codigo)}</div>
                      {p.items.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {p.items.map((z) => (
                            <span
                              key={z.etiqueta}
                              className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                            >
                              {z.etiqueta} × {z.cantidad}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {p.desc ? <div className="text-sm opacity-72 mt-1.5">{p.desc}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {fotos.length > 0 ? (
              <div className="pt-4">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">Fotos ({fotos.length})</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {fotos.map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f.id}
                      src={f.src}
                      alt=""
                      className="w-full aspect-square object-cover grayscale contrast-125 border border-black/[.3]"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {firma ? (
              <div className="flex gap-3.5 pt-4.5">
                <div className="flex-[0_1_250px] min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={firma.imagen} alt="Firma" className="w-full h-[60px] object-contain object-left-bottom" />
                  <div className="h-px bg-[var(--color-text)] mt-1" />
                  <div className="text-xs mt-1.5">
                    {firma.nombre}
                    {firma.rut ? ` · ${firma.rut}` : ""}
                  </div>
                  <div className="text-[10px] tracking-[.09em] uppercase opacity-62">Responsable de tienda</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 pt-4.5 pb-6.5">
          {falta.length > 0 ? (
            <div className="px-3.5 py-3 mb-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)]">
              Falta {falta.join(", ")}.
            </div>
          ) : null}
          <button
            onClick={() => {
              if (!puedeGuardar) return aviso(`Falta ${falta.join(", ")}`);
              setHoraTermino(ahora());
              setPaso("ok");
            }}
            className="w-full min-h-[62px] flex items-center justify-between px-4.5 border-0 font-extrabold text-[17px] cursor-pointer text-left hover:brightness-95"
            style={{
              background: puedeGuardar ? "var(--color-accent)" : "#8f8b8b",
              color: puedeGuardar ? "var(--color-bg)" : "var(--color-surface-3)",
            }}
          >
            <span>Guardar visita</span>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </button>
          <button
            onClick={() => setPaso("form")}
            className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Volver a corregir
          </button>
        </div>
        <Toast texto={toast} />
      </div>
    );
  }

  // ────────────────────────────── pantalla FORM ──────────────────────────────
  const trbSel = catalogoTrabajo.find((t) => t.codigo === nt.codigo) ?? null;
  const probSel = catalogoProblema.find((p) => p.codigo === np.codigo) ?? null;
  const probTieneOpciones = !!probSel && probSel.opciones.length > 0;
  const probListo = !!np.codigo && (probTieneOpciones ? np.items.length > 0 : !!np.desc.trim());
  const sucursalCompleta = !!respNombre.trim() && rutCompleto(respRut) && telCompleto(respTel);

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-4.5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="text-xs tabular-nums tracking-[.08em] opacity-66">{visita.folio}</div>
          <span className="tag tag-accent">En curso desde {horaInicio}</span>
        </div>
        <h1 className="font-extrabold text-2xl leading-[1.1] tracking-[-.025em] mt-2.5 mb-0.5">{visita.sucursal?.nombre}</h1>
        <div className="text-[13px] opacity-66">
          {visita.cliente?.nombreFantasia} · {nombreMotivo(visita.motivoCodigo)}
        </div>
        <div className="flex gap-1.5 mt-4">
          {SECCIONES.map((k) => (
            <div key={k} className="flex-1 h-1.5" style={{ background: guardadas[k] ? "var(--color-accent)" : "var(--color-neutral-300)" }} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] tracking-[.09em] uppercase opacity-62">
          <span>{nGuardadas} de 5 secciones guardadas</span>
          <span>Cada una se guarda sola</span>
        </div>
      </div>

      <div className="border-t-2 border-[var(--color-divider)]">
        {/* ── 1 · Sucursal y responsable ── */}
        <Cabecera
          n={1}
          titulo="Sucursal y responsable"
          ok={!!guardadas.sucursal}
          chip={guardadas.sucursal ? { variante: "accent", texto: "Guardada" } : { variante: "neutral", texto: "Pendiente" }}
          onToggle={() => toggleSeccion("sucursal")}
        />
        {abierta === "sucursal" ? (
          <Cuerpo>
            <Campo label="Responsable de tienda" htmlFor="f-nom">
              <input
                id="f-nom"
                value={respNombre}
                onChange={(e) => setRespNombre(e.target.value)}
                placeholder="Nombre y apellido"
                className={entrada}
              />
            </Campo>
            <div className="flex gap-3">
              <Campo label="RUT" htmlFor="f-rut" className="flex-1 min-w-0">
                <input
                  id="f-rut"
                  inputMode="numeric"
                  value={respRut}
                  onChange={(e) => setRespRut(fmtRut(e.target.value))}
                  placeholder="11.111.111-1"
                  className={`${entrada} tabular-nums`}
                />
              </Campo>
              <Campo label="Teléfono" htmlFor="f-tel" className="flex-1 min-w-0">
                <input
                  id="f-tel"
                  inputMode="tel"
                  value={respTel}
                  onChange={(e) => setRespTel(fmtTel(e.target.value))}
                  onFocus={() => {
                    if (!respTel) setRespTel("+56 9 ");
                  }}
                  placeholder="+56 9 1234 5678"
                  className={`${entrada} tabular-nums`}
                />
              </Campo>
            </div>
            {!sucursalCompleta ? (
              <p className="m-0 text-xs text-[var(--color-accent-800)]">
                Completa nombre, RUT y teléfono del responsable para poder guardar esta sección.
              </p>
            ) : null}
            <BotonGuardar
              texto="Guardar esta sección"
              habilitado={sucursalCompleta}
              onClick={() => {
                if (!respNombre.trim()) return aviso("Falta el nombre del responsable de tienda");
                if (!rutCompleto(respRut)) return aviso("El RUT del responsable está incompleto");
                if (!telCompleto(respTel)) return aviso("El teléfono del responsable está incompleto");
                guardarSeccion("sucursal", "Sección responsable");
              }}
            />
          </Cuerpo>
        ) : null}

        {/* ── 2 · Motivo y trabajo realizado ── */}
        <Cabecera
          n={2}
          titulo="Motivo y trabajo realizado"
          ok={!!guardadas.motivo}
          chip={
            guardadas.motivo
              ? { variante: "accent", texto: `${trabajos.length} ${trabajos.length === 1 ? "trabajo" : "trabajos"}` }
              : { variante: "neutral", texto: "Pendiente" }
          }
          onToggle={() => toggleSeccion("motivo")}
        />
        {abierta === "motivo" ? (
          <Cuerpo>
            <Campo label="Motivo de la visita" htmlFor="f-mot">
              <div className="relative">
                <select
                  id="f-mot"
                  value={motivoCodigo}
                  onChange={(e) => setMotivoCodigo(e.target.value)}
                  className="w-full min-h-[54px] pl-3.5 pr-11 py-3 text-base bg-[var(--color-surface-3)] border border-[var(--color-divider)] text-[var(--color-text)] rounded-none appearance-none focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
                >
                  <option value="">Elegir motivo…</option>
                  {motivos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </Campo>

            <div>
              <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">Trabajo realizado</div>
              <p className="m-0 mb-3.5 text-[13px] opacity-60">
                Agrega cada trabajo que ejecutaste. La lista y sus subtrabajos vienen del checklist del panel de administración.
              </p>
              <div className="flex flex-col gap-2.5">
                {trabajos.map((t, i) => (
                  <div key={t.id} className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] border-l-4 border-l-[var(--color-accent)] px-3.5 py-3">
                    <div className="text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">Trabajo {i + 1}</div>
                    <div className="font-extrabold text-base leading-[1.25] mt-1.5">{nombreTrabajo(t.codigo)}</div>
                    {t.subs.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {t.subs.map((s) => (
                          <span key={s} className="px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {t.detalle ? <div className="text-sm opacity-75 mt-1.5">{t.detalle}</div> : null}
                    <button
                      onClick={() =>
                        setConfirmar({
                          titulo: "¿Quitar este trabajo?",
                          texto: `«${nombreTrabajo(t.codigo)}» se borra del trabajo realizado de esta visita.`,
                          cta: "Quitar trabajo",
                          accion: () => setTrabajos((prev) => prev.filter((x) => x.id !== t.id)),
                        })
                      }
                      className="min-h-10 mt-1.5 p-0 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setNt({ codigo: "", subs: [], detalle: "" });
                  setSheet("trabajo");
                }}
                className="w-full min-h-[54px] flex items-center gap-2.5 px-4 mt-3 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Agregar trabajo realizado</span>
              </button>
            </div>

            <Campo
              label="Observación escrita"
              htmlFor="f-obs"
              extra="(opcional · la ve el cliente)"
            >
              <textarea
                id="f-obs"
                rows={3}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Algo que no calce con la lista: detalles del local, del acceso o del equipo"
                className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>

            <BotonGuardar
              texto={trabajos.length ? `Guardar ${trabajos.length} trabajo${trabajos.length > 1 ? "s" : ""}` : "Guardar esta sección"}
              habilitado={!!motivoCodigo && trabajos.length > 0}
              onClick={() => {
                if (!motivoCodigo) return aviso("Elige el motivo de la visita");
                if (!trabajos.length) return aviso("Agrega al menos un trabajo realizado");
                guardarSeccion("motivo", "Sección trabajo realizado");
              }}
            />
          </Cuerpo>
        ) : null}

        {/* ── 3 · Problemas detectados ── */}
        <Cabecera
          n={3}
          titulo="Problemas detectados"
          ok={!!guardadas.problemas}
          chip={
            guardadas.problemas
              ? { variante: "accent", texto: problemas.length ? `${problemas.length} cargados` : "Sin problemas" }
              : problemas.length
                ? { variante: "outline", texto: `${problemas.length} sin guardar` }
                : { variante: "neutral", texto: "Opcional" }
          }
          onToggle={() => toggleSeccion("problemas")}
        />
        {abierta === "problemas" ? (
          <Cuerpo gap={false}>
            <p className="m-0 mb-3.5 text-[13px] opacity-60">Cada problema se llena en su propia ficha para no saturar esta pantalla.</p>
            <div className="flex flex-col gap-2.5">
              {problemas.map((p, i) => (
                <div key={p.id} className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] border-l-4 border-l-[var(--color-accent)] px-3.5 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">Problema {i + 1}</span>
                    <span className={`tag tag-${p.estado === "RESUELTO" ? "neutral" : p.estado === "PENDIENTE" ? "outline" : "accent"} ml-auto`}>
                      {ESTADO_PROBLEMA_LABEL[p.estado]}
                    </span>
                  </div>
                  <div className="font-extrabold text-base leading-[1.25] mt-2">{nombreProblema(p.codigo)}</div>
                  {p.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.items.map((z) => (
                        <span
                          key={z.etiqueta}
                          className="px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                        >
                          {z.etiqueta} × {z.cantidad}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {p.desc ? <div className="text-sm opacity-75 mt-2">{p.desc}</div> : null}
                  {p.sol ? (
                    <div className="text-[13px] opacity-66 mt-1.5 pt-1.5 border-t border-black/[.2]">Sugerido: {p.sol}</div>
                  ) : null}
                  <button
                    onClick={() =>
                      setConfirmar({
                        titulo: "¿Quitar este problema?",
                        texto: `Se borra de esta visita lo que anotaste sobre «${nombreProblema(p.codigo)}».`,
                        cta: "Quitar problema",
                        accion: () => setProblemas((prev) => prev.filter((x) => x.id !== p.id)),
                      })
                    }
                    className="min-h-10 mt-2 p-0 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--color-divider-soft)]">
              <Campo label="Comentario interno" htmlFor="f-int" extra="(opcional · no lo ve el cliente)">
                <textarea
                  id="f-int"
                  rows={2}
                  value={interno}
                  onChange={(e) => setInterno(e.target.value)}
                  placeholder="Solo para coordinación: algo que deba saber del local, del acceso o del equipo"
                  className={`${entrada} min-h-[80px] leading-[1.4] resize-y`}
                />
              </Campo>
            </div>

            <button
              onClick={() => {
                setNp({ codigo: "", items: [], desc: "", sol: "", estado: "ABIERTO" });
                setSheet("problema");
              }}
              className="w-full min-h-[54px] flex items-center gap-2.5 px-4 mt-3 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Agregar un problema</span>
            </button>
            <div className="mt-2.5">
              <BotonGuardar
                texto={problemas.length ? `Guardar ${problemas.length} problema${problemas.length > 1 ? "s" : ""}` : "Guardar sin problemas"}
                habilitado
                onClick={() => guardarSeccion("problemas", problemas.length ? "Problemas detectados" : "Sección sin problemas")}
              />
            </div>
          </Cuerpo>
        ) : null}

        {/* ── 4 · Fotos del trabajo ── */}
        <Cabecera
          n={4}
          titulo="Fotos del trabajo"
          ok={!!guardadas.fotos}
          chip={guardadas.fotos ? { variante: "accent", texto: `${fotos.length} fotos` } : { variante: "neutral", texto: "Al final" }}
          onToggle={() => toggleSeccion("fotos")}
        />
        {abierta === "fotos" ? (
          <Cuerpo gap={false}>
            <p className="m-0 mb-3.5 text-[13px] opacity-60">
              Al final del trabajo: pórtico terminado, etiqueta de serie y cada problema que dejes anotado.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((f) => (
                <div key={f.id} className="relative aspect-square border border-[var(--color-divider)] overflow-hidden bg-[var(--color-neutral-300)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt="" className="w-full h-full object-cover grayscale contrast-125" />
                  <button
                    onClick={() =>
                      setConfirmar({
                        titulo: "¿Borrar esta foto?",
                        texto: "La foto se quita del acta y hay que volver a tomarla si la necesitas.",
                        cta: "Borrar foto",
                        accion: () => setFotos((prev) => prev.filter((x) => x.id !== f.id)),
                      })
                    }
                    aria-label="Quitar foto"
                    className="absolute top-0 right-0 w-8 h-8 grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] border-0 cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSheet("camara")}
                className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-black/[.5] cursor-pointer bg-[var(--color-text)] text-[var(--color-bg)] overflow-hidden hover:bg-[var(--color-neutral-900)]"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
                <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Cámara</span>
              </button>
              <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-black/[.5] cursor-pointer bg-[var(--color-surface-3)] overflow-hidden hover:bg-[#eeeaea]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#201e1d" strokeWidth="1.8">
                  <path d="M4 5h16v14H4z" />
                  <path d="M4 16l5-5 4 4 3-3 4 4" />
                  <circle cx="9" cy="9" r="1.4" />
                </svg>
                <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Galería</span>
                <input type="file" accept="image/*" multiple onChange={onArchivos} className="absolute w-px h-px opacity-0 pointer-events-none" />
              </label>
            </div>
            <div className="mt-3.5">
              <BotonGuardar
                texto={fotos.length ? `Guardar ${fotos.length} foto${fotos.length > 1 ? "s" : ""}` : "Guardar sin fotos"}
                habilitado
                onClick={() => guardarSeccion("fotos", fotos.length ? `${fotos.length} fotos` : "Sección sin fotos")}
              />
            </div>
          </Cuerpo>
        ) : null}

        {/* ── 5 · Firma de la tienda ── */}
        <Cabecera
          n={5}
          titulo="Firma de la tienda"
          ok={!!firma}
          chip={firma ? { variante: "accent", texto: "Firmada" } : { variante: "neutral", texto: "Pendiente" }}
          onToggle={() => toggleSeccion("firmas")}
        />
        {abierta === "firmas" ? (
          <Cuerpo>
            <div className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Responsable de tienda</div>
                <span className={`tag ${firma ? "tag-accent" : "tag-neutral"} ml-auto`}>
                  {firma ? `Firmado ${firma.hora}` : "Sin firmar"}
                </span>
              </div>
              <div className="font-extrabold text-[15px] leading-[1.2] mt-1.5">
                {firma?.nombre || respNombre || visita.responsableNombre || "Encargado de tienda"}
              </div>
              {firma ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={firma.imagen}
                  alt="Firma"
                  className="w-full h-[76px] object-contain object-left mt-2 border-b border-black/[.35]"
                />
              ) : null}
              <button
                onClick={() => setSheet("firma")}
                className="w-full min-h-[50px] flex items-center justify-between px-3.5 mt-3 border border-[var(--color-divider)] font-extrabold text-sm cursor-pointer text-left"
                style={{
                  background: firma ? "transparent" : "var(--color-accent)",
                  color: firma ? "var(--color-text)" : "var(--color-bg)",
                }}
              >
                <span>{firma ? "Volver a firmar" : "Firmar"}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 20c4 0 5-14 9-14s2 9 5 9 4-3 4-3" />
                </svg>
              </button>
            </div>
            <BotonGuardar
              texto="Guardar esta sección"
              habilitado={!!firma}
              onClick={() => {
                if (!firma) return aviso("Falta la firma del responsable de tienda");
                guardarSeccion("firmas", "Firma de tienda");
              }}
            />
          </Cuerpo>
        ) : null}
      </div>

      <div className="px-4 pt-5 pb-6.5">
        <button
          onClick={() => {
            if (!puedeRevisar) return aviso("Guarda al menos responsable y motivo");
            setHoraTermino(ahora());
            setPaso("preview");
          }}
          className="w-full min-h-[60px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
          style={{
            background: puedeRevisar ? "var(--color-accent)" : "#8f8b8b",
            color: puedeRevisar ? "var(--color-bg)" : "var(--color-surface-3)",
          }}
        >
          <span>Revisar y guardar</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="mt-2.5 mb-0 text-xs opacity-66">
          {puedeRevisar
            ? "Vas a ver el acta completa antes de guardar nada."
            : "Guarda las secciones 1 y 2 para poder revisar el acta."}
        </p>
      </div>

      {/* ── Hoja: agregar trabajo realizado ── */}
      {sheet === "trabajo" ? (
        <Sheet titulo="Trabajo realizado" onClose={() => setSheet(null)}>
          <div className="px-4 pt-4 pb-5.5 flex flex-col gap-4.5">
            <div>
              <PasoTitulo n="1" texto="¿Qué trabajo hiciste?" />
              <div className="flex flex-col gap-1.5">
                {catalogoTrabajo.map((t) => {
                  const activo = nt.codigo === t.codigo;
                  return (
                    <button
                      key={t.codigo}
                      onClick={() => setNt({ codigo: t.codigo, subs: [], detalle: nt.detalle })}
                      className="w-full min-h-[54px] flex items-center gap-3 px-3.5 font-extrabold text-[15px] leading-[1.2] cursor-pointer text-left hover:brightness-95"
                      style={{
                        background: activo ? "var(--color-text)" : "var(--color-surface-3)",
                        color: activo ? "var(--color-bg)" : "var(--color-text)",
                        border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
                      }}
                    >
                      <span className="w-[18px] h-[18px] flex-none border-2 border-current grid place-items-center">
                        {activo ? <span className="w-2 h-2 bg-current" /> : null}
                      </span>
                      <span>{t.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {trbSel && trbSel.subtrabajos.length > 0 ? (
              <div>
                <PasoTitulo n="2" texto={trbSel.grupoLabel ?? "Subtrabajos"} />
                <div className="flex flex-col gap-1.5">
                  {trbSel.subtrabajos.map((s) => {
                    const activo = nt.subs.includes(s.etiqueta);
                    return (
                      <button
                        key={s.id}
                        onClick={() =>
                          setNt((p) => ({
                            ...p,
                            subs: activo ? p.subs.filter((x) => x !== s.etiqueta) : [...p.subs, s.etiqueta],
                          }))
                        }
                        className="w-full min-h-[52px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.2] text-[var(--color-text)] cursor-pointer text-left hover:brightness-95"
                        style={{
                          background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                          border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                          fontWeight: activo ? 800 : 400,
                        }}
                      >
                        <span
                          className="w-[18px] h-[18px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                          style={{ background: activo ? "var(--color-text)" : "transparent" }}
                        >
                          {activo ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.2">
                              <path d="M4 12l5 5L20 6" />
                            </svg>
                          ) : null}
                        </span>
                        <span>{s.etiqueta}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <PasoTitulo n={trbSel && trbSel.subtrabajos.length > 0 ? "3" : "2"} texto="Detalle (opcional)" />
              <textarea
                rows={2}
                value={nt.detalle}
                onChange={(e) => setNt((p) => ({ ...p, detalle: e.target.value }))}
                placeholder="Pórtico 2: se calibró y quedó midiendo 1,1 m"
                className={`${entradaSheet} min-h-[78px] leading-[1.4] resize-y`}
              />
            </div>

            <button
              onClick={() => {
                if (!nt.codigo) return aviso("Elige el trabajo realizado");
                if (trbSel && trbSel.subtrabajos.length > 0 && nt.subs.length === 0) {
                  return aviso(`Marca al menos un ${trbSel.singular ?? "subtrabajo"}`);
                }
                setTrabajos((prev) => [...prev, { id: autoId++, codigo: nt.codigo, subs: [...nt.subs], detalle: nt.detalle.trim() }]);
                setGuardadas((g) => ({ ...g, motivo: false }));
                setSheet(null);
                aviso("Trabajo agregado");
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: nt.codigo ? "var(--color-accent)" : "#8f8b8b",
                color: nt.codigo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>Agregar a la visita</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* ── Hoja: agregar un problema ── */}
      {sheet === "problema" ? (
        <Sheet titulo="Nuevo problema" onClose={() => setSheet(null)}>
          <div className="p-4 flex flex-col gap-3.5">
            <div>
              <PasoTitulo n="1" texto="¿Qué tipo de problema es?" />
              <div className="flex flex-col gap-1.5">
                {catalogoProblema.map((t) => {
                  const activo = np.codigo === t.codigo;
                  return (
                    <button
                      key={t.codigo}
                      onClick={() => setNp((p) => ({ ...p, codigo: t.codigo, items: [] }))}
                      className="w-full min-h-[54px] flex items-center gap-3 px-3.5 font-extrabold text-[15px] leading-[1.3] cursor-pointer text-left"
                      style={{
                        background: activo ? "var(--color-text)" : "var(--color-surface-3)",
                        color: activo ? "var(--color-bg)" : "var(--color-text)",
                        border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
                      }}
                    >
                      <span className="w-[18px] h-[18px] flex-none border-2 border-current grid place-items-center">
                        {activo ? <span className="w-2 h-2 bg-current" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">{t.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {probSel && probSel.opciones.length > 0 ? (
              <div className="border-t border-black/[.3] pt-4">
                <PasoTitulo n="2" texto={probSel.grupoLabel ?? "Detalle"} />
                <p className="m-0 mb-3 ml-[33px] text-[13px] opacity-60">
                  {probSel.ayuda ?? `Marca ${(probSel.grupoLabel ?? "el detalle").toLowerCase()} y ajusta la cantidad.`}
                </p>
                <div className="flex flex-col gap-2">
                  {probSel.opciones.map((o) => {
                    const item = np.items.find((x) => x.etiqueta === o.etiqueta);
                    const activo = !!item;
                    return (
                      <div key={o.id} className="flex items-stretch gap-2">
                        <button
                          onClick={() =>
                            setNp((p) => ({
                              ...p,
                              items: activo
                                ? p.items.filter((x) => x.etiqueta !== o.etiqueta)
                                : [...p.items, { etiqueta: o.etiqueta, cantidad: 1 }],
                            }))
                          }
                          className="flex-1 min-w-0 min-h-[58px] flex items-center gap-3 px-3.5 text-base leading-[1.3] text-[var(--color-text)] cursor-pointer text-left"
                          style={{
                            background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                            border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                            fontWeight: activo ? 800 : 400,
                          }}
                        >
                          <span
                            className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                            style={{ background: activo ? "var(--color-accent)" : "transparent" }}
                          >
                            {activo ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0">{o.etiqueta}</span>
                        </button>
                        {activo ? (
                          <div className="flex-none flex items-center border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
                            <button
                              onClick={() => cambiarCantidad(o.etiqueta, -1)}
                              aria-label="Quitar uno"
                              className="w-[46px] min-h-[58px] bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none"
                            >
                              −
                            </button>
                            <div className="min-w-[30px] text-center font-extrabold text-[19px] leading-none tabular-nums">{item!.cantidad}</div>
                            <button
                              onClick={() => cambiarCantidad(o.etiqueta, 1)}
                              aria-label="Agregar uno"
                              className="w-[46px] min-h-[58px] bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none"
                            >
                              +
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 mb-0 text-xs opacity-62">Toca para marcar; con − y + ajustas la cantidad.</p>
              </div>
            ) : null}

            {np.codigo ? (
              <div className="border-t border-black/[.3] pt-4">
                <PasoTitulo n={probTieneOpciones ? "3" : "2"} texto="¿Cómo queda?" />
                <div className="flex flex-col gap-1.5">
                  {ESTADOS_PROBLEMA.map((e) => {
                    const activo = np.estado === e;
                    return (
                      <button
                        key={e}
                        onClick={() => setNp((p) => ({ ...p, estado: e }))}
                        className="w-full min-h-[50px] flex items-center px-3.5 border border-black/[.35] text-[15px] leading-[1.3] cursor-pointer text-left"
                        style={{
                          background: activo ? "var(--color-text)" : "transparent",
                          color: activo ? "var(--color-bg)" : "var(--color-text)",
                          fontWeight: activo ? 800 : 400,
                        }}
                      >
                        {e === "PENDIENTE" ? "Pendiente de repuesto" : ESTADO_PROBLEMA_LABEL[e]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <Campo label={probTieneOpciones ? "Nota corta" : "Qué encontraste"} htmlFor="p-desc" extra={probTieneOpciones ? "(opcional)" : undefined}>
              <textarea
                id="p-desc"
                rows={2}
                value={np.desc}
                onChange={(e) => setNp((p) => ({ ...p, desc: e.target.value }))}
                placeholder="Ej: las placas del pórtico 1 están quemadas"
                className={`${entradaSheet} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>

            <Campo label="Qué hiciste o qué se sugiere" htmlFor="p-sol" extra="(opcional)">
              <textarea
                id="p-sol"
                rows={2}
                value={np.sol}
                onChange={(e) => setNp((p) => ({ ...p, sol: e.target.value }))}
                placeholder="Cambiar tarjeta electrónica; queda cotizado"
                className={`${entradaSheet} min-h-[78px] leading-[1.4] resize-y`}
              />
            </Campo>

            <button
              onClick={() => {
                if (!np.codigo) return aviso("Elige primero el tipo de problema");
                if (probTieneOpciones && np.items.length === 0) {
                  return aviso(`Marca al menos un ${probSel?.singular ?? "detalle"}`);
                }
                if (!probTieneOpciones && !np.desc.trim()) return aviso("Escribe qué encontraste");
                setProblemas((prev) => [
                  ...prev,
                  { id: autoId++, codigo: np.codigo, items: [...np.items], desc: np.desc.trim(), sol: np.sol.trim(), estado: np.estado },
                ]);
                setGuardadas((g) => ({ ...g, problemas: false }));
                setSheet(null);
                setAbierta("problemas");
                aviso("Problema agregado a la ficha");
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: probListo ? "var(--color-accent)" : "#8f8b8b",
                color: probListo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>Agregar a la visita</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === "firma" ? (
        <FirmaSheet
          nombreInicial={respNombre || visita.responsableNombre || ""}
          rutInicial={respRut}
          onAviso={aviso}
          onCerrar={() => setSheet(null)}
          onConfirmar={(f) => {
            setFirma(f);
            setSheet(null);
            setAbierta("firmas");
            setGuardadas((g) => ({ ...g, firmas: false }));
            aviso("Firma guardada");
          }}
        />
      ) : null}

      {sheet === "camara" ? (
        <CamaraSheet
          onCapturar={(src) => {
            setFotos((prev) => [...prev, { id: autoId++, src }]);
            setGuardadas((g) => ({ ...g, fotos: false }));
          }}
          onCerrar={() => setSheet(null)}
        />
      ) : null}

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} />
    </div>
  );

  function cambiarCantidad(etiqueta: string, delta: number) {
    setNp((p) => ({
      ...p,
      items: p.items.map((x) =>
        x.etiqueta === etiqueta ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + delta)) } : x
      ),
    }));
  }

  function onArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFotos((prev) => [...prev, { id: autoId++, src: String(reader.result) }]);
        setGuardadas((g) => ({ ...g, fotos: false }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }
}

// ─────────────────────────────── piezas locales ───────────────────────────────

const entrada =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface-3)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

const entradaSheet =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

function ahora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Cabecera({
  n,
  titulo,
  ok,
  chip,
  onToggle,
}: {
  n: number;
  titulo: string;
  ok: boolean;
  chip: { variante: "accent" | "neutral" | "outline"; texto: string };
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 min-h-[60px] px-4 bg-transparent border-0 border-b border-black/[.25] cursor-pointer text-left text-[var(--color-text)] hover:bg-black/[.04]"
    >
      <span
        className="w-6.5 h-6.5 flex-none grid place-items-center font-extrabold text-xs tabular-nums"
        style={{
          background: ok ? "var(--color-accent)" : "transparent",
          color: ok ? "var(--color-bg)" : "var(--color-text)",
        }}
      >
        {n}
      </span>
      <span className="font-extrabold text-[15px] leading-[1.2] flex-1">{titulo}</span>
      <span className={`tag tag-${chip.variante}`}>{chip.texto}</span>
    </button>
  );
}

function Cuerpo({ children, gap = true }: { children: React.ReactNode; gap?: boolean }) {
  return (
    <div className={`p-4 bg-[var(--color-surface)] border-b border-black/[.25] ${gap ? "flex flex-col gap-3.5" : ""}`}>
      {children}
    </div>
  );
}

function Campo({
  label,
  extra,
  htmlFor,
  children,
  className,
}: {
  label: string;
  extra?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
        {label}
        {extra ? <span className="opacity-66 normal-case tracking-normal"> {extra}</span> : null}
      </label>
      {children}
    </div>
  );
}

function PasoTitulo({ n, texto }: { n: string; texto: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-none tabular-nums">
        {n}
      </span>
      <span className="font-extrabold text-base leading-[1.2]">{texto}</span>
    </div>
  );
}

function BotonGuardar({ texto, onClick, habilitado }: { texto: string; onClick: () => void; habilitado: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-disabled={!habilitado}
      className="w-full min-h-[54px] flex items-center justify-between px-4 border-0 font-extrabold text-[15px] cursor-pointer text-left hover:brightness-95"
      style={{
        background: habilitado ? "var(--color-accent)" : "#8f8b8b",
        color: habilitado ? "var(--color-bg)" : "var(--color-surface-3)",
      }}
    >
      <span>{texto}</span>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M4 12l5 5L20 6" />
      </svg>
    </button>
  );
}
