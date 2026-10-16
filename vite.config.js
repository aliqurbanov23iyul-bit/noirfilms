import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  const api = {
    name: "noir-local-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        const { handler } = await import("./server/handler.js");
        req.url = `/api${req.url}`;
        await handler(req, res);
      });
    },
  };
  return {
    plugins: [api],
    build: {
      rollupOptions: {
        output: { manualChunks: { three: ["three"], animation: ["gsap"] } },
      },
    },
  };
});
