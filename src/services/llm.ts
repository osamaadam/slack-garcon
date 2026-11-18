import { EnvConfig } from "../config";
import { GeminiService, Message } from "./gemini.service";
import { OpenAiService } from "./openai.service";
import { GarconReply } from "./reply";

export interface LlmService {
  // Gemini returns free text; OpenAI returns structured data that code renders.
  generateResponse(messages: Message[]): Promise<string | GarconReply>;
}

export function createLlmService(config: EnvConfig): LlmService {
  if (config.llmProvider === "openai") {
    return new OpenAiService(
      config.openaiApiKey,
      config.openaiModel,
      config.openaiReasoningEffort
    );
  }
  return new GeminiService(config.geminiApiKey, config.geminiModel);
}
