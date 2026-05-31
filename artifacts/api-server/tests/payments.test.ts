import { describe, it, expect, vi } from "vitest";

// ─── Mock job queue ────────────────────────────────────────────────────────────
const mockEnqueue = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/jobQueue", () => ({
  jobQueue: { enqueue: mockEnqueue },
}));

// ─── Unit tests for payment job queue enqueue logic ───────────────────────────

describe("Payment job queue", () => {
  it("enqueues a payment job with completed status on ride completion", () => {
    const payload = {
      userId: 1,
      rideId: 100,
      bookingId: null,
      amount: "45.50",
      method: "wallet",
      status: "completed",
      notes: "Ride #100 (car) — 12.3 km",
    };

    mockEnqueue("payment", payload);

    expect(mockEnqueue).toHaveBeenCalledWith("payment", expect.objectContaining({
      status: "completed",
      method: "wallet",
      rideId: 100,
    }));
  });

  it("enqueues a payment job with refunded status on booking cancellation", () => {
    const payload = {
      userId: 2,
      bookingId: 55,
      rideId: null,
      amount: "120.00",
      method: "wallet",
      status: "refunded",
      notes: "Refund for booking #55",
    };

    mockEnqueue("payment", payload);

    expect(mockEnqueue).toHaveBeenCalledWith("payment", expect.objectContaining({
      status: "refunded",
      bookingId: 55,
    }));
  });

  it("booking complete creates a payment job with completed status", () => {
    const payload = {
      userId: 3,
      bookingId: 77,
      rideId: null,
      amount: "85.00",
      method: "wallet",
      status: "completed",
    };

    mockEnqueue("payment", payload);

    const call = mockEnqueue.mock.calls.find(
      ([type, p]: [string, Record<string, unknown>]) => type === "payment" && p["bookingId"] === 77
    );
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ status: "completed", amount: "85.00" });
  });
});
