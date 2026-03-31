import { AppDataSource } from "../config/data-source";

async function migrate() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  // eslint-disable-next-line no-console
  console.log("Migrations completed");
  await AppDataSource.destroy();
}

migrate().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
