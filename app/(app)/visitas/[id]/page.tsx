import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { puedeEditarVisita, requerirSesion, type Sesion } from "@/lib/auth";
import { nombreTipoTrabajo } from "@/lib/catalogos";
import { fechaLarga, horaCorta } from "@/lib/fechas";
import { obtenerVisita, type VisitaDetalle } from "@/lib/db/visitas";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { SinDato } from "@/components/ui/tabla";

type Props = { params: Promise<{ id: string }> };

const leerVisita = cache(async (id: number) => obtenerVisita(id));

async function leerConPermiso(id: string): Promise<{ sesion: Sesion; visita: VisitaDetalle }> {
  const resultado = await leerSiPuede(id);
  if (!resultado) notFound();
  return resultado;
}

async function leerSiPuede(
  id: string,
): Promise<{ sesion: Sesion; visita: VisitaDetalle } | null> {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) return null;

  const [sesion, visita] = await Promise.all([
    requerirSesion(),
    leerVisita(numero),
  ]);

  if (!visita) return null;
  if (!puedeEditarVisita(sesion, visita.tecnico_id)) return null;

  return { sesion, visita };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const resultado = await leerSiPuede(id);
  return { title: resultado ? resultado.visita.folio : "Visita" };
}

/* ── Iconos ────────────────────────────────────────────────────────────── */

function IconChevronLeft(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M12 15l-5-5 5-5" />
    </svg>
  );
}

function IconPin(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18Z" />
      <circle cx="10" cy="8.3" r="2" />
    </svg>
  );
}

function IconWaveSite(props: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <circle cx="27" cy="13" r="2.6" />
      <path d="M6 24c3.5 0 4-6 8-6s5 6 8.5 6 4.5-4 9.5-4" />
    </svg>
  );
}

function IconDoc(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <rect x="5" y="4" width="10" height="13" rx="1.5" />
      <path d="M7.5 9h5M7.5 12h5M7.5 15h3" />
    </svg>
  );
}

function IconCalendar(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M3.5 8h13M7 3v3M13 3v3" />
    </svg>
  );
}

function IconClock(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </svg>
  );
}

function IconMapPin(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M10 17.5s5.5-4.9 5.5-9A5.5 5.5 0 0 0 4.5 8.5c0 4.1 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.3" r="1.8" />
    </svg>
  );
}

function IconPhoneCall(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M4.5 3.5h2.7l1.1 3.3-1.7 1.3a9 9 0 0 0 4.3 4.3l1.3-1.7 3.3 1.1v2.7a1.3 1.3 0 0 1-1.4 1.3A12.7 12.7 0 0 1 3.2 4.9a1.3 1.3 0 0 1 1.3-1.4Z" />
    </svg>
  );
}

function IconNavigation(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M10 2 3 17l7-3.5L17 17 10 2Z" />
    </svg>
  );
}

function IconSend(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M17 3 3 9.2l5.8 2.1L11 17 17 3Z" />
      <path d="M8.8 11.3 17 3" />
    </svg>
  );
}

function IconArrowRight(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/* ── Piezas de datos ──────────────────────────────────────────────────── */

function Telefono({ numero, className }: { numero: string | null; className?: string }) {
  if (!numero) return <SinDato />;
  return (
    <a href={`tel:${numero}`} className={className ?? "text-acento hover:underline"}>
      {numero}
    </a>
  );
}

function InfoItem({
  icono,
  etiqueta,
  children,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-acento/10 text-acento">
        {icono}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-suave">{etiqueta}</p>
        <div className="text-sm font-medium text-texto">{children}</div>
      </div>
    </div>
  );
}

/* ── Perfil de visita (sin contenedor de tarjeta) ────────────────────── */

function PerfilVisita({ visita }: { visita: VisitaDetalle }) {
  const fecha = fechaLarga(visita.fecha_programada);
  const hora = horaCorta(visita.hora_programada);
  const trabajo = nombreTipoTrabajo(visita.tipo_trabajo);

  const direccion = visita.sucursal?.direccion ?? null;
  const comuna = visita.sucursal?.comuna ?? null;
  const telefonoSucursal = visita.sucursal?.telefono ?? null;
  const direccionCompleta = [direccion, comuna].filter(Boolean).join(", ");
  const hrefMapa = direccionCompleta
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}`
    : null;

  return (
    <div>
      {/* Header estilo perfil: avatar + identidad, sin caja ni sombra alrededor */}
      <div className="flex items-start gap-4">

        <div className="min-w-0 flex-1">
            <div className="mt-2 flex justify-between flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave">
              <span className="font-medium tabular-nums">{visita.folio}</span>
            <BadgeEstado estado={visita.estado} />
            </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-texto sm:text-3xl">
              {visita.cliente?.razon_social ?? "Sin cliente"}
            </h1>
          </div>

          <p className="mt-1 text-sm text-acento">
            {visita.sucursal?.nombre ?? "Sin sucursal"}
          </p>
        </div>
      </div>

      {/* Detalle: fluye directo sobre el fondo, sin caja */}
      <div className="mt-6 border-t border-borde pt-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-texto">
          <IconDoc className="h-4 w-4 text-acento" />
          Detalle
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-suave">
          {visita.descripcion_trabajo ?? "Sin descripción"}
        </p>
      </div>

      {/* Info: grid de datos como en un perfil, no como formulario */}
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-borde pt-5 sm:grid-cols-2">
        <InfoItem icono={<IconCalendar className="h-4.5 w-4.5" />} etiqueta="Tipo">
          {trabajo ?? "Visita"}
        </InfoItem>

        <InfoItem icono={<IconClock className="h-4.5 w-4.5" />} etiqueta="Fecha y hora">
          {fecha ?? "Sin fecha"}
          {hora ? <span className="block font-normal text-suave">{hora}</span> : null}
        </InfoItem>

        <InfoItem icono={<IconMapPin className="h-4.5 w-4.5" />} etiqueta="Dirección">
          {direccion ?? <SinDato />}
          {comuna ? <span className="block font-normal text-suave">{comuna}</span> : null}
        </InfoItem>

        <InfoItem icono={<IconPhoneCall className="h-4.5 w-4.5" />} etiqueta="Teléfono de la sucursal">
          <Telefono numero={telefonoSucursal} className="font-medium text-acento hover:underline" />
        </InfoItem>
      </div>

      {hrefMapa ? (
        
        <a  href={hrefMapa}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-borde text-sm font-medium text-texto transition hover:bg-fondo"
        >
          <IconNavigation className="h-4 w-4" />
          Cómo llegar
        </a>
      ) : null}

      {/* CTA: apunta al punto de montaje de <CierreVisita /> */}
      <Link
        href="/visitas/2/firma-visita"
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-acento text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        <IconSend className="h-4 w-4" />
        Firmar visita
        <IconArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/* ── Página ────────────────────────────────────────────────────────────── */

export default async function PaginaVisita({ params }: Props) {
  const { id } = await params;
  const { visita } = await leerConPermiso(id);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4 sm:px-0">
      {/* btn regresar */}
      <Link
        href="/visitas"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-acento hover:underline"
      >
        <IconChevronLeft className="h-4 w-4" />
        Visitas
      </Link>

      <div className="mt-4">
        <PerfilVisita visita={visita} />
      </div>

      {/* Punto de montaje para <CierreVisita /> cuando reactives esa sección. */}
      <div id="cierre-visita" />
    </div>
  );
}