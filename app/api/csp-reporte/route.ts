import { NextResponse } from "next/server";

// Receptor de los avisos de Content-Security-Policy-Report-Only. Solo deja
// constancia en el log: no toca la base ni devuelve nada. Es público a
// propósito (la pantalla de login también reporta), así que el cuerpo se lee
// con tope y lo registrado se recorta.

const TOPE_CUERPO = 8 * 1024;
const TOPE_LOG = 1500;

export async function POST(req: Request) {
  const vacia = () => new NextResponse(null, { status: 204 });

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TOPE_CUERPO) return new NextResponse(null, { status: 413 });

  let texto = "";
  try {
    const lector = req.body?.getReader();
    if (!lector) return vacia();
    const decodificador = new TextDecoder();
    let leidos = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      leidos += value.byteLength;
      if (leidos > TOPE_CUERPO) {
        await lector.cancel();
        return new NextResponse(null, { status: 413 });
      }
      texto += decodificador.decode(value, { stream: true });
    }
  } catch {
    return vacia();
  }

  let resumen = texto;
  try {
    const json = JSON.parse(texto) as Record<string, unknown>;
    resumen = JSON.stringify(json["csp-report"] ?? json);
  } catch {
    // Cuerpo que no es JSON: se registra recortado tal cual.
  }
  console.warn("[csp]", resumen.slice(0, TOPE_LOG));
  return vacia();
}
