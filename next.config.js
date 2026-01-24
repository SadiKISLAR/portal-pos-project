/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
        port: '8000',
        pathname: '/**',
      },
    ],
  },
  // pdfjs-dist için webpack config
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Server-side için canvas'ı external olarak işaretle
      config.externals = config.externals || [];
      config.externals.push({
        'canvas': 'commonjs canvas',
      });
      
      // pdfjs-dist için resolve fallback
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
