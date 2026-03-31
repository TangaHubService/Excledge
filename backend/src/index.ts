import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource } from "./config/data-source";

const start = async () => {
  await AppDataSource.initialize();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API running on :${env.port}`);
  });
};

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});
