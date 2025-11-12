import { APIGatewayProxyHandler } from "aws-lambda";
import { SQS } from "@aws-sdk/client-sqs";
import { App, AwsLambdaReceiver } from "@slack/bolt";
import { config } from "./config";

const sqs = new SQS();

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: config.slackSigningSecret,
});

const app = new App({
  token: config.slackBotToken,
  receiver: awsLambdaReceiver,
});

// Queue events instead of processing them
app.event("app_mention", async ({ event }) => {
  await sqs.sendMessage({
    QueueUrl: process.env.EVENTS_QUEUE_URL!,
    MessageBody: JSON.stringify(event),
  });
});

export const handler: APIGatewayProxyHandler = async (
  event,
  context,
  callback
) => {
  const lambdaHandler = await awsLambdaReceiver.start();
  return lambdaHandler(event, context, callback);
};
