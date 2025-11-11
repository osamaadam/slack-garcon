import { GoogleGenAI, Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import retry from "retry";
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
 * Service for interacting with Gemini AI
 */
export class GeminiService {
  private ai: GoogleGenAI;
  private modelName: string;
  private systemPrompt?: string;

  constructor(apiKey: string, modelName: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
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

    const operation = retry.operation({
      retries: 5,
      factor: 3,
      minTimeout: 5000,
      maxTimeout: 60000,
      randomize: true,
    });

    const result = await new Promise<
      Awaited<ReturnType<typeof this.ai.models.generateContent>>
    >((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          const res = await this.ai.models.generateContent({
            model: this.modelName,
            contents: parts,
            config: {
              systemInstruction: systemPrompt,
            },
          });
          resolve(res);
        } catch (error) {
          logger.warn("Gemini API request failed, retrying...", {
            attempt: currentAttempt,
            retriesLeft: operation.attempts(),
          });

          if (!operation.retry(error as Error)) {
            reject(operation.mainError());
          }
        }
      });
    });

    const text = result.text ?? "";

    logger.debug("Gemini response received", {
      responseLength: text.length,
      responsePreview: text.substring(0, 300),
    });

    return text;
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
