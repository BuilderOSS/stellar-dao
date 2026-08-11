/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dao-test-stellar/token-bindings'],
  typedRoutes: true
};

export default nextConfig;
