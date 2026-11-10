import assert from "node:assert/strict";
import test from "node:test";
import { decideShipment, shipmentEventSchema } from "../src/shipment_decision.js";

test("a delivered shipment without proof is held for attention", () => {
  const event = shipmentEventSchema.parse({
    event_id: "evt_1042",
    shipment_id: "ship_2048",
    kind: "delivered",
    occurred_at: "2026-09-27T10:30:00.000Z",
  });

  assert.deepEqual(decideShipment(event), {
    state: "needs_attention",
    reason: "delivery has no proof",
  });
});
