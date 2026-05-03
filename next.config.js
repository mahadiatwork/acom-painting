/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compress responses with gzip/brotli
  compress: true,
  // Remove the X-Powered-By header from responses
  poweredByHeader: false,
  images: {
    domains: [],
  },
  async headers() {
    return [
      {
        // Projects: stable reference data, cache for 5 min at the edge
        source: '/api/projects',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        // Painters: stable reference data, cache for 5 min at the edge
        source: '/api/painters',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        // Foremen: changes rarely, cache for 2 min
        source: '/api/foremen',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=120, stale-while-revalidate=300' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
