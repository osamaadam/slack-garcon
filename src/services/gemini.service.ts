import { GoogleGenerativeAI } from "@google/generative-ai";
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
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
  private botToken: string;

  constructor(apiKey: string, slackBotToken: string, modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
    });
    this.botToken = slackBotToken;
  }

  /**
   * Generates a response based on the conversation context
   * @param messages - Array of messages representing the conversation thread
   * @returns Promise resolving to the AI-generated response
   */
  async generateResponse(messages: Message[]): Promise<string> {
    const hasImages = messages.some(
      (msg) => msg.images && msg.images.length > 0
    );

    if (hasImages) {
      return this.generateResponseWithImages(messages);
    }

    const prompt = await this.buildPrompt(messages);

    logger.debug("Gemini prompt generated", {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 500),
    });

    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    logger.debug("Gemini response received", {
      responseLength: text.length,
      responsePreview: text.substring(0, 300),
    });

    return text;
  }

  /**
   * Generates a response when images are present in the conversation
   * @param messages - Array of messages with potential images
   * @returns Promise resolving to the AI-generated response
   */
  private async generateResponseWithImages(
    messages: Message[]
  ): Promise<string> {
    const systemPrompt = await this.buildSystemPrompt();
    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [];

    parts.push({ text: systemPrompt });
    parts.push({ text: "\nConversation:\n" });

    for (const msg of messages) {
      const role = msg.role === "user" ? msg.userName || "User" : "Garçon";
      parts.push({ text: `${role}: ${msg.content}\n` });

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

    parts.push({ text: "\nGarçon:" });

    const textPartCount = parts.filter((p) => "text" in p).length;
    const imagePartCount = parts.filter((p) => "inlineData" in p).length;

    logger.debug("Gemini prompt with images generated", {
      textPartCount,
      imagePartCount,
    });

    const result = await this.model.generateContent(parts);
    const response = result.response;
    const text = response.text();

    logger.debug("Gemini response with images received", {
      responseLength: text.length,
      responsePreview: text.substring(0, 300),
    });

    return text;
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
   * Builds a structured prompt from message history
   * @param messages - Array of messages to format
   * @returns Formatted prompt string
   */
  private async buildSystemPrompt(): Promise<string> {
    const prompt = await readFile(
      join(__dirname, "..", "..", "system_prompt.txt"),
      "utf-8"
    );
    return prompt;
  }

  /**
   * Builds a structured prompt from message history
   * @param messages - Array of messages to format
   * @returns Formatted prompt string
   */
  private async buildPrompt(messages: Message[]): Promise<string> {
    const systemPrompt = await this.buildSystemPrompt();

    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "user" ? msg.userName || "User" : "Garçon";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    return `${systemPrompt}\n\nConversation:\n${conversationText}\n\nGarçon:`;
  }
}
