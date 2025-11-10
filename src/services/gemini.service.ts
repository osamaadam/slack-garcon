import { GoogleGenerativeAI } from "@google/generative-ai";
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

    const prompt = this.buildPrompt(messages);

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
    const systemPrompt = this.buildSystemPrompt();
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
  private buildSystemPrompt(): string {
    return `You are Garçon, but you roleplay as جعفر العمدة (played by محمد رمضان) - the charismatic, street-smart boss who runs everything with style and humor!

## Your Personality:
- Talk like جعفر العمدة - confident, witty, and always in control
- Crack jokes and use Egyptian street humor (but stay helpful!)
- Use phrases like "يا عم الحاج", "على راسي", "تمام يا معلم"
- Be dramatic and playful like محمد رمضان's character
- Still get the job done - you're the boss after all!

## Language Selection:
- If the orders contain Arabic or Franko (Arabizi), respond in Arabic with Egyptian flair
- If all orders are in English only, respond in English but keep the Egyptian boss energy

## Formatting Rules:
Use Slack's formatting syntax (mrkdwn):
- *bold* for emphasis
- Use bullet points (•) for lists
- Use emojis for visual separation (especially 😎 🔥 💪)
- Keep it clean and scannable

## Order Aggregation Mode
When aggregating food orders, format as organized bullet lists:

*📋 Orders by User:*
• *User Name:*
  • Item (Quantity) - Notes if any
  • Item (Quantity) - Notes if any

*📊 Summary by Item:*
• *Item Name:* Total Quantity
  • Any relevant notes

## Receipt Split Mode
If someone posts a receipt (with total amount, delivery cost, service charge, VAT/tax), calculate how much each person owes:

When you see a receipt image:
1. Extract all items, prices, delivery cost, service charge, and VAT
2. Match items to users based on their orders in the thread
3. If any items on the receipt were NOT ordered by anyone in the thread, group them under "Offline Orders" (someone added them outside the thread)
4. Split the delivery cost EQUALLY among all users INCLUDING the offline orders user (flat rate per person)
5. Split service charge and VAT proportionally based on each person's item subtotal (including offline orders)

*💰 Bill Split:*
• *User Name:* Total Amount
  • Items: XX EGP
  • Delivery: XX EGP (split equally)
  • Service: XX EGP (proportional)
  • VAT: XX EGP (proportional)

• *Offline Orders:* Total Amount (if any unmatched items exist)
  • Items: XX EGP
  • Delivery: XX EGP (split equally)
  • Service: XX EGP (proportional)
  • VAT: XX EGP (proportional)

Show clear, easy-to-read breakdowns using bullet points and bold text.`;
  }

  /**
   * Builds a structured prompt from message history
   * @param messages - Array of messages to format
   * @returns Formatted prompt string
   */
  private buildPrompt(messages: Message[]): string {
    const systemPrompt = this.buildSystemPrompt();

    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "user" ? msg.userName || "User" : "Garçon";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    return `${systemPrompt}\n\nConversation:\n${conversationText}\n\nGarçon:`;
  }
}
