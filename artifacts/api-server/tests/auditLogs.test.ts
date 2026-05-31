import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the job queue (vi.hoisted avoids the temporal dead zone) ─────────────
const mockEnqueue = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/jobQueue", () => ({
  jobQueue: { enqueue: mockEnqueue },
}));

// ─── Import after mocking ──────────────────────────────────────────────────────
import { writeAuditLog } from "../src/lib/auditLog";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("writeAuditLog", () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
  });

  it("enqueues an audit_log job with correct payload", () => {
    const entry = {
      userId: 1,
      action: "CREATE",
      entityType: "vehicle",
      entityId: 42,
      newData: { plateNumber: "ABC123" },
      ipAddress: "127.0.0.1",
    };

    writeAuditLog(entry);

    expect(mockEnqueue).toHaveBeenCalledOnce();
    expect(mockEnqueue).toHaveBeenCalledWith("audit_log", entry);
  });

  it("enqueues job with null optional fields when not provided", () => {
    writeAuditLog({ action: "DELETE", entityType: "bus" });

    expect(mockEnqueue).toHaveBeenCalledOnce();
    const [type, payload] = mockEnqueue.mock.calls[0]!;
    expect(type).toBe("audit_log");
    expect(payload).toMatchObject({ action: "DELETE", entityType: "bus" });
  });

  it("vehicle CREATE triggers an audit_log enqueue", () => {
    writeAuditLog({
      userId: 5,
      action: "CREATE",
      entityType: "vehicle",
      entityId: 10,
      newData: { plateNumber: "XYZ789", vehicleType: "car" },
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    });

    expect(mockEnqueue).toHaveBeenCalledWith("audit_log", expect.objectContaining({
      action: "CREATE",
      entityType: "vehicle",
    }));
  });

  it("does not throw when enqueue fails", () => {
    mockEnqueue.mockImplementationOnce(() => { throw new Error("Queue full"); });

    expect(() => writeAuditLog({ action: "CREATE", entityType: "zone" })).not.toThrow();
  });
});
