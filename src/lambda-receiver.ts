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

// The thumbs under each reply; logged so we can find bad answers in CloudWatch.
app.action("garcon_feedback", async ({ ack, body, action }) => {
  await ack();
  const b = body as unknown as {
    user?: { id?: string };
    channel?: { id?: string };
    message?: { ts?: string; thread_ts?: string };
  };
  console.log(
    JSON.stringify({
      msg: "Garcon feedback",
      value: (action as { value?: string }).value,
      user: b.user?.id,
      channel: b.channel?.id,
      messageTs: b.message?.ts,
      threadTs: b.message?.thread_ts,
    })
  );
});

export const handler: APIGatewayProxyHandler = async (
  event,
  context,
  callback
) => {
  const lambdaHandler = await awsLambdaReceiver.start();
  return lambdaHandler(event, context, callback);
};
