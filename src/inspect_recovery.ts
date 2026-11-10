import { infraiFromEnvironment } from "./infrai_client.js";

const webhookId = process.argv[2];
const queue = process.env.SHIPMENT_QUEUE ?? "shipment-events";
if (!webhookId) throw new Error("Pass the webhook id: npm run inspect -- <id>");

const infrai = infraiFromEnvironment();
const deliveries = await infrai.webhookDeliveries(webhookId);
const failed = deliveries.items.filter((delivery) => delivery.status === "failed");
const recovery = failed.length > 0 ? await infrai.redrive(queue) : { redriven: 0 };
console.log(JSON.stringify({ webhook_id: webhookId, failed: failed.length, redriven: recovery.redriven }, null, 2));
