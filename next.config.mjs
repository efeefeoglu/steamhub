/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Playwright contains optional BiDi, Electron, and recorder modules that are
  // loaded only for those products. Bundling it makes webpack try to resolve all
  // of them and also folds the Chromium binary into the server chunk. Keep both
  // runtime packages as Node dependencies in the deployed function instead.
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  },
};
export default nextConfig;
