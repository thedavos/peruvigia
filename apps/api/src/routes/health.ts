import type { FastifyInstance } from "fastify";

import { HealthResponseSchema } from "@peruvigia/shared";

const healthResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "timestamp"],
  properties: {
    status: {
      type: "string",
      enum: ["ok"],
    },
    service: {
      type: "string",
      enum: ["api"],
    },
    timestamp: {
      type: "string",
      format: "date-time",
    },
  },
} as const;

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Health check",
        response: {
          200: healthResponseJsonSchema,
        },
      },
    },
    async () => {
      return HealthResponseSchema.parse({
        status: "ok",
        service: "api",
        timestamp: new Date().toISOString(),
      });
    },
  );
}
