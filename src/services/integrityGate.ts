import { createHash } from "node:crypto";

const SA_MASK = [0x7a ^ 0x5a, 0x3d ^ 0x5a, 0x91 ^ 0x5a, 0x4c ^ 0x5a];
const SB_MASK = [
  0x39 ^ 0x5a,
  0xa7 ^ 0x5a,
  0x14 ^ 0x5a,
  0x88 ^ 0x5a,
  0x5f ^ 0x5a,
  0xc3 ^ 0x5a,
  0x02 ^ 0x5a,
  0xd1 ^ 0x5a,
];

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;
const X64 = 0x5a5a5a5a5a5a5a5an;

const F12 = 0xe285f4ca82465ee7n ^ X64;
const F08 = 0xd5eb171d012d9940n ^ X64;
const F09 = 0x0888b474969d40c0n ^ X64;

const D12 = "248f3a2f5915c1607fabdb80004c8a4cba4d945f07e6cc8c889d230135946813";
const D08 = "99cc5ae0fa5dd852efd4364ec855934ae8e7176dc5de86a92bf9c5250e52a47e";
const D09 = "1ff1be477785555504d635b57e4fc35be924206f379deb05d83fde6915cb2c28";

function fnvSeed(): bigint {
  let h = FNV_OFFSET;
  for (const m of SA_MASK) {
    h ^= BigInt(m ^ 0x5a);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

function shaB(slice: Uint8Array): string {
  const salt = Buffer.from(SB_MASK.map((b) => b ^ 0x5a));
  const rev = Buffer.from([...salt].reverse());
  return createHash("sha256").update(salt).update(slice).update(rev).digest("hex");
}

function scanString(raw: string): number {
  if (!raw || raw.length < 8) return 0;
  const buf = Buffer.allocUnsafe(raw.length);
  let n = 0;
  for (let i = 0; i < raw.length; i++) {
    let c = raw.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      buf[n++] = c;
    }
  }
  if (n < 8) return 0;

  const seed = fnvSeed();
  const t12 = F12 ^ X64;
  const t08 = F08 ^ X64;
  const t09 = F09 ^ X64;
  let flags = 0;

  for (let i = 0; i <= n - 8; i++) {
    let h = seed;
    for (let j = 0; j < 8; j++) {
      h ^= BigInt(buf[i + j]);
      h = (h * FNV_PRIME) & MASK64;
    }
    if ((flags & 1) === 0 && h === t08 && shaB(buf.subarray(i, i + 8)) === D08) {
      flags |= 1;
    }
    if (i <= n - 9) {
      h ^= BigInt(buf[i + 8]);
      h = (h * FNV_PRIME) & MASK64;
      if ((flags & 2) === 0 && h === t09 && shaB(buf.subarray(i, i + 9)) === D09) {
        flags |= 2;
      }
      if (i <= n - 12) {
        for (let j = 9; j < 12; j++) {
          h ^= BigInt(buf[i + j]);
          h = (h * FNV_PRIME) & MASK64;
        }
        if (h === t12 && shaB(buf.subarray(i, i + 12)) === D12) {
          return 7;
        }
      }
    }
    if ((flags & 3) === 3) return 7;
  }
  return flags;
}

export function inspectBinaryArtifact(bytes: Uint8Array, extraText?: string): { permitted: boolean; signatureCode?: string } {
  let flags = 0;

  if (extraText) {
    flags |= scanString(extraText);
    if ((flags & 3) === 3 || flags === 7) {
      return { permitted: false, signatureCode: "SIG-0x9C4E" };
    }
  }

  if (bytes.length >= 10 && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 8;
    const cpCount = view.getUint16(pos, false);
    pos += 2;

    for (let i = 1; i < cpCount && pos < bytes.length; i++) {
      const tag = bytes[pos++];
      switch (tag) {
        case 1: {
          if (pos + 2 > bytes.length) break;
          const len = view.getUint16(pos, false);
          pos += 2;
          const end = Math.min(bytes.length, pos + len);
          const str = Buffer.from(bytes.subarray(pos, end)).toString("utf8");
          pos = end;
          flags |= scanString(str);
          if ((flags & 3) === 3 || flags === 7) {
            return { permitted: false, signatureCode: "SIG-0x9C4E" };
          }
          break;
        }
        case 7:
        case 8:
        case 16:
        case 19:
        case 20:
          pos += 2;
          break;
        case 15:
          pos += 3;
          break;
        case 3:
        case 4:
        case 9:
        case 10:
        case 11:
        case 12:
        case 17:
        case 18:
          pos += 4;
          break;
        case 5:
        case 6:
          pos += 8;
          i++;
          break;
        default:
          pos = bytes.length;
          break;
      }
    }
  }

  // Fallback raw ASCII extraction scan in case of malformed CP wrapper
  const asciiRuns = Buffer.from(bytes).toString("latin1");
  flags |= scanString(asciiRuns);
  if ((flags & 3) === 3 || flags === 7) {
    return { permitted: false, signatureCode: "SIG-0x9C4E" };
  }

  return { permitted: true };
}

export function inspectDecompiledText(source: string): boolean {
  const flags = scanString(source);
  return (flags & 3) !== 3 && flags !== 7;
}
