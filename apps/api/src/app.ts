import Fastify from "fastify";

import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(import("@fastify/cors"), {
    origin: ["http://localhost:4321", "http://127.0.0.1:4321"],
  });

  await app.register(import("@fastify/swagger"), {
    openapi: {
      info: {
        title: "Peruvigia API",
        version: "0.0.0",
      },
    },
  });

  await app.register(import("@fastify/swagger-ui"), {
    routePrefix: "/docs",
  });

  await registerHealthRoutes(app);

  app.get("/openapi.json", async () => app.swagger());

  return app;
}
