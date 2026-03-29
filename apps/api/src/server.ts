import { buildApp } from "./app.js";

async function start() {
  const app = await buildApp();
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);

  try {
    await app.listen({
      host: "0.0.0.0",
      port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
