/** @type {import('next').NextConfig} */
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\/api\/.*/i,
        handler: "NetworkFirst",
        method: "GET",
        options: {
          cacheName: "api-cache",
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
          networkTimeoutSeconds: 10,
        },
      },
      {
        // JS/CSS bundles: always try to refresh in the background so a new
        // deploy doesn't leave returning users on stale, mismatched chunks.
        urlPattern: /\.(?:js|css)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-js-css",
          expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
      {
        // Fonts and images are content-stable — safe to serve cache-first.
        urlPattern: /\.(?:woff2?|png|jpg|jpeg|svg|gif|ico|webp)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
    ],
  },
});

const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = withPWA(nextConfig);
