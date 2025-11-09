import { GoogleGenerativeAI } from "@google/generative-ai";

export interface Message {
  role: "user" | "model";
  content: string;
}

/**
 * Service for interacting with Gemini AI
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
  }

  /**
   * Generates a response based on the conversation context
   * @param messages - Array of messages representing the conversation thread
   * @returns Promise resolving to the AI-generated response
   */
  async generateResponse(messages: Message[]): Promise<string> {
    const prompt = this.buildPrompt(messages);

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text;
  }

  /**
   * Builds a structured prompt from message history
   * @param messages - Array of messages to format
   * @returns Formatted prompt string
   */
  private buildPrompt(messages: Message[]): string {
    const systemPrompt = `You are Garcon, a helpful and playful AI assistant in a Slack workspace.
You're professional yet approachable, like a skilled French waiter who knows how to keep things light while getting the job done.
Be concise, friendly, and occasionally sprinkle in a touch of charm. Keep responses focused and helpful.`;

    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Garcon";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    return `${systemPrompt}\n\nConversation:\n${conversationText}\n\nGarcon:`;
  }
}
