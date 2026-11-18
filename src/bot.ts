import { App } from "@slack/bolt";
import logger from "./logger";
import { EnvConfig } from "./config";
import { createLlmService } from "./services/llm";
import { ImageProcessingService } from "./services/image-processing.service";
import { SlackService } from "./services/slack.service";
import { EventHandlerService } from "./services/event-handler.service";

/**
 * Main bot orchestrator that handles Slack events and AI interactions
 */
export class GarconBot {
  private app: App;
  private eventHandlerService: EventHandlerService;
  private slackService: SlackService;

  constructor(config: EnvConfig) {
    this.app = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      signingSecret: config.slackSigningSecret,
      socketMode: true,
    });

    this.slackService = new SlackService(config.slackBotToken);
    const imageProcessingService = new ImageProcessingService();
    const llmService = createLlmService(config);

    this.eventHandlerService = new EventHandlerService(
      this.slackService,
      llmService,
      imageProcessingService
    );

    this.registerEventHandlers();
  }

  /**
   * Registers all Slack event handlers
   */
  private registerEventHandlers(): void {
    this.app.event("app_mention", async ({ event }) => {
      await this.eventHandlerService.handleAppMention(event);
    });
  }

  /**
   * Starts the bot and initializes services
   */
  async start(port: number): Promise<void> {
    await this.slackService.initialize();
    await this.app.start(port);
    logger.info("Garcon is ready to serve", { port });
  }

  /**
   * Gracefully stops the bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    logger.info("Garcon has left the building");
  }
}
