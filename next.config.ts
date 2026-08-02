import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para que better-sqlite3 no se bundlee (es nativo)
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: "/home/ulzuhan/proyectos-desarrollo/web/nextjs/qr-forge",
  },
};

export default nextConfig;
