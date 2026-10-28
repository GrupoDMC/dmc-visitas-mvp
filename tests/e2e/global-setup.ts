import { BASE_E2E, PUERTO, TOKEN_SALUD, crearBaseE2E } from "./base";

// Crea la base desechable y comprueba, con la app ya arriba, que de verdad
// está hablando con ELLA y no con otra: /api/salud informa el destino real.
export default async function globalSetup() {
  await crearBaseE2E();
  const r = await fetch(`http://localhost:${PUERTO}/api/salud`, { headers: { authorization: `Bearer ${TOKEN_SALUD}` } });
  const j = (await r.json()) as { ok?: boolean; destino?: string };
  if (!j.ok || !j.destino?.endsWith(`/${BASE_E2E}`) || !/^(localhost|127\.0\.0\.1):/.test(j.destino)) {
    throw new Error(`La app bajo prueba NO apunta a la base desechable (destino: ${j.destino ?? "?"}). Se aborta antes de tocar nada.`);
  }
}
