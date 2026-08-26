import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mssql/tedious usa require dinámico y binarios opcionales: si el bundler
  // lo empaqueta, la conexión revienta en runtime. Se deja fuera del bundle
  // del servidor y se resuelve desde node_modules.
  serverExternalPackages: ["mssql", "tedious"],

  experimental: {
    // El acta del técnico viaja entera en una Server Action: fotos y firma
    // incluidas, en base64. El tope por defecto (1 MB) la rechaza en cuanto hay
    // dos fotos, y el error llega al celular como un fallo genérico de red.
    // El cliente ya reduce cada foto antes de mandarla (ver comprimirFoto).
    serverActions: { bodySizeLimit: "20mb" },
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
