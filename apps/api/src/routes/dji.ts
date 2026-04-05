import type { FastifyInstance } from "fastify";

import { DjiContextResponseSchema, DjiLinkTypeValues } from "@peruvigia/shared";

import { getDjiContext } from "#api/modules/dji/service";

const djiEvidenceJsonSchema = {
  additionalProperties: false,
  properties: {
    declarationExternalId: {
      type: "string",
    },
    observedAt: {
      format: "date-time",
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
  },
  required: ["declarationExternalId", "observedAt", "sourceRecordId", "sourceUrl"],
  type: "object",
} as const;

const djiEntityLinkJsonSchema = {
  additionalProperties: false,
  properties: {
    detail: {
      nullable: true,
      type: "string",
    },
    endDate: {
      nullable: true,
      type: "string",
    },
    entity: {
      additionalProperties: false,
      properties: {
        entityId: {
          format: "uuid",
          type: "string",
        },
        entityType: {
          type: "string",
        },
        externalIdentifier: {
          nullable: true,
          type: "string",
        },
        name: {
          type: "string",
        },
      },
      required: ["entityId", "entityType", "externalIdentifier", "name"],
      type: "object",
    },
    evidence: djiEvidenceJsonSchema,
    linkId: {
      format: "uuid",
      type: "string",
    },
    linkType: {
      enum: [...DjiLinkTypeValues],
      type: "string",
    },
    startDate: {
      nullable: true,
      type: "string",
    },
  },
  required: ["detail", "endDate", "entity", "evidence", "linkId", "linkType", "startDate"],
  type: "object",
} as const;

const djiPersonLinkJsonSchema = {
  additionalProperties: false,
  properties: {
    detail: {
      nullable: true,
      type: "string",
    },
    endDate: {
      nullable: true,
      type: "string",
    },
    evidence: djiEvidenceJsonSchema,
    linkId: {
      format: "uuid",
      type: "string",
    },
    linkType: {
      enum: [...DjiLinkTypeValues],
      type: "string",
    },
    relatedPerson: {
      additionalProperties: false,
      properties: {
        documentNumber: {
          nullable: true,
          type: "string",
        },
        fullName: {
          type: "string",
        },
        personId: {
          format: "uuid",
          type: "string",
        },
      },
      required: ["documentNumber", "fullName", "personId"],
      type: "object",
    },
    startDate: {
      nullable: true,
      type: "string",
    },
  },
  required: ["detail", "endDate", "evidence", "linkId", "linkType", "relatedPerson", "startDate"],
  type: "object",
} as const;

const djiContextResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    entityLinks: {
      items: djiEntityLinkJsonSchema,
      type: "array",
    },
    personId: {
      format: "uuid",
      type: "string",
    },
    personLinks: {
      items: djiPersonLinkJsonSchema,
      type: "array",
    },
  },
  required: ["entityLinks", "personId", "personLinks"],
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

type DjiRouteDependencies = {
  getContext?: typeof getDjiContext;
};

export async function registerDjiRoutes(
  app: FastifyInstance,
  dependencies: DjiRouteDependencies = {},
) {
  const getContext = dependencies.getContext ?? getDjiContext;

  app.get(
    "/people/:personId/dji-context",
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
          200: djiContextResponseJsonSchema,
          404: notFoundJsonSchema,
        },
        summary: "Get DJI declared context for a person",
        tags: ["people", "context"],
      },
    },
    async (request, reply) => {
      const { personId } = request.params as {
        personId: string;
      };
      const result = await getContext(personId);

      if (!result) {
        return reply.status(404).send({
          message: `Person ${personId} was not found.`,
        });
      }

      return DjiContextResponseSchema.parse(result);
    },
  );
}
