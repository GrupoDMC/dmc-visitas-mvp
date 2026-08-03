/**
 * Esqueleto de carga. Imita la forma de una pantalla de listado para que el
 * salto al contenido real no mueva todo de lugar. Sin spinner y sin
 * animación de entrada: solo un pulso muy leve.
 */
export default function Cargando() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse" aria-hidden>
      <div className="h-7 w-56 rounded-base bg-borde" />
      <div className="mt-2 h-4 w-72 rounded-base bg-borde/70" />

      <div className="mt-6 rounded-base border border-borde bg-superficie shadow-tarjeta">
        <div className="border-b border-borde px-4 py-3">
          <div className="h-4 w-32 rounded-base bg-borde" />
        </div>
        <div className="divide-y divide-borde">
          {[0, 1, 2, 3].map((fila) => (
            <div key={fila} className="flex h-11 items-center gap-4 px-4">
              <div className="h-4 w-28 rounded-base bg-borde/70" />
              <div className="ml-auto h-4 w-40 rounded-base bg-borde/70" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        Cargando…
      </span>
    </div>
  );
}
