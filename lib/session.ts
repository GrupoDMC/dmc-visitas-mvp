// Token de sesión firmado (HMAC-SHA256) sobre Web Crypto.
//
// Sin firma, la cookie guardaba el id de usuario en claro y bastaba con
// editarla para suplantar a cualquiera. Aquí el valor va acompañado de una
// firma que solo el servidor puede producir, así que un id alterado se
// descarta al verificar.
//
// Este módulo NO importa "server-only" a propósito: middleware.ts corre en el
// runtime Edge y necesita verificar el token antes de dejar pasar la petición.
// Por eso usa Web Crypto (disponible en Node y en Edge) y no node:crypto.

export const COOKIE_SESION = "dmc_session";

/** Vigencia del token, en segundos (15 min). */
export const VIGENCIA_SESION = 60 * 15;

export interface TokenSesion {
  /** id de dmc.usuario */
  uid: number;
  /** epoch en segundos */
  exp: number;
}

const codificador = new TextEncoder();
let clavePromesa: Promise<CryptoKey> | null = null;

function secreto(): string {
  const valor = process.env.SESSION_SECRET?.trim();
  if (!valor || valor.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente o demasiado corto (mínimo 32 caracteres). " +
        'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return valor;
}

function clave(): Promise<CryptoKey> {
  if (!clavePromesa) {
    clavePromesa = crypto.subtle
      .importKey("raw", codificador.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
      .catch((err) => {
        clavePromesa = null;
        throw err;
      });
  }
  return clavePromesa;
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Sin anotar el retorno a propósito: TypeScript infiere Uint8Array<ArrayBuffer>,
// que es lo que Web Crypto acepta como BufferSource.
function deBase64Url(texto: string) {
  const binario = atob(texto.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Firma `{uid, exp}` y devuelve el valor a guardar en la cookie. */
export async function firmarToken(usuarioId: number, ahora = Date.now()): Promise<string> {
  const carga: TokenSesion = { uid: usuarioId, exp: Math.floor(ahora / 1000) + VIGENCIA_SESION };
  const cuerpo = aBase64Url(codificador.encode(JSON.stringify(carga)));
  const firma = await crypto.subtle.sign("HMAC", await clave(), codificador.encode(cuerpo));
  return `${cuerpo}.${aBase64Url(new Uint8Array(firma))}`;
}

/** Devuelve la carga del token, o null si la firma no cuadra o ya expiró. */
export async function verificarToken(token: string | undefined, ahora = Date.now()): Promise<TokenSesion | null> {
  if (!token) return null;
  const corte = token.indexOf(".");
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);

  try {
    const valida = await crypto.subtle.verify(
      "HMAC",
      await clave(),
      // La verificación es de tiempo constante: no hay comparación de strings.
      deBase64Url(firma),
      codificador.encode(cuerpo)
    );
    if (!valida) return null;

    const carga = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo))) as unknown;
    if (
      typeof carga !== "object" ||
      carga === null ||
      typeof (carga as TokenSesion).uid !== "number" ||
      typeof (carga as TokenSesion).exp !== "number"
    ) {
      return null;
    }

    const { uid, exp } = carga as TokenSesion;
    if (!Number.isInteger(uid) || uid <= 0) return null;
    if (exp * 1000 <= ahora) return null;
    return { uid, exp };
  } catch {
    // Base64 corrupto, JSON inválido o SESSION_SECRET sin definir.
    return null;
  }
}

/** Atributos de la cookie. `secure` solo en producción: en local no hay HTTPS. */
export function opcionesCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
