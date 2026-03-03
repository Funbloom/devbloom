/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return {
      // Run before filesystem so /images/* is proxied to the API, not 404 from missing static file
      beforeFiles: [
        { source: "/images/:path*", destination: `${apiUrl}/images/:path*` },
      ],
    };
  },
};

module.exports = nextConfig;
