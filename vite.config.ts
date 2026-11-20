// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverSupabaseEnv = {
    SUPABASE_URL: env["SUPABASE_URL"] || env["VITE_SUPABASE_URL"],
    SUPABASE_PUBLISHABLE_KEY:
      env["SUPABASE_PUBLISHABLE_KEY"] ||
      env["SUPABASE_ANON_KEY"] ||
      env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
      env["VITE_SUPABASE_ANON_KEY"],
    SUPABASE_SERVICE_ROLE_KEY: env["SUPABASE_SERVICE_ROLE_KEY"],
  };
  for (const [name, value] of Object.entries(serverSupabaseEnv)) {
    if (!process.env[name]?.trim() && value?.trim()) process.env[name] = value;
  }

  const missingServerSupabaseEnv = [
    ...(!process.env["SUPABASE_URL"]?.trim() ? ["SUPABASE_URL or VITE_SUPABASE_URL"] : []),
    ...(!process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim()
      ? ["SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY, or VITE_SUPABASE_* key"]
      : []),
  ];
  if (missingServerSupabaseEnv.length) {
    console.error("[Supabase] Server configuration is incomplete", {
      missing: missingServerSupabaseEnv,
      serviceRoleKeyConfigured: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim()),
    });
  }
  const localDemoAvailable = mode === "development" && !env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();

  return {
    vite: {
      define: {
        __LOCAL_DEMO_AVAILABLE__: JSON.stringify(localDemoAvailable),
      },
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        outDir: ".output/public",
        includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
        manifest: {
          name: "ই-নিবন্ধন ট্র্যাকার",
          short_name: "ই-নিবন্ধন",
          description: "জন্ম ও মৃত্যু নিবন্ধন ট্র্যাকার",
          lang: "bn",
          theme_color: "#16a34a",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) => request.mode === "navigate" && url.pathname === "/",
              handler: "NetworkFirst",
              options: {
                cacheName: "public-home-page",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-font-styles", expiration: { maxEntries: 4 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: "CacheFirst",
              options: {
                cacheName: "google-font-files",
                expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
    ],
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
  };
});
