import path from "node:path";
import { fileURLToPath } from "node:url";

const envDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(envDir, "../../..");

let envLoaded = false;
let cachedEnv: AppEnv | undefined;

export type AppEnv = {
  API_URL?: string;
  DATABASE_URL?: string;
  OLLAMA_BASE_URL?: string;
  PORT: number;
  WEB_URL?: string;
};

function loadEnvFiles() {
  if (envLoaded) {
    return;
  }

  for (const envFile of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(workspaceRoot, envFile));
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  envLoaded = true;
}

function parseOptionalUrl(name: string, value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function parsePort(value: string | undefined) {
  if (!value) {
    return 3001;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer.");
  }

  return port;
}

function createEnv(): AppEnv {
  loadEnvFiles();

  return {
    API_URL: parseOptionalUrl("API_URL", process.env.API_URL),
    DATABASE_URL: process.env.DATABASE_URL,
    OLLAMA_BASE_URL: parseOptionalUrl("OLLAMA_BASE_URL", process.env.OLLAMA_BASE_URL),
    PORT: parsePort(process.env.PORT),
    WEB_URL: parseOptionalUrl("WEB_URL", process.env.WEB_URL),
  };
}

export function getEnv() {
  cachedEnv ??= createEnv();
  return cachedEnv;
}

export function requireDatabaseUrl() {
  const env = getEnv();

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to initialize the PostgreSQL client.");
  }

  return env.DATABASE_URL;
}
