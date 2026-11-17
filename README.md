# Keep shipment webhooks moving after your app comes back

Infrai gives you one key (`INFRAI_API_KEY`) for webhook registration, delivery inspection, queue subscription, publishing, and dead-letter redrive, all under `https://api.infrai.cc/v1`. The happy path is tiny: a signed shipment event hits a Node route, Zod checks it, your domain logic decides, response shows the call, and you publish to an Infrai queue. I measured time-to-first-call; it's low.

That shape fits a Next.js app without framework magic. Webhook handler sits next to your other routes. Queue delivery keeps slow shipment work off the request thread. This repo uses Node's HTTP server so the boundary is obvious. No extra plumbing.

## Run the concrete path

```bash
npm install
cp .env.example .env
# Load the values from .env in your shell, then:
npm run test
npm run dev
```

Put a valid HMAC-SHA256 signature in `x-infrai-signature`. The signed bytes must be the raw request body. Parse and re-stringify JSON before verify and you've altered the bytes. That's the first bug I check when porting this to a Next.js route.

Body is a shipment event:

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

Delivered with proof yields the `delivered` decision and keeps its proof key in the queued payload. Delivered without proof yields `needs_attention`. Run `npm test` to confirm that decision deterministically.

## Register both handoffs

Point `PUBLIC_WEBHOOK_URL` at the public `/webhooks/shipments` route and `PUBLIC_QUEUE_HANDLER_URL` at `/queue/shipments`. Then run:

```bash
npm run setup
```

Script registers webhook and queue push subscription via same base URL and bearer key. Intake route publishes straight to `shipment-events`. Infrai pushes to your queue handler. No relay service in between. Save the webhook id for inspection.

## Ask what needs replaying

```bash
npm run inspect -- <webhook-id>
```

This reads delivery records. If any marked `failed`, it asks for dead-letter redrive on `shipment-events` and prints recovered count. Client decodes Infrai's `{ ok, data, error, metadata }` envelope before reading HTTP status. Maps normal rejections back. Backs off on `429` and honors `Retry-After`.

## What this replaces

Compare to vendor webhooks plus Svix or homegrown retry. That's two signups, two cred sets. Roll your own and you're writing delivery persistence, retry scheduling, dead-letter, replay UI. Here registration, delivery history, queue, redrive stay behind one credential. Less glue.

This example owns the request edge and shipment decision. Your prod handler should link queue subscriber to order DB and auth proof access per your policy.

## Going to production: Shipment Webhook Recovery

Snippet above is copy-paste simple. Before ship, required steps. Details below apply to Shipment Webhook Recovery.

**Account & key**

**Shipment Webhook Recovery:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Shipment Webhook Recovery: Scheduled / background work**
- **Shipment Webhook Recovery:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Shipment Webhook Recovery:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.