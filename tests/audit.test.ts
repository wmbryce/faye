import { describe, it, expect } from "vitest";
import { writeAudit } from "@/lib/audit/log";
import { listAuditFor } from "@/lib/audit/queries";

describe("audit log", () => {
  it("writes + reads entries scoped to entity", async () => {
    await writeAudit({ entityType: "campaign", entityId: "c1", event: "created", payload: { foo: 1 } });
    await writeAudit({ entityType: "campaign", entityId: "c1", event: "activated" });
    await writeAudit({ entityType: "campaign", entityId: "c2", event: "created" });

    const rows = await listAuditFor("campaign", "c1");
    expect(rows.map((r) => r.event).sort()).toEqual(["activated", "created"]);
    expect(rows.find((r) => r.event === "created")?.payload).toEqual({ foo: 1 });

    expect(await listAuditFor("campaign", "nonexistent")).toHaveLength(0);
  });
});
