import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    allowedDevOrigins: [
        "https://6000-firebase-studio-1748275896273.cluster-44kx2eiocbhe2tyk3zoyo3ryuo.cloudworkstations.dev",
        "http://localhost:3000", // It's good to keep localhost if you ever run it locally
        // Add other development origins if needed
    ],
  },
};

export default nextConfig;
