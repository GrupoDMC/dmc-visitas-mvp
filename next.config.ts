import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los tests E2E construyen y sirven la app en una carpeta aparte (NEXT_DIST_DIR)
  // para no pisar el `.next` de quien esté corriendo `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // mssql/tedious usa require dinámico y binarios opcionales: si el bundler
  // lo empaqueta, la conexión revienta en runtime. Se deja fuera del bundle
  // del servidor y se resuelve desde node_modules.
  serverExternalPackages: ["mssql", "tedious"],

  // El PDF del acta lleva el logo, que se lee de disco en el servidor. En
  // Vercel la función solo trae los archivos que se le indican.
  outputFileTracingIncludes: {
    "/api/visita/acta/[folio]": ["./public/DMC-logo.png"],
  },

  experimental: {
    // El acta del técnico viaja entera en una Server Action: fotos y firma
    // incluidas, en base64. El tope por defecto (1 MB) la rechaza en cuanto hay
    // dos fotos, y el error llega al celular como un fallo genérico de red.
    // El cliente reduce cada foto antes de mandarla (ver comprimirFoto: lado
    // mayor 1600 px, JPEG al 72 %), y así una pesa unos 250-450 KB, o 0,3-0,6 MB
    // en base64; la firma es un PNG de decenas de KB. Un acta normal queda en
    // 1-3 MB. Vercel corta el cuerpo de una función en 4,5 MB sin importar lo
    // que diga acá, así que el límite se deja justo por debajo: subirlo más no
    // serviría de nada en producción. El video no cuenta: se sube aparte.
    serverActions: { bodySizeLimit: "4mb" },
  },

  // Cabeceras de seguridad. La app se sirve por HTTPS en Vercel y maneja
  // sesiones en cookie, así que conviene cerrar lo evidente.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // El micrófono va habilitado: el video del trabajo se graba con
          // sonido, y lo que el técnico explica hablando vale tanto como lo
          // que se ve. Con `microphone=()` el navegador rechazaba el
          // getUserMedia de la hoja de grabación antes de preguntarle nada al
          // técnico, así que en el celular el botón de grabar no llegaba nunca
          // a aparecer.
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(self), microphone=(self)",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
