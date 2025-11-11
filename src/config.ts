import { config as dotenvConfig } from "dotenv";

dotenvConfig();

interface EnvConfig {
  slackBotToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  geminiApiKey: string;
  geminiModel: string;
  port: number;
}

/**
 * Validates and retrieves environment variables
 * @throws {Error} If required environment variables are missing
 */
export function getEnvConfig(): EnvConfig {
  const requiredVars = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    "GEMINI_API_KEY",
  ];

  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN!,
    slackAppToken: process.env.SLACK_APP_TOKEN!,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET!,
    geminiApiKey: process.env.GEMINI_API_KEY!,
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-pro",
    port: parseInt(process.env.PORT || "3000", 10),
  };
}

export const config = getEnvConfig();
