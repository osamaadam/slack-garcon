import { APIGatewayProxyHandler } from "aws-lambda";
import { App, AwsLambdaReceiver } from "@slack/bolt";
import { config } from "./config";
import { GeminiService } from "./services/gemini.service";
import { SlackService } from "./services/slack.service";
import { ImageProcessingService } from "./services/image-processing.service";
import { EventHandlerService } from "./services/event-handler.service";

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: config.slackSigningSecret,
});

const app = new App({
  token: config.slackBotToken,
  receiver: awsLambdaReceiver,
});

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

slackService.initialize().catch((error) => {
  console.error("Failed to initialize SlackService:", error);
});

app.event("app_mention", async ({ event }) => {
  await eventHandlerService.handleAppMention(event);
});

export const handler = async (
  event: Parameters<APIGatewayProxyHandler>[0],
  context: Parameters<APIGatewayProxyHandler>[1],
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<ReturnType<APIGatewayProxyHandler>> => {
  const lambdaHandler = await awsLambdaReceiver.start();
  return lambdaHandler(event, context, callback);
};
