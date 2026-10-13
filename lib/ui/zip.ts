/**
 * Un .zip sin compresión, armado en el navegador.
 *
 * Los PDF ya vienen comprimidos, así que guardarlos tal cual pesa lo mismo y
 * evita sumar una librería solo para juntar las actas.
 */

export interface ArchivoZip {
  nombre: string;
  bytes: Uint8Array;
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function armarZip(archivos: ArchivoZip[]): Blob {
  const partes: BlobPart[] = [];
  const central: Uint8Array[] = [];
  const codificador = new TextEncoder();
  let desplazamiento = 0;

  for (const a of archivos) {
    const nombre = codificador.encode(a.nombre);
    const crc = crc32(a.bytes);
    // Bit 11 de las banderas: el nombre va en UTF-8.
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.bytes.length, true);
    local.setUint32(22, a.bytes.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.bytes as BlobPart);

    const ficha = new DataView(new ArrayBuffer(46));
    ficha.setUint32(0, 0x02014b50, true);
    ficha.setUint16(4, 20, true);
    ficha.setUint16(6, 20, true);
    ficha.setUint16(8, 0x0800, true);
    ficha.setUint32(16, crc, true);
    ficha.setUint32(20, a.bytes.length, true);
    ficha.setUint32(24, a.bytes.length, true);
    ficha.setUint16(28, nombre.length, true);
    ficha.setUint32(42, desplazamiento, true);
    const entrada = new Uint8Array(46 + nombre.length);
    entrada.set(new Uint8Array(ficha.buffer), 0);
    entrada.set(nombre, 46);
    central.push(entrada);

    desplazamiento += 30 + nombre.length + a.bytes.length;
  }

  const tamCentral = central.reduce((s, e) => s + e.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);

  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: "application/zip" });
}
