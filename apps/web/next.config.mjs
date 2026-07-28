/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@punch-counter/contracts-counter'],
  typedRoutes: true
};

export default nextConfig;
