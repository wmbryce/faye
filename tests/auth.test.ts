import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const sendMagicLinkMock = vi.fn().mockResolvedValue("msg_1");
vi.mock("@/lib/email/client", () => ({ sendMagicLink: (a: any) => sendMagicLinkMock(a) }));

import { POST as requestPOST } from "@/app/api/auth/request/route";
import { GET as verifyGET } from "@/app/api/auth/verify/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessions";

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("auth", () => {
  it("request: rejects non-operator email", async () => {
    const res = await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: "nope@x.com" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("request: emails the operator a link", async () => {
    sendMagicLinkMock.mockClear();
    const res = await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: process.env.OPERATOR_EMAIL }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    expect(sendMagicLinkMock).toHaveBeenCalledOnce();
    const url = sendMagicLinkMock.mock.calls[0][0].url as string;
    expect(url).toContain("/api/auth/verify?token=");
  });

  it("verify: rejects bad token", async () => {
    const res = await verifyGET(makeReq("http://x/api/auth/verify?token=bogus"));
    expect(res.status).toBe(401);
  });

  it("verify: with valid token creates user + session + redirects", async () => {
    sendMagicLinkMock.mockClear();
    await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: process.env.OPERATOR_EMAIL }),
        headers: { "content-type": "application/json" },
      })
    );
    const url = sendMagicLinkMock.mock.calls[0][0].url as string;
    const res = await verifyGET(makeReq(url));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    const rows = await db.select().from(users).where(eq(users.email, process.env.OPERATOR_EMAIL!));
    expect(rows).toHaveLength(1);
  });

  it("logout: clears cookie", async () => {
    const res = await logoutPOST(makeReq("http://x/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });
});
