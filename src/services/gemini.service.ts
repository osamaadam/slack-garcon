import { GoogleGenAI, Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import logger from "../logger";

export interface Base64Image {
  data: string;
  mimeType: string;
}

export interface Message {
  role: "user" | "model";
  content: string;
  userName?: string;
  images?: Base64Image[];
}

/**
 * Minimal typed shape for errors returned by the GenAI SDK or HTTP layer.
 */
interface ModelError {
  code?: string | number;
  status?: number | string;
  response?: { status?: number };
  message?: string;
}

/**
 * Service for interacting with Gemini AI
 */
export class GeminiService {
  private ai: GoogleGenAI;
  private modelName: string;
  private systemPrompt?: string;
  private fallbackModels: string[];

  constructor(apiKey: string, modelName: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    // Optional comma-separated fallback models from env var
    this.fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Generates a response based on the conversation context
   * @param messages - Array of messages representing the conversation thread
   * @returns Promise resolving to the AI-generated response
   */
  async generateResponse(messages: Message[]): Promise<string> {
    const systemPrompt = await this.getSystemPrompt();
    const parts = await this.buildContentParts(messages);

    const totalParts = parts.length;
    const imageParts = parts.filter((p) => "inlineData" in p).length;

    logger.debug("Gemini request prepared", {
      totalParts,
      imageParts,
      textParts: totalParts - imageParts,
    });

    const modelsToTry = [this.modelName, ...this.fallbackModels];

    function isTransientModelError(err: unknown): boolean {
      if (!err) return false;
      const e = err as ModelError;
      // Only treat explicit HTTP 503 (Service Unavailable) as transient.
      if (e.response && typeof e.response.status === "number") {
        return e.response.status === 503;
      }
      if (typeof e.status === "number") return e.status === 503;
      if (typeof e.code === "number") return e.code === 503;
      if (typeof e.code === "string") return e.code === "503";
      return false;
    }

    let lastError: unknown = null;
    for (const model of modelsToTry) {
      try {
        logger.info("Attempting Gemini model", { model });
        const res = await this.ai.models.generateContent({
          model,
          contents: parts,
          config: {
            systemInstruction: systemPrompt,
          },
        });
        const text = res.text ?? "";
        logger.debug("Gemini response received", {
          responseLength: text.length,
          responsePreview: text.substring(0, 300),
          usedModel: model,
        });
        return text;
      } catch (err) {
        lastError = err;
        logger.warn("Gemini model failed", { model, error: err });
        if (!isTransientModelError(err)) {
          // Non-transient: don't attempt other models
          logger.error("Gemini failure is non-transient; aborting", {
            model,
            error: err,
          });
          throw err;
        }

        // transient -> try next model immediately (no backoff to avoid extra Lambda time/cost)
        logger.info(
          "Transient Gemini error (503); trying next model immediately",
          {
            model,
          }
        );
        continue;
      }
    }

    logger.error("All Gemini models failed", {
      modelsTried: modelsToTry,
      lastError,
    });
    throw lastError;
  }

  /**
   * Builds content parts from messages, including text and images
   * @param messages - Array of messages to convert
   * @returns Array of content parts
   */
  private async buildContentParts(messages: Message[]): Promise<Part[]> {
    const parts: Part[] = [];

    for (const msg of messages) {
      const role = msg.role === "user" ? msg.userName || "User" : "Garçon";
      parts.push({ text: `${role}: ${msg.content}` });

      if (msg.images && msg.images.length > 0) {
        logger.info("Adding images to request", {
          imageCount: msg.images.length,
          role,
        });

        for (const image of msg.images) {
          parts.push({
            inlineData: {
              data: image.data,
              mimeType: image.mimeType,
            },
          });
        }
      }
    }

    return parts;
  }

  /**
   * Gets or loads the system prompt
   * @returns System prompt string
   */
  private async getSystemPrompt(): Promise<string> {
    if (!this.systemPrompt) {
      this.systemPrompt = await readFile(
        join(__dirname, "..", "..", "system_prompt.txt"),
        "utf-8"
      );
    }
    return this.systemPrompt;
  }
}
