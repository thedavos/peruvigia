import type { FastifyInstance } from "fastify";

import { getSeaceActivity } from "#api/modules/seace/service.js";

const seaceActivityRecordJsonSchema = {
  additionalProperties: false,
  properties: {
    awardedAt: {
      nullable: true,
      type: "string",
    },
    contractingEntity: {
      additionalProperties: false,
      properties: {
        externalIdentifier: {
          type: "string",
        },
        name: {
          type: "string",
        },
      },
      required: ["externalIdentifier", "name"],
      type: "object",
    },
    currency: {
      nullable: true,
      type: "string",
    },
    objectDescription: {
      nullable: true,
      type: "string",
    },
    observedAt: {
      format: "date-time",
      type: "string",
    },
    processExternalId: {
      type: "string",
    },
    processType: {
      nullable: true,
      type: "string",
    },
    sourceExternalId: {
      type: "string",
    },
    sourceRecordId: {
      format: "uuid",
      type: "string",
    },
    sourceUrl: {
      format: "uri",
      nullable: true,
      type: "string",
    },
    status: {
      nullable: true,
      type: "string",
    },
    supplier: {
      additionalProperties: false,
      properties: {
        documentNumber: {
          nullable: true,
          type: "string",
        },
        externalIdentifier: {
          type: "string",
        },
        name: {
          type: "string",
        },
      },
      required: ["documentNumber", "externalIdentifier", "name"],
      type: "object",
    },
    totalAmount: {
      nullable: true,
      type: "number",
    },
  },
  required: [
    "awardedAt",
    "contractingEntity",
    "currency",
    "objectDescription",
    "observedAt",
    "processExternalId",
    "processType",
    "sourceExternalId",
    "sourceRecordId",
    "sourceUrl",
    "status",
    "supplier",
    "totalAmount",
  ],
  type: "object",
} as const;

type SeaceRouteDependencies = {
  getActivity?: typeof getSeaceActivity;
};

export async function registerSeaceRoutes(
  app: FastifyInstance,
  dependencies: SeaceRouteDependencies = {},
) {
  const getActivity = dependencies.getActivity ?? getSeaceActivity;

  app.get(
    "/seace/activity",
    {
      schema: {
        querystring: {
          additionalProperties: false,
          properties: {
            contractingEntityExternalId: {
              type: "string",
            },
            limit: {
              maximum: 500,
              minimum: 1,
              type: "integer",
            },
            processExternalId: {
              type: "string",
            },
            supplierDocumentNumber: {
              type: "string",
            },
            supplierExternalId: {
              type: "string",
            },
          },
          type: "object",
        },
        response: {
          200: {
            items: seaceActivityRecordJsonSchema,
            type: "array",
          },
        },
        summary: "Get simplified SEACE contractual activity",
        tags: ["seace", "activity"],
      },
    },
    async (request) => {
      const query = request.query as {
        contractingEntityExternalId?: string;
        limit?: number;
        processExternalId?: string;
        supplierDocumentNumber?: string;
        supplierExternalId?: string;
      };

      return await getActivity(query);
    },
  );
}
