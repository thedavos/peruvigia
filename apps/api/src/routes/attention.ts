import type { FastifyInstance } from "fastify";

import {
  AttentionFactorKeyValues,
  AttentionProfileResponseSchema,
  AttentionReasonImpactValues,
  AttentionScoreLevelValues,
} from "@peruvigia/shared";

import { getAttentionProfile } from "#api/modules/attention/service.ts";

const attentionEvidenceJsonSchema = {
  additionalProperties: false,
  properties: {
    detail: {
      type: "string",
    },
    observedAt: {
      format: "date-time",
      nullable: true,
      type: "string",
    },
    sourceExternalId: {
      nullable: true,
      type: "string",
    },
    sourceRecordId: {
      format: "uuid",
      type: "string",
    },
    sourceType: {
      type: "string",
    },
    sourceUrl: {
      format: "uri",
      nullable: true,
      type: "string",
    },
  },
  required: [
    "detail",
    "observedAt",
    "sourceExternalId",
    "sourceRecordId",
    "sourceType",
    "sourceUrl",
  ],
  type: "object",
} as const;

const attentionReasonJsonSchema = {
  additionalProperties: false,
  properties: {
    impact: {
      enum: [...AttentionReasonImpactValues],
      type: "string",
    },
    key: {
      enum: [...AttentionFactorKeyValues],
      type: "string",
    },
    label: {
      type: "string",
    },
    summary: {
      type: "string",
    },
    weight: {
      type: "number",
    },
  },
  required: ["impact", "key", "label", "summary", "weight"],
  type: "object",
} as const;

const attentionFactorJsonSchema = {
  additionalProperties: false,
  properties: {
    contribution: {
      type: "number",
    },
    evidence: {
      items: attentionEvidenceJsonSchema,
      type: "array",
    },
    isPenalizable: {
      type: "boolean",
    },
    key: {
      enum: [...AttentionFactorKeyValues],
      type: "string",
    },
    metadata: {
      additionalProperties: true,
      type: "object",
    },
    weight: {
      type: "number",
    },
  },
  required: ["contribution", "evidence", "isPenalizable", "key", "metadata", "weight"],
  type: "object",
} as const;

const attentionContextJsonSchema = {
  additionalProperties: false,
  properties: {
    activeSanctionsCount: {
      type: "integer",
    },
    aliases: {
      items: {
        type: "string",
      },
      type: "array",
    },
    awardsCount: {
      type: "integer",
    },
    entityLinksCount: {
      type: "integer",
    },
    personLinksCount: {
      type: "integer",
    },
    relatedSuppliersCount: {
      type: "integer",
    },
  },
  required: [
    "activeSanctionsCount",
    "aliases",
    "awardsCount",
    "entityLinksCount",
    "personLinksCount",
    "relatedSuppliersCount",
  ],
  type: "object",
} as const;

const attentionProfileResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    calculationVersion: {
      type: "string",
    },
    calculatedAt: {
      format: "date-time",
      type: "string",
    },
    context: attentionContextJsonSchema,
    factors: {
      items: attentionFactorJsonSchema,
      type: "array",
    },
    personId: {
      format: "uuid",
      type: "string",
    },
    reasons: {
      items: attentionReasonJsonSchema,
      type: "array",
    },
    score: {
      additionalProperties: false,
      properties: {
        level: {
          enum: [...AttentionScoreLevelValues],
          type: "string",
        },
        summary: {
          type: "string",
        },
        value: {
          type: "number",
        },
      },
      required: ["level", "summary", "value"],
      type: "object",
    },
  },
  required: [
    "calculationVersion",
    "calculatedAt",
    "context",
    "factors",
    "personId",
    "reasons",
    "score",
  ],
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

type AttentionRouteDependencies = {
  getAttentionProfile?: typeof getAttentionProfile;
};

export async function registerAttentionRoutes(
  app: FastifyInstance,
  dependencies: AttentionRouteDependencies = {},
) {
  const readAttentionProfile = dependencies.getAttentionProfile ?? getAttentionProfile;

  app.get(
    "/people/:personId/attention-profile",
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
          200: attentionProfileResponseJsonSchema,
          404: notFoundJsonSchema,
        },
        summary: "Get an explainable public attention profile for a person",
        tags: ["people", "attention"],
      },
    },
    async (request, reply) => {
      const { personId } = request.params as {
        personId: string;
      };
      const result = await readAttentionProfile(personId);

      if (!result) {
        return reply.status(404).send({
          message: `Person ${personId} was not found.`,
        });
      }

      return AttentionProfileResponseSchema.parse(result);
    },
  );
}
