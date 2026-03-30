import Fastify from "fastify";

import { getEnv } from "./env.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });
  const env = getEnv();

  const allowedOrigins = [
    "http://localhost:4321",
    "http://127.0.0.1:4321",
    ...(env.WEB_URL ? [env.WEB_URL] : []),
  ];

  await app.register(import("@fastify/cors"), {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"), false);
    },
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
