import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { infraiFromEnvironment, InfraiError } from "./infrai_client.js";
import { decideShipment, shipmentEventSchema } from "./shipment_decision.js";

const queue = process.env.SHIPMENT_QUEUE ?? "shipment-events";
const secret = (() => {
  const value = process.env.INFRAI_WEBHOOK_SECRET;
  if (!value) throw new Error("Set INFRAI_WEBHOOK_SECRET");
  return value;
})();
const infrai = infraiFromEnvironment();

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function verified(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = Buffer.from(signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/queue/shipments") {
    let rawQueueBody = "";
    for await (const chunk of request) rawQueueBody += chunk;
    const queued = (() => {
      try { return JSON.parse(rawQueueBody) as { shipment?: unknown }; } catch { return {}; }
    })();
    const event = shipmentEventSchema.safeParse(queued.shipment);
    if (!event.success) {
      send(response, 400, { error: "invalid queued shipment event", issues: event.error.issues });
      return;
    }
    send(response, 200, {
      shipment_id: event.data.shipment_id,
      decision: decideShipment(event.data),
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/webhooks/shipments") {
    send(response, 404, { error: "route not found" });
    return;
  }

  let rawBody = "";
  for await (const chunk of request) rawBody += chunk;
  if (!verified(rawBody, request.headers["x-infrai-signature"] as string | undefined)) {
    send(response, 401, { error: "invalid signature" });
    return;
  }

  const parsedJson = (() => {
    try { return JSON.parse(rawBody) as unknown; } catch { return undefined; }
  })();
  const parsed = shipmentEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    send(response, 400, { error: "invalid shipment event", issues: parsed.error.issues });
    return;
  }

  try {
    const decision = decideShipment(parsed.data);
    const queued = await infrai.publish(queue, parsed.data, parsed.data.event_id);
    send(response, 202, { shipment_id: parsed.data.shipment_id, decision, message_id: queued.message_id });
  } catch (error) {
    if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        message: error.message,
      });
      return;
    }
    send(response, 502, { error: "queue transport error" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Shipment gateway listening on http://localhost:${process.env.PORT ?? 3000}`);
});
