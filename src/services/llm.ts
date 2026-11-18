import { EnvConfig } from "../config";
import { GeminiService, Message } from "./gemini.service";
import { OpenAiService } from "./openai.service";

export interface LlmService {
  generateResponse(messages: Message[]): Promise<string>;
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
