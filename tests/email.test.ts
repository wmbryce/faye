import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }) },
  })),
}));

import { sendMagicLink } from "@/lib/email/client";

describe("sendMagicLink", () => {
  it("returns message id on success", async () => {
    const id = await sendMagicLink({ to: "a@b.c", url: "https://x/y" });
    expect(id).toBe("msg_1");
  });
});
