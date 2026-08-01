/**
 * Encrypts a JSON backup file with AES-256-GCM, so it's unreadable without
 * the passphrase — used before uploading backups anywhere outside our own
 * infrastructure (e.g. Google Drive).
 *
 * Output layout: [16-byte salt][12-byte IV][16-byte auth tag][ciphertext].
 *
 * Usage: BACKUP_PASSPHRASE=... node scripts/encrypt-backup.mjs <input.json> <output.enc>
 */
import { randomBytes, createCipheriv, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) {
  throw new Error("BACKUP_PASSPHRASE environment variable is required");
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/encrypt-backup.mjs <input.json> <output.enc>");
}

const plaintext = await readFile(inputPath);

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(passphrase, salt, 32);

const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();

await writeFile(outputPath, Buffer.concat([salt, iv, authTag, ciphertext]));
console.log(`Encrypted ${inputPath} -> ${outputPath} (${ciphertext.length} bytes)`);
