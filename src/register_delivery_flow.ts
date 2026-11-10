import { infraiFromEnvironment } from "./infrai_client.js";

const publicUrl = process.env.PUBLIC_WEBHOOK_URL;
const queueHandlerUrl = process.env.PUBLIC_QUEUE_HANDLER_URL;
const secret = process.env.INFRAI_WEBHOOK_SECRET;
const queue = process.env.SHIPMENT_QUEUE ?? "shipment-events";
if (!publicUrl || !queueHandlerUrl || !secret) {
  throw new Error("Set PUBLIC_WEBHOOK_URL, PUBLIC_QUEUE_HANDLER_URL, and INFRAI_WEBHOOK_SECRET");
}

const infrai = infraiFromEnvironment();
const webhook = await infrai.registerWebhook({
  url: publicUrl,
  events: ["queue.dlq"],
  description: "Logistics shipment event intake",
  secret,
});
const subscription = await infrai.subscribe(queue, queueHandlerUrl);
console.log(JSON.stringify({ webhook_id: webhook.id, subscription_id: subscription.subscription_id }, null, 2));
