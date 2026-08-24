import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mssql/tedious usa require dinámico y binarios opcionales: si el bundler
  // lo empaqueta, la conexión revienta en runtime. Se deja fuera del bundle
  // del servidor y se resuelve desde node_modules.
  serverExternalPackages: ["mssql", "tedious"],

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
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
