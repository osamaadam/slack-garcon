import OpenAI from "openai";
import type {
  ResponseInputItem,
  ResponseInputContent,
} from "openai/resources/responses/responses";
import logger from "../logger";
import { Message } from "./gemini.service";
import { loadSystemPrompt } from "./system-prompt";
import { GarconReply, replySchema } from "./reply";

type ReasoningEffort = "low" | "medium" | "high";

export class OpenAiService {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
    private reasoningEffort?: ReasoningEffort
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(messages: Message[]): Promise<GarconReply> {
    const instructions = await loadSystemPrompt();
    const input = messages.map(toInputItem);

    logger.info("Calling OpenAI", {
      model: this.model,
      messages: input.length,
      images: messages.reduce((n, m) => n + (m.images?.length ?? 0), 0),
    });

    const res = await this.client.responses.create({
      model: this.model,
      instructions,
      input,
      text: {
        format: { type: "json_schema", name: "garcon_reply", strict: true, schema: replySchema },
      },
      ...(this.reasoningEffort && {
        reasoning: { effort: this.reasoningEffort },
      }),
    });

    logger.info("OpenAI response received", {
      model: this.model,
      usage: res.usage,
    });
    return JSON.parse(res.output_text) as GarconReply;
  }
}

function toInputItem(msg: Message): ResponseInputItem {
  if (msg.role === "model") {
    return { role: "assistant", content: msg.content };
  }
  const content: ResponseInputContent[] = [
    { type: "input_text", text: `${msg.userName || "User"}: ${msg.content}` },
  ];
  for (const image of msg.images ?? []) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.data}`,
      detail: "high",
    });
  }
  return { role: "user", content };
}
