import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getAppConfig } from "@/lib/app-config";

function getKey(): Buffer {
  return createHash("sha256")
    .update(getAppConfig().security.encryptionSecret)
    .digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [ivPart, tagPart, encryptedPart] = value.split(":");

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Stored secret is malformed.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
