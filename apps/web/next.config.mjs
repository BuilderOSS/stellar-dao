/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@stellar-dao/token-bindings',
    '@stellar-dao/governor-bindings',
    '@stellar-dao/treasury-bindings'
  ],
  typedRoutes: true
};

export default nextConfig;
