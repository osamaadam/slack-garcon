import { SQSHandler } from "aws-lambda";
import { GeminiService } from "./services/gemini.service";
import { SlackService } from "./services/slack.service";
import { ImageProcessingService } from "./services/image-processing.service";
import { EventHandlerService } from "./services/event-handler.service";
import { config } from "./config";

const slackService = new SlackService(config.slackBotToken);
const geminiService = new GeminiService(
  config.geminiApiKey,
  config.geminiModel
);
const imageProcessingService = new ImageProcessingService();

const eventHandlerService = new EventHandlerService(
  slackService,
  geminiService,
  imageProcessingService
);

let initialized = false;

export const handler: SQSHandler = async (event) => {
  // Initialize once per container
  if (!initialized) {
    await slackService.initialize();
    initialized = true;
  }

  // Process each SQS record (should be 1 per invocation)
  for (const record of event.Records) {
    const slackEvent = JSON.parse(record.body);

    if (slackEvent.type === "app_mention") {
      try {
        await eventHandlerService.handleAppMention(slackEvent);
      } catch (error) {
        console.error("Error processing app_mention:", error);
        throw error; // Let SQS retry
      }
    }
  }
};
