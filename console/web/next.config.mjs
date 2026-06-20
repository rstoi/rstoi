/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exportado como PWA estática para Firebase Hosting.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
