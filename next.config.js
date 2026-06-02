/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['odex', 'mathjs'],
  },
  webpack: (config) => {
    // Three.js optimization
    config.externals = [...(config.externals || [])];
    return config;
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
};

module.exports = nextConfig;
