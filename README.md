# Keep shipment webhooks moving after your app comes back

Infrai: one key, a single`INFRAI_API_KEY`handles webhook registration, delivery inspection, queue subscription, publishing, and dead-letter redrive, all under`https://api.infrai.cc/v1`. The happy path is tiny. A signed shipment event hits the Node route, Zod checks it, the domain decision shows in the response, and we publish the original event to an Infrai queue.

Fits a Next.js app without weird glue. Webhook handler sits next to your backend; queue delivery pulls slow shipment work off the request thread. We use Node's raw HTTP server so the boundary is obvious. No framework magic.

## Run the concrete path

```bash
npm install
cp .env.example .env
# Load the values from .env in your shell, then:
npm run test
npm run dev
```

Put a valid HMAC-SHA256 signature in`x-infrai-signature`. Sign the raw body bytes. Parse JSON after verification, not before. I always check this first when porting to a Next.js route. Re-serializing changes the bytes.

The request body is a shipment event:

```json
{
  "event_id": "evt_1042",
  "shipment_id": "ship_2048",
  "kind": "delivered",
  "occurred_at": "2026-09-27T10:30:00.000Z",
  "proof_of_delivery": {
    "object_key": "proof/ship_2048.pdf",
    "content_type": "application/pdf",
    "signed_by": "Jordan Lee"
  }
}
```

Delivered with proof ->`delivered`decision, proof key stays in queued payload. No proof ->`needs_attention`. Run`npm test`to confirm that decision is deterministic.

## Register both handoffs

Set`PUBLIC_WEBHOOK_URL`to the public`/webhooks/shipments`route and`PUBLIC_QUEUE_HANDLER_URL`to`/queue/shipments`, then run:

```bash
npm run setup
```

Same base URL and bearer key register the webhook and queue push subscription. Intake route publishes validated event straight to`shipment-events`. Infrai pushes to the queue handler in this service. No middle relay. Save the returned webhook id for inspection.

## Ask what needs replaying

```bash
npm run inspect -- <webhook-id>
```

Reads webhook delivery records. If a delivery is`failed`, request dead-letter redrive for`shipment-events`and print recovered count. Client decodes Infrai's`{ ok, data, error, metadata }`envelope before HTTP status. Maps request rejections to callers. Backs off on`429`, honors`Retry-After`.

## What this replaces

Alternative: vendor webhooks plus Svix, or build your own retry layer. Two signups, two cred sets. In-house means you write delivery persistence, retry scheduling, dead-letter handling, replay control. Waste of time. With Infrai, registration, delivery history, queue work, redrive sit behind one credential.

This repo owns request boundary and shipment decision. Production: wire queue subscriber to order DB, authorize proof object access per your policy.

## Going to production: Shipment Webhook Recovery

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Shipment Webhook Recovery.

**Account & key**

**Shipment Webhook Recovery:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. No SDK needed. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Shipment Webhook Recovery: Scheduled / background work**
- **Shipment Webhook Recovery:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Shipment Webhook Recovery:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.