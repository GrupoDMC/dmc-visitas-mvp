"use client";

import Confirmar from "@/components/ui/Confirmar";
import CamaraSheet from "@/components/mobile/CamaraSheet";
import VideoSheet from "@/components/mobile/VideoSheet";
import FirmaSheet from "@/components/mobile/FirmaSheet";
import { Toast } from "@/components/ui/Toast";
import { HojaProblema, HojaTrabajo } from "@/components/mobile/formulario/hojas";
import {
  BloqueoDeActa,
  PantallaEnEspera,
  PantallaOk,
  PantallaRevision,
} from "@/components/mobile/formulario/pantallas";
import {
  BotonRevisar,
  SeccionFirma,
  SeccionFotos,
  SeccionInterno,
} from "@/components/mobile/formulario/secciones-evidencia";
import {
  Encabezado,
  SeccionProblemas,
  SeccionResponsable,
  SeccionTrabajo,
} from "@/components/mobile/formulario/secciones";
import { useFormularioVisita, type FormularioVisitaApi } from "@/components/mobile/formulario/useFormularioVisita";

/**
 * El acta del técnico: el formulario en seis secciones, la revisión y la
 * confirmación. El estado vive en useFormularioVisita; cada pantalla, sección y
 * hoja está en components/mobile/formulario.
 */
export default function FormularioVisita(props: Parameters<typeof useFormularioVisita>[0]) {
  const fv = useFormularioVisita(props);
  return (
    <>
      <PantallaDelActa fv={fv} />
      {/* Si el otro técnico tomó el acta o la cerró, cubre todo: no se edita ni se envía. */}
      {fv.bloqueo ? <BloqueoDeActa fv={fv} /> : null}
    </>
  );
}

function PantallaDelActa({ fv }: { fv: FormularioVisitaApi }) {
  const {
    visita,
    toast,
    aviso,
    paso,
    setAbierta,
    setGuardadas,
    confirmar,
    setConfirmar,
    respNombre,
    respRut,
    setFirma,
    sheet,
    setSheet,
    destinoMedia,
    pendiente,
    agregarFoto,
    agregarVideo,
  } = fv;
  if (paso === "encolada" && pendiente) return <PantallaEnEspera fv={fv} />;
  if (paso === "ok") return <PantallaOk fv={fv} />;
  if (paso === "preview") return <PantallaRevision fv={fv} />;

  return (
    <div className="animate-fade-in">
      <Encabezado fv={fv} />

      <div className="border-t-2 border-[var(--color-divider)]">
        <SeccionResponsable fv={fv} />
        <SeccionTrabajo fv={fv} />
        <SeccionProblemas fv={fv} />
        <SeccionInterno fv={fv} />
        <SeccionFotos fv={fv} />
        <SeccionFirma fv={fv} />
      </div>

      <BotonRevisar fv={fv} />
      <HojaTrabajo fv={fv} />
      <HojaProblema fv={fv} />

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
          onCapturar={(src) => void agregarFoto(src, destinoMedia === "interno")}
          onCerrar={() => setSheet(null)}
        />
      ) : null}

      {sheet === "video" ? (
        <VideoSheet
          onGrabado={(clip) => {
            agregarVideo(clip, destinoMedia === "interno");
            setSheet(null);
            setAbierta(destinoMedia === "interno" ? "interno" : "fotos");
            aviso(
              clip.ajustes.length
                ? "Video ajustado y agregado · subiendo al servidor"
                : "Video agregado · subiendo al servidor"
            );
          }}
          onCerrar={() => setSheet(null)}
        />
      ) : null}

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} variante="mobile" /> : null}
      <Toast texto={toast} />
    </div>
  );
}
