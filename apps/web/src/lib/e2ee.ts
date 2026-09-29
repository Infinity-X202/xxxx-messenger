const DB = "ixm-e2ee";
const STORE = "keys";

export type Envelope = {
  v: 1;
  alg: "ECDH-P256-AES-GCM";
  senderDeviceId: string;
  iv: string;
  ct: string;
  wrapped: Record<string, string>;
};

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}

function fromB64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<CryptoKeyPair | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: CryptoKeyPair) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ensureDeviceKeys(): Promise<{ publicKeySpki: string }> {
  let pair = await idbGet("device");
  if (!pair) {
    pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    await idbSet("device", pair);
  }
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return { publicKeySpki: b64(spki) };
}

async function importSpki(b64Key: string) {
  return crypto.subtle.importKey("spki", fromB64(b64Key), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function wrapKeyForDevice(aesRaw: ArrayBuffer, theirSpki: string, ourPrivate: CryptoKey) {
  const theirPub = await importSpki(theirSpki);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPub }, ourPrivate, 256);
  const kek = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, aesRaw);
  return b64(iv) + "." + b64(wrapped);
}

async function unwrapKeyFromDevice(payload: string, theirSpki: string, ourPrivate: CryptoKey) {
  const [ivB64, ctB64] = payload.split(".");
  const theirPub = await importSpki(theirSpki);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPub }, ourPrivate, 256);
  const kek = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64!) }, kek, fromB64(ctB64!));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

export async function encryptText(
  plaintext: string,
  senderDeviceId: string,
  devices: { id: string; publicKey: string }[],
): Promise<string> {
  const pair = await idbGet("device");
  if (!pair) throw new Error("Missing local device key");
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(plaintext));
  const raw = await crypto.subtle.exportKey("raw", aes);
  const wrapped: Record<string, string> = {};
  for (const d of devices) {
    wrapped[d.id] = await wrapKeyForDevice(raw, d.publicKey, pair.privateKey);
  }
  const env: Envelope = { v: 1, alg: "ECDH-P256-AES-GCM", senderDeviceId, iv: b64(iv), ct: b64(ct), wrapped };
  return JSON.stringify(env);
}

export async function decryptText(
  ciphertext: string,
  selfDeviceId: string,
  devices: { id: string; publicKey: string }[],
): Promise<string> {
  try {
    const env = JSON.parse(ciphertext) as Envelope & { mode?: string; plaintext?: string };
    if (env.mode === "compat" && typeof env.plaintext === "string") return env.plaintext;
    if (env.v !== 1 || !env.wrapped) return "[Message not decryptable on this device]";
    const pair = await idbGet("device");
    if (!pair) return "[No local private key]";
    const wrapped = env.wrapped[selfDeviceId];
    if (!wrapped) return "[Encrypted for other devices]";
    const sender = devices.find((d) => d.id === env.senderDeviceId);
    if (!sender) return "[Missing sender device key]";
    const aes = await unwrapKeyFromDevice(wrapped, sender.publicKey, pair.privateKey);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, aes, fromB64(env.ct));
    return new TextDecoder().decode(pt);
  } catch {
    return "[Unable to decrypt]";
  }
}

export async function encryptForConversation(
  plaintext: string,
  senderDeviceId: string,
  devices: { id: string; publicKey: string }[],
): Promise<string> {
  if (devices.length === 0) {
    return JSON.stringify({ v: 1, mode: "compat", plaintext });
  }
  return encryptText(plaintext, senderDeviceId, devices);
}
