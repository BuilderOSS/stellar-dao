/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@dao-test-stellar/token-bindings',
    '@dao-test-stellar/governor-bindings',
    '@dao-test-stellar/treasury-bindings'
  ],
  typedRoutes: true
};

export default nextConfig;
