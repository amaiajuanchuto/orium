/**
 * Decrypts a backup file produced by encrypt-backup.mjs.
 *
 * Usage: BACKUP_PASSPHRASE=... node scripts/decrypt-backup.mjs <input.enc> <output.json>
 */
import { createDecipheriv, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) {
  throw new Error("BACKUP_PASSPHRASE environment variable is required");
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/decrypt-backup.mjs <input.enc> <output.json>");
}

const data = await readFile(inputPath);

const salt = data.subarray(0, 16);
const iv = data.subarray(16, 28);
const authTag = data.subarray(28, 44);
const ciphertext = data.subarray(44);

const key = scryptSync(passphrase, salt, 32);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);

const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
await writeFile(outputPath, plaintext);
console.log(`Decrypted ${inputPath} -> ${outputPath}`);
