import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export interface EnvConfig {
  slackBotToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  llmProvider: "gemini" | "openai";
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiReasoningEffort?: "low" | "medium" | "high";
  port: number;
}

/**
 * Validates and retrieves environment variables
 * @throws {Error} If required environment variables are missing
 */
export function getEnvConfig(): EnvConfig {
  const llmProvider =
    process.env.LLM_PROVIDER === "openai" ? "openai" : "gemini";
  const requiredVars = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    llmProvider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY",
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
    llmProvider,
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-pro",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-6-luna",
    openaiReasoningEffort: (process.env.OPENAI_REASONING_EFFORT ||
      undefined) as EnvConfig["openaiReasoningEffort"],
    port: parseInt(process.env.PORT || "3000", 10),
  };
}

export const config = getEnvConfig();
