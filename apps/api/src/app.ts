import Fastify from "fastify";

import { getEnv } from "#api/env.js";
import { getContraloriaStatus } from "#api/modules/contraloria/service.js";
import { getDjiContext } from "#api/modules/dji/service.js";
import { getSeaceActivity } from "#api/modules/seace/service.js";
import { registerContraloriaRoutes } from "#api/routes/contraloria.js";
import { registerDjiRoutes } from "#api/routes/dji.js";
import { registerHealthRoutes } from "#api/routes/health.js";
import { registerSeaceRoutes } from "#api/routes/seace.js";

type BuildAppOptions = {
  services?: {
    getContraloriaStatus?: typeof getContraloriaStatus;
    getDjiContext?: typeof getDjiContext;
    getSeaceActivity?: typeof getSeaceActivity;
  };
};

export async function buildApp(options: BuildAppOptions = {}) {
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
  await registerContraloriaRoutes(app, {
    getStatus: options.services?.getContraloriaStatus,
  });
  await registerDjiRoutes(app, {
    getContext: options.services?.getDjiContext,
  });
  await registerSeaceRoutes(app, {
    getActivity: options.services?.getSeaceActivity,
  });

  app.get("/openapi.json", async () => app.swagger());

  return app;
}
