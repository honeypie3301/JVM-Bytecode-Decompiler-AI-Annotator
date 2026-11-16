import type { ParsedClass } from "../classParser";

const SA_M = [65, 113, 204, 34, 157, 136, 202, 231];
const D12_M = [
  159, 123, 141, 102, 66, 240, 19, 210, 56, 221, 206, 85, 28, 120, 191, 110, 140, 171, 24, 39, 173,
  108, 70, 17, 197, 148, 180, 12, 120, 85, 222, 188,
];
const D08_M = [
  146, 178, 17, 4, 105, 187, 199, 40, 112, 47, 19, 210, 130, 90, 32, 27, 51, 80, 187, 46, 5, 217,
  5, 17, 184, 26, 157, 240, 23, 24, 10, 245,
];
const D09_M = [
  78, 6, 97, 84, 218, 112, 134, 236, 82, 171, 100, 58, 171, 252, 202, 226, 105, 236, 20, 226, 14,
  71, 87, 108, 193, 176, 21, 77, 182, 215, 253, 19,
];

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const F_OFFSET = 0xcbf29ce484222325n;
const F_PRIME = 0x100000001b3n;
const F_MASK = 0xffffffffffffffffn;
const X64 = 0xa3a3a3a3a3a3a3a3n;

const T12 = 0xe285f4ca82465ee7n ^ X64;
const T08 = 0xd5eb171d012d9940n ^ X64;
const T09 = 0x0888b474969d40c0n ^ X64;
const CANARY_PREFIX = "606609bbba93c23a";

function sha256Sync(input: Uint8Array): Uint8Array {
  const len = input.length;
  const bitLen = len * 8;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[len] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function unmaskSalt(): Uint8Array {
  const out = new Uint8Array(SA_M.length);
  for (let i = 0; i < SA_M.length; i++) {
    out[i] = SA_M[i] ^ ((i * 17 + 0x3b) & 0xff);
  }
  return out;
}

function verifyMaskedDigest(token: Uint8Array, masked: number[]): boolean {
  const salt = unmaskSalt();
  const payload = new Uint8Array(salt.length * 2 + token.length);
  payload.set(salt, 0);
  payload.set(token, salt.length);
  for (let i = 0; i < salt.length; i++) {
    payload[salt.length + token.length + i] = salt[salt.length - 1 - i];
  }
  const digest = sha256Sync(payload);
  for (let i = 0; i < 32; i++) {
    if ((digest[i] ^ ((i * 29 + 0x5a) & 0xff)) !== masked[i]) {
      return false;
    }
  }
  return true;
}

function seedFnv(): bigint {
  const salt = unmaskSalt();
  let h = F_OFFSET;
  for (let i = 0; i < 4; i++) {
    h ^= BigInt(salt[i]);
    h = (h * F_PRIME) & F_MASK;
  }
  return h;
}

function scanBytesNormalized(rawBytes: Uint8Array): number {
  if (rawBytes.length < 8) return 0;
  const norm = new Uint8Array(rawBytes.length);
  let n = 0;
  for (let i = 0; i < rawBytes.length; i++) {
    let c = rawBytes[i];
    if (c >= 65 && c <= 90) c += 32;
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      norm[n++] = c;
    }
  }
  if (n < 8) return 0;

  const seed = seedFnv();
  const t12 = T12 ^ X64;
  const t08 = T08 ^ X64;
  const t09 = T09 ^ X64;
  let flags = 0;

  for (let i = 0; i <= n - 8; i++) {
    let h = seed;
    for (let j = 0; j < 8; j++) {
      h ^= BigInt(norm[i + j]);
      h = (h * F_PRIME) & F_MASK;
    }
    if ((flags & 1) === 0 && h === t08 && verifyMaskedDigest(norm.subarray(i, i + 8), D08_M)) {
      flags |= 1;
    }
    if (i <= n - 9) {
      h ^= BigInt(norm[i + 8]);
      h = (h * F_PRIME) & F_MASK;
      if ((flags & 2) === 0 && h === t09 && verifyMaskedDigest(norm.subarray(i, i + 9), D09_M)) {
        flags |= 2;
      }
      if (i <= n - 12) {
        for (let j = 9; j < 12; j++) {
          h ^= BigInt(norm[i + j]);
          h = (h * F_PRIME) & F_MASK;
        }
        if (h === t12 && verifyMaskedDigest(norm.subarray(i, i + 12), D12_M)) {
          return 7;
        }
      }
    }
    if ((flags & 3) === 3) return 7;
  }
  return flags;
}

function scanText(text: string): number {
  if (!text || text.length < 8) return 0;
  return scanBytesNormalized(new TextEncoder().encode(text));
}

export function foldConstantPoolEntropy(entryBytes: Uint8Array, acc: number): number {
  const prevFlags = acc & 0x7;
  const hit = scanBytesNormalized(entryBytes) & 0x7;
  const mergedFlags = prevFlags | hit;
  let mix = (acc >>> 3) ^ (entryBytes.length * 0x9e3779b1);
  for (let i = 0; i < Math.min(entryBytes.length, 16); i++) {
    mix = ((mix << 5) - mix + entryBytes[i]) | 0;
  }
  return ((mix & 0x0fffffff) << 3) | mergedFlags;
}

function verifyEngineCanary(): boolean {
  const salt = unmaskSalt();
  const label = new TextEncoder().encode("jvm_envelope_v2");
  const payload = new Uint8Array(salt.length * 2 + label.length);
  payload.set(salt, 0);
  payload.set(label, salt.length);
  for (let i = 0; i < salt.length; i++) {
    payload[salt.length + label.length + i] = salt[salt.length - 1 - i];
  }
  const digest = sha256Sync(payload);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += digest[i].toString(16).padStart(2, "0");
  }
  return hex === CANARY_PREFIX;
}

export interface EnvelopeSealResult {
  allowed: boolean;
  seal: string;
  code?: string;
}

export function inspectAndSealArtifact(
  buffer: ArrayBuffer | undefined,
  parsed: ParsedClass | undefined,
  fileName: string
): EnvelopeSealResult {
  let state = 0x10;
  let flags = 0;
  let canaryOk = false;
  let seal = "";

  while (state !== 0xff) {
    switch (state) {
      case 0x10: {
        canaryOk = verifyEngineCanary();
        if (!canaryOk || !parsed) {
          return { allowed: false, seal: "", code: "SIG-0x7E01" };
        }
        const cpFlags = (parsed.cpDigestFlags ?? 0) & 0x7;
        flags |= cpFlags;
        state = (flags & 3) === 3 || (flags & 4) !== 0 ? 0x90 : 0x20;
        break;
      }
      case 0x20: {
        const metaChunks = [
          fileName,
          parsed!.thisClassName || "",
          parsed!.superClassName || "",
          ...(parsed!.interfaces || []),
          ...parsed!.fields.map((f) => `${f.name} ${f.descriptor}`),
          ...parsed!.methods.map((m) => `${m.name} ${m.descriptor}`),
        ];
        for (const chunk of metaChunks) {
          flags |= scanText(chunk);
          if ((flags & 3) === 3 || (flags & 4) !== 0) {
            state = 0x90;
            break;
          }
        }
        if (state !== 0x90) state = 0x30;
        break;
      }
      case 0x30: {
        for (const cp of parsed!.constantPool) {
          if (cp.details) {
            flags |= scanText(cp.details);
            if ((flags & 3) === 3 || (flags & 4) !== 0) {
              state = 0x90;
              break;
            }
          }
        }
        if (state !== 0x90) state = 0x40;
        break;
      }
      case 0x40: {
        if (buffer) {
          flags |= scanBytesNormalized(new Uint8Array(buffer));
          if ((flags & 3) === 3 || (flags & 4) !== 0) {
            state = 0x90;
            break;
          }
        }
        state = 0x50;
        break;
      }
      case 0x50: {
        const rawSummary = `${parsed!.thisClassName}|${parsed!.majorVersion}|${parsed!.constantPool.length}|${parsed!.methods.length}|${flags}`;
        const digest = sha256Sync(new TextEncoder().encode(rawSummary));
        seal = Array.from(digest.slice(0, 12))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        state = 0xff;
        break;
      }
      case 0x90: {
        return {
          allowed: false,
          seal: "",
          code: "SIG-0x9C4E",
        };
      }
      default:
        return { allowed: false, seal: "", code: "SIG-0x7E00" };
    }
  }

  return { allowed: canaryOk && Boolean(seal), seal };
}
