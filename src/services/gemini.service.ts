import { GoogleGenAI, Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import logger from "../logger";

export interface ImageData {
  url: string;
  mimeType: string;
}

export interface Message {
  role: "user" | "model";
  content: string;
  userName?: string;
  images?: ImageData[];
}

/**
 * Service for interacting with Gemini AI
 */
export class GeminiService {
  private ai: GoogleGenAI;
  private modelName: string;
  private botToken: string;
  private systemPrompt?: string;

  constructor(apiKey: string, slackBotToken: string, modelName: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.botToken = slackBotToken;
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

    const result = await this.ai.models.generateContent({
      model: this.modelName,
      contents: [systemPrompt, ...parts],
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
        logger.info("Processing images", {
          imageCount: msg.images.length,
          role,
        });

        for (const image of msg.images) {
          try {
            const imageData = await this.fetchImageAsBase64(image.url);
            parts.push({
              inlineData: {
                data: imageData,
                mimeType: image.mimeType,
              },
            });
            logger.debug("Image loaded successfully", {
              urlPreview: image.url.substring(0, 50),
            });
          } catch (error) {
            logger.error("Failed to load image", { url: image.url, error });
          }
        }
      }
    }

    return parts;
  }

  /**
   * Fetches an image from Slack and converts it to base64
   * @param url - Slack image URL
   * @returns Base64 encoded image data
   */
  private async fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
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
