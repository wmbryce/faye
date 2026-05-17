import { describe, it, expect } from "vitest";
import { setSecret } from "@/lib/secrets/mutations";
import { getSecret, listSecretKeys } from "@/lib/secrets/queries";
import { encrypt, decrypt } from "@/lib/secrets/crypto";

describe("secrets crypto", () => {
  it("encrypt/decrypt roundtrip", () => {
    const cipherText = encrypt("hello world");
    expect(cipherText).not.toBe("hello world");
    expect(decrypt(cipherText)).toBe("hello world");
  });

  it("two encrypts of the same plaintext produce different ciphertexts (IV is random)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("decrypt of tampered ciphertext throws", () => {
    const c = encrypt("secret");
    const buf = Buffer.from(c, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});

describe("secrets store", () => {
  it("set + get roundtrip", async () => {
    await setSecret("fb.access_token", "super-secret-value");
    expect(await getSecret("fb.access_token")).toBe("super-secret-value");
  });

  it("update overwrites", async () => {
    await setSecret("k", "v1");
    await setSecret("k", "v2");
    expect(await getSecret("k")).toBe("v2");
  });

  it("missing returns null", async () => {
    expect(await getSecret("nope")).toBeNull();
  });

  it("listSecretKeys returns sorted keys", async () => {
    await setSecret("b", "x");
    await setSecret("a", "x");
    expect(await listSecretKeys()).toEqual(["a", "b"]);
  });
});
