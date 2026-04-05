import type { FastifyInstance } from "fastify";

import { ContraloriaSignalTypeValues, ContraloriaStatusResponseSchema } from "@peruvigia/shared";

import { getContraloriaStatus } from "#api/modules/contraloria/service";

const contraloriaStatusSignalJsonSchema = {
  additionalProperties: false,
  properties: {
    attachmentUrl: {
      format: "uri",
      type: "string",
    },
    canonicalKey: {
      type: "string",
    },
    endDate: {
      nullable: true,
      type: "string",
    },
    entityName: {
      nullable: true,
      type: "string",
    },
    isActive: {
      type: "boolean",
    },
    reportUrl: {
      format: "uri",
      type: "string",
    },
    resolutionDate: {
      nullable: true,
      type: "string",
    },
    resolutionNumber: {
      nullable: true,
      type: "string",
    },
    sanctionType: {
      type: "string",
    },
    signalId: {
      format: "uuid",
      type: "string",
    },
    signalType: {
      enum: [...ContraloriaSignalTypeValues],
      type: "string",
    },
    sourceRecordId: {
      format: "uuid",
      type: "string",
    },
    startDate: {
      nullable: true,
      type: "string",
    },
    summary: {
      type: "string",
    },
    title: {
      type: "string",
    },
  },
  required: [
    "attachmentUrl",
    "canonicalKey",
    "endDate",
    "entityName",
    "isActive",
    "reportUrl",
    "resolutionDate",
    "resolutionNumber",
    "sanctionType",
    "signalId",
    "signalType",
    "sourceRecordId",
    "startDate",
    "summary",
    "title",
  ],
  type: "object",
} as const;

const contraloriaStatusResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    activeSignals: {
      items: contraloriaStatusSignalJsonSchema,
      type: "array",
    },
    contextSignals: {
      items: contraloriaStatusSignalJsonSchema,
      type: "array",
    },
    hasActiveSanction: {
      type: "boolean",
    },
    personId: {
      format: "uuid",
      type: "string",
    },
  },
  required: ["personId", "hasActiveSanction", "activeSignals", "contextSignals"],
  type: "object",
} as const;

const notFoundJsonSchema = {
  additionalProperties: false,
  properties: {
    message: {
      type: "string",
    },
  },
  required: ["message"],
  type: "object",
} as const;

type ContraloriaRouteDependencies = {
  getStatus?: typeof getContraloriaStatus;
};

export async function registerContraloriaRoutes(
  app: FastifyInstance,
  dependencies: ContraloriaRouteDependencies = {},
) {
  const getStatus = dependencies.getStatus ?? getContraloriaStatus;

  app.get(
    "/people/:personId/contraloria-status",
    {
      schema: {
        params: {
          additionalProperties: false,
          properties: {
            personId: {
              format: "uuid",
              type: "string",
            },
          },
          required: ["personId"],
          type: "object",
        },
        response: {
          200: contraloriaStatusResponseJsonSchema,
          404: notFoundJsonSchema,
        },
        summary: "Get Contraloria sanctions status for a person",
        tags: ["people", "signals"],
      },
    },
    async (request, reply) => {
      const { personId } = request.params as {
        personId: string;
      };
      const result = await getStatus(personId);

      if (!result) {
        return reply.status(404).send({
          message: `Person ${personId} was not found.`,
        });
      }

      return ContraloriaStatusResponseSchema.parse(result);
    },
  );
}
