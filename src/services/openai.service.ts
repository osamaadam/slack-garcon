import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseInputContent,
} from "openai/resources/responses/responses";
import logger from "../logger";
import { Message } from "./gemini.service";
import { loadSystemPrompt } from "./system-prompt";
import { GarconReply, replySchema } from "./reply";
import { TalabatMenu, fetchTalabatMenu } from "./talabat";
import { cacheMenu, getCachedMenu, getChannelRestaurants, rememberRestaurant } from "./store";

export interface ReplyContext {
  channel: string;
  city: string;
}

const MAX_TOOL_ROUNDS = 4;

const menuTool = {
  type: "function" as const,
  name: "get_talabat_menu",
  description:
    "Fetch the live menu (item names in Arabic and exact prices in EGP), branch, city and delivery fee of a Talabat Egypt restaurant page.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description: "A https://www.talabat.com/egypt/restaurant/<id>/<slug> URL (with or without /ar/).",
      },
    },
  },
};

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

  async generateResponse(messages: Message[], context?: ReplyContext): Promise<GarconReply> {
    const instructions = await loadSystemPrompt();
    let input: ResponseInputItem[] = [];
    if (context) input.push({ role: "developer", content: await describeContext(context) });
    input.push(...messages.map(toInputItem));

    logger.info("Calling OpenAI", {
      model: this.model,
      messages: messages.length,
      images: messages.reduce((n, m) => n + (m.images?.length ?? 0), 0),
      city: context?.city,
    });

    const fetched: TalabatMenu[] = [];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.client.responses.create({
        model: this.model,
        instructions,
        input,
        tools: [
          menuTool,
          {
            type: "web_search",
            search_context_size: "medium",
            user_location: { type: "approximate", country: "EG", ...(context && { city: context.city }) },
          },
        ],
        text: {
          format: { type: "json_schema", name: "garcon_reply", strict: true, schema: replySchema },
        },
        ...(this.reasoningEffort && {
          reasoning: { effort: this.reasoningEffort },
        }),
      });

      const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      logger.info("OpenAI response received", {
        model: this.model,
        round,
        toolCalls: calls.map((c) => c.name),
        webSearches: res.output.filter((o) => o.type === "web_search_call").length,
        usage: res.usage,
      });

      if (!calls.length) {
        if (context) await Promise.all(fetched.map((m) => rememberRestaurant(context.channel, m)));
        return JSON.parse(res.output_text) as GarconReply;
      }

      // Reasoning and tool-call items go back as-is so the model keeps its chain.
      input = [...input, ...(res.output as ResponseInputItem[])];
      for (const call of calls) {
        input.push({ type: "function_call_output", call_id: call.call_id, output: await runMenuTool(call, fetched) });
      }
    }
    throw new Error("Too many tool rounds");
  }
}

async function runMenuTool(call: ResponseFunctionToolCall, fetched: TalabatMenu[]): Promise<string> {
  try {
    const { url } = JSON.parse(call.arguments) as { url: string };
    let menu = await getCachedMenu(url);
    if (!menu) {
      menu = await fetchTalabatMenu(url);
      await cacheMenu(menu);
    }
    fetched.push(menu);
    return JSON.stringify({
      restaurant: menu.restaurant,
      branch: menu.branch,
      url: menu.url,
      delivery_fee: menu.deliveryFee,
      minimum_order: menu.minimumOrder,
      items: menu.items.map((i) => `${i.name} | ${i.price} | ${i.section}`),
    });
  } catch (error) {
    logger.warn("Talabat menu tool failed", {
      args: call.arguments,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: error instanceof Error ? error.message : "menu fetch failed" });
  }
}

async function describeContext({ channel, city }: ReplyContext): Promise<string> {
  const known = await getChannelRestaurants(channel);
  const lines = [`This channel orders in ${city}, Egypt. Prefer ${city} branches.`];
  if (known.length) {
    lines.push("Restaurants this channel used before (Talabat pages):");
    lines.push(...known.map((k) => `- ${k.restaurant} (${k.branch}): ${k.url}`));
  }
  return lines.join("\n");
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
