import { getEnvConfig } from "./config";
import { GarconBot } from "./bot";
import logger from "./logger";

/**
 * Application entry point
 */
async function main(): Promise<void> {
  try {
    const config = getEnvConfig();

    const bot = new GarconBot(
      config.slackBotToken,
      config.slackAppToken,
      config.slackSigningSecret,
      config.geminiApiKey
    );

    await bot.start(config.port);

    const shutdown = async (): Promise<void> => {
      logger.info("Shutting down gracefully...");
      await bot.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    logger.error("Failed to start Garçon", { error });
    process.exit(1);
  }
}

main();
