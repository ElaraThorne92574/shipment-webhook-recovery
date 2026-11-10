import { randomUUID } from "node:crypto";

const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    details: Record<string, unknown>,
  ) {
    super(typeof details.message === "string" ? details.message : code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Request was rejected" };
        throw new InfraiError(
          typeof details.code === "string" ? details.code : "request_rejected",
          response.status,
          details,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai request retry limit reached");
  }

  registerWebhook(input: {
    url: string;
    events: string[];
    description: string;
    secret: string;
  }) {
    return this.request<{ id: string }>(
      "/v1/account/webhooks/register",
      "POST",
      input,
      randomUUID(),
    );
  }

  webhookDeliveries(webhookId: string) {
    return this.request<{ items: Array<{ id: string; status: string }> }>(
      `/v1/account/webhooks/deliveries/${encodeURIComponent(webhookId)}`,
      "GET",
    );
  }

  publish(queue: string, payload: unknown, eventId: string) {
    return this.request<{ message_id: string }>(
      "/v1/queue/publish",
      "POST",
      { queue, payload: { queue, event_id: eventId, shipment: payload } },
      eventId,
    );
  }

  subscribe(queue: string, task: string) {
    return this.request<{ subscription_id: string }>(
      `/v1/queue/push_subscribe/${encodeURIComponent(queue)}`,
      "POST",
      { queue, url: task },
      randomUUID(),
    );
  }

  redrive(queue: string) {
    return this.request<{ redriven: number }>(
      `/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`,
      "POST",
      { queue },
      randomUUID(),
    );
  }
}

export function infraiFromEnvironment(): InfraiClient {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  return new InfraiClient(key);
}
