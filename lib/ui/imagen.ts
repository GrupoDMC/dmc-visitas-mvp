// Preparación de las fotos antes de mandarlas al servidor.
//
// Una foto de la cámara de un celular actual pesa entre 2 y 5 MB. El acta viaja
// entera en una sola Server Action, así que tres fotos sin tocar ya se comen el
// presupuesto del request y el técnico ve un "no se pudo guardar" sin más
// explicación. Acá se reduce el lado mayor y se recomprime a JPEG.
//
// Se conserva el color: antes las fotos se mostraban con un filtro `grayscale`
// que hacía creer que se guardaban en blanco y negro.

// Niveles de compresión. El primero es el de siempre; los siguientes solo se
// usan cuando las fotos del acta, juntas, no caben en el request (ver
// ajustarFotos).
const NIVELES = [
  { lado: 1600, calidad: 0.72 },
  { lado: 1280, calidad: 0.62 },
  { lado: 1024, calidad: 0.55 },
  { lado: 800, calidad: 0.5 },
];

/**
 * Lo que pueden pesar, juntas, las fotos nuevas del acta (en bytes ya
 * decodificados). En base64 son un tercio más, y el request completo se corta
 * en 4,5 MB (ver next.config.ts): el resto del presupuesto es la firma y el texto.
 */
export const PRESUPUESTO_FOTOS_BYTES = 2.5 * 1024 * 1024;

/** Reduce y recomprime una data URL. Si algo falla, devuelve la original. */
export async function comprimirFoto(dataUrl: string, nivel = 0): Promise<string> {
  const { lado: LADO_MAXIMO, calidad: CALIDAD } = NIVELES[Math.min(nivel, NIVELES.length - 1)];
  try {
    const img = await cargarImagen(dataUrl);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const ancho = Math.round(img.width * escala);
    const alto = Math.round(img.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    // Fondo blanco: un PNG con transparencia recomprimido a JPEG deja los
    // pixeles transparentes en negro, y la foto sale con manchas oscuras.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const reducida = canvas.toDataURL("image/jpeg", CALIDAD);
    return reducida.length < dataUrl.length ? reducida : dataUrl;
  } catch {
    return dataUrl;
  }
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = src;
  });
}

/** Peso aproximado en bytes de una data URL base64. */
export function pesoAproximado(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Lo que pesan las fotos que viajan en el request (las que todavía son data URL). */
export function pesoDeFotos(fotos: { src: string }[]): number {
  return fotos.reduce((t, f) => (f.src.startsWith("data:") ? t + pesoAproximado(f.src) : t), 0);
}

/**
 * Si las fotos nuevas juntas pasan el presupuesto, las vuelve a comprimir con
 * niveles cada vez más fuertes hasta que quepan. No se limita cuántas fotos se
 * toman: se les baja la calidad. Devuelve la misma lista si no hay nada que
 * hacer o ya no se puede reducir más.
 */
export async function ajustarFotos<T extends { src: string }>(fotos: T[]): Promise<T[]> {
  let actual = fotos;
  for (let nivel = 1; nivel < NIVELES.length && pesoDeFotos(actual) > PRESUPUESTO_FOTOS_BYTES; nivel++) {
    actual = await Promise.all(
      actual.map(async (f) => (f.src.startsWith("data:") ? { ...f, src: await comprimirFoto(f.src, nivel) } : f))
    );
  }
  return pesoDeFotos(actual) < pesoDeFotos(fotos) ? actual : fotos;
}
