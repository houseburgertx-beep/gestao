/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/gestao",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
