import { z } from "zod";

export const shipmentEventSchema = z.object({
  event_id: z.string().min(1),
  shipment_id: z.string().min(1),
  kind: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
  occurred_at: z.string().datetime(),
  proof_of_delivery: z
    .object({
      object_key: z.string().min(1),
      content_type: z.string().min(1),
      signed_by: z.string().min(1),
    })
    .optional(),
  exception: z
    .object({ code: z.string().min(1), note: z.string().min(1) })
    .optional(),
});

export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export type ShipmentDecision =
  | { state: "delivered"; proofObjectKey: string }
  | { state: "needs_attention"; reason: string }
  | { state: "moving" };

export function decideShipment(event: ShipmentEvent): ShipmentDecision {
  if (event.kind === "delivered") {
    if (!event.proof_of_delivery) {
      return { state: "needs_attention", reason: "delivery has no proof" };
    }
    return { state: "delivered", proofObjectKey: event.proof_of_delivery.object_key };
  }
  if (event.kind === "exception") {
    return {
      state: "needs_attention",
      reason: event.exception?.note ?? "carrier exception needs review",
    };
  }
  return { state: "moving" };
}
