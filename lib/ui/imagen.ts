// Preparación de las fotos antes de mandarlas al servidor.
//
// Una foto de la cámara de un celular actual pesa entre 2 y 5 MB. El acta viaja
// entera en una sola Server Action, así que tres fotos sin tocar ya se comen el
// presupuesto del request y el técnico ve un "no se pudo guardar" sin más
// explicación. Acá se reduce el lado mayor y se recomprime a JPEG.
//
// Se conserva el color: antes las fotos se mostraban con un filtro `grayscale`
// que hacía creer que se guardaban en blanco y negro.

const LADO_MAXIMO = 1600;
const CALIDAD = 0.72;

/** Reduce y recomprime una data URL. Si algo falla, devuelve la original. */
export async function comprimirFoto(dataUrl: string): Promise<string> {
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
