// Borrador de "Visitas en papel" (panel), guardado por usuario: el equipo del
// panel también se comparte y lo escrito lleva nombres y RUT.

const BASE = "dmc.visitas-papel.borrador.v4";
const clave = (uid: number) => `${BASE}.u${uid}`;

export function leerBorradorPapel(uid: number): string | null {
  try {
    const nuevo = localStorage.getItem(clave(uid));
    if (nuevo !== null) return nuevo;
    // Formato anterior, sin usuario: lo adopta quien abra la pantalla primero.
    const viejo = localStorage.getItem(BASE);
    if (viejo !== null) {
      localStorage.setItem(clave(uid), viejo);
      localStorage.removeItem(BASE);
    }
    return viejo;
  } catch {
    return null;
  }
}

export function escribirBorradorPapel(uid: number, json: string): void {
  try {
    localStorage.setItem(clave(uid), json);
  } catch {
    /* es una comodidad, no un requisito */
  }
}

export function borrarBorradorPapel(uid: number): void {
  try {
    localStorage.removeItem(clave(uid));
  } catch {
    /* nada que hacer */
  }
}
