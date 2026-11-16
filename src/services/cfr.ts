import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { inspectBinaryArtifact, inspectDecompiledText } from "./integrityGate.js";

const execFileAsync = promisify(execFile);

const MAX_CLASS = 8 * 1024 * 1024;
const MAX_MAPPING = 16 * 1024 * 1024;
const MAX_CACHE = 16 * 1024 * 1024;

function getJreDownloadUrl(): string {
  const osName = process.platform === "win32" ? "windows" : "linux";
  const archName = process.arch === "arm64" ? "aarch64" : "x64";
  return `https://api.adoptium.net/v3/binary/latest/21/ga/${osName}/${archName}/jre/hotspot/normal/eclipse`;
}

function getJavaExecutableName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

function resolveBinDir(): string {
  const candidates = [path.resolve("bin"), path.resolve(process.cwd(), "bin")];
  return candidates.find((dir) => existsSync(path.join(dir, "cfr.jar"))) || candidates[0];
}

const cache = new Map<string, string>();
let cacheSize = 0;
let worker: ChildProcessWithoutNullStreams | undefined;
let queue = Promise.resolve();
let javaInstallPromise: Promise<string> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let workerMapping: string | undefined;
let previousMapping: string | undefined;
let mappingKey = "";

export class CfrCancelledError extends Error {
  constructor(message = "Decompilation cancelled") {
    super(message);
    this.name = "AbortError";
  }
}

export class CfrRestrictedError extends Error {
  constructor(message = "RESTRICTED_ARTIFACT_SIGNATURE") {
    super(message);
    this.name = "RestrictedArtifactError";
  }
}

export function readClassMapping(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value) > MAX_MAPPING ||
    !/^[^\s#]+\s+->\s+[^\s:]+:\s*$/m.test(value)
  ) {
    throw new Error("Invalid ProGuard/R8 mapping file (up to 16 MiB).");
  }
  return value;
}

async function isExecutableJava(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function resolveJavaCommand(): Promise<string> {
  const exe = getJavaExecutableName();
  const candidates = [
    process.env.JAVA_BIN,
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", exe) : undefined,
    path.join(resolveBinDir(), "jre", "bin", exe),
    process.platform !== "win32" ? "/tmp/temurin-jdk/bin/java" : undefined,
    path.join(os.tmpdir(), "jadai-jre", "bin", exe),
    exe,
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (candidate === exe || existsSync(candidate)) {
      if (await isExecutableJava(candidate)) {
        return candidate;
      }
    }
  }

  javaInstallPromise ??= bootstrapJreRuntime().catch((err) => {
    javaInstallPromise = undefined;
    throw err;
  });
  return javaInstallPromise;
}

function parseOctal(buf: Buffer): number {
  const raw = buf.toString("utf8").replace(/\0.*$/, "").trim();
  return raw ? parseInt(raw, 8) || 0 : 0;
}

function parsePaxRecords(buf: Buffer): Record<string, string> {
  const records: Record<string, string> = {};
  let pos = 0;
  while (pos < buf.length) {
    const spaceIdx = buf.indexOf(0x20, pos);
    if (spaceIdx === -1) break;
    const len = parseInt(buf.subarray(pos, spaceIdx).toString("utf8"), 10);
    if (!Number.isFinite(len) || len <= 0 || pos + len > buf.length) break;
    const rec = buf.subarray(spaceIdx + 1, pos + len - 1).toString("utf8");
    const eqIdx = rec.indexOf("=");
    if (eqIdx !== -1) {
      records[rec.slice(0, eqIdx)] = rec.slice(eqIdx + 1);
    }
    pos += len;
  }
  return records;
}

async function extractTarGzStripOne(gzBytes: Buffer, destDir: string): Promise<void> {
  const tar = gunzipSync(gzBytes);
  let off = 0;
  let paxHeaders: Record<string, string> = {};
  let gnuLongName: string | undefined;
  let gnuLongLink: string | undefined;
  const pendingLinks: Array<{ linkPath: string; target: string }> = [];

  while (off + 512 <= tar.length) {
    const hdr = tar.subarray(off, off + 512);
    off += 512;
    if (hdr.every((b) => b === 0)) break;

    const typeFlag = String.fromCharCode(hdr[156] || 0);
    const size = parseOctal(hdr.subarray(124, 136));
    const mode = parseOctal(hdr.subarray(100, 108));
    const dataEnd = off + size;
    const data = tar.subarray(off, Math.min(dataEnd, tar.length));
    off += Math.ceil(size / 512) * 512;

    if (typeFlag === "x") {
      paxHeaders = { ...paxHeaders, ...parsePaxRecords(data) };
      continue;
    }
    if (typeFlag === "g") {
      continue;
    }
    if (typeFlag === "L") {
      gnuLongName = data.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (typeFlag === "K") {
      gnuLongLink = data.toString("utf8").replace(/\0+$/, "");
      continue;
    }

    const namePart = hdr.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefixPart = hdr.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const defaultName = prefixPart ? `${prefixPart}/${namePart}` : namePart;
    const fullName = paxHeaders.path || gnuLongName || defaultName;
    const linkTarget = paxHeaders.linkpath || gnuLongLink || hdr.subarray(157, 257).toString("utf8").replace(/\0.*$/, "");

    paxHeaders = {};
    gnuLongName = undefined;
    gnuLongLink = undefined;

    const cleanParts = fullName
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p && p !== ".");
    if (cleanParts.length <= 1 || cleanParts.includes("..")) continue;

    const relPath = cleanParts.slice(1).join(path.sep);
    const outPath = path.resolve(destDir, relPath);
    if (!outPath.startsWith(destDir + path.sep)) continue;

    if (typeFlag === "5" || fullName.endsWith("/")) {
      await mkdir(outPath, { recursive: true });
    } else if (typeFlag === "2") {
      await mkdir(path.dirname(outPath), { recursive: true });
      pendingLinks.push({ linkPath: outPath, target: linkTarget });
    } else if (typeFlag === "0" || typeFlag === "\0") {
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, data);
      if (mode) {
        await chmod(outPath, mode & 0o777).catch(() => {});
      }
    }
  }

  for (const { linkPath, target } of pendingLinks) {
    await rm(linkPath, { force: true }).catch(() => {});
    await symlink(target, linkPath).catch(() => {});
  }
}

async function bootstrapJreRuntime(): Promise<string> {
  const targetDir = path.join(os.tmpdir(), "jadai-jre");
  const javaBin = path.join(targetDir, "bin", getJavaExecutableName());
  if (existsSync(javaBin) && (await isExecutableJava(javaBin))) {
    return javaBin;
  }

  await mkdir(os.tmpdir(), { recursive: true });
  const stageDir = await mkdtemp(path.join(os.tmpdir(), "jadai-jre-stage-"));

  try {
    const resp = await fetch(getJreDownloadUrl(), { redirect: "follow" });
    if (!resp.ok) {
      throw new Error(`Failed to fetch JRE runtime (${resp.status})`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const extractDir = path.join(stageDir, "extracted");
    await mkdir(extractDir, { recursive: true });

    if (process.platform === "win32") {
      const archivePath = path.join(stageDir, "jre.zip");
      const unzipDir = path.join(stageDir, "unzipped");
      await writeFile(archivePath, buf);
      await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${unzipDir.replace(/'/g, "''")}' -Force`,
        ],
        { timeout: 120_000 }
      );
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(unzipDir, { withFileTypes: true });
      const topDir = entries.find((e) => e.isDirectory());
      if (!topDir) {
        throw new Error("Unexpected JRE zip layout");
      }
      await rename(path.join(unzipDir, topDir.name), extractDir);
    } else {
      await extractTarGzStripOne(buf, extractDir);
    }

    await rm(targetDir, { recursive: true, force: true }).catch(() => {});
    await rename(extractDir, targetDir).catch(async () => {
      if (!existsSync(javaBin)) {
        throw new Error("Unable to place JRE runtime");
      }
    });
    return javaBin;
  } finally {
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function decompileClassWithCfr(
  bytes: Uint8Array,
  options?: { mapping?: string; fileName?: string; signal?: AbortSignal }
): Promise<string> {
  const { mapping, fileName, signal } = options || {};

  if (signal?.aborted) {
    throw new CfrCancelledError();
  }

  if (bytes.length < 8 || bytes[0] !== 0xca || bytes[1] !== 0xfe || bytes[2] !== 0xba || bytes[3] !== 0xbe) {
    throw new Error("Invalid Java class binary (missing CAFEBABE magic header).");
  }
  if (bytes.length > MAX_CLASS) {
    throw new Error("Class file exceeds the 8 MiB per-class CFR limit.");
  }

  const gate = inspectBinaryArtifact(bytes, fileName);
  if (!gate.permitted) {
    throw new CfrRestrictedError();
  }

  if (mapping !== previousMapping) {
    previousMapping = mapping;
    mappingKey = mapping ? createHash("sha256").update(mapping).digest("hex") : "";
  }

  const key = createHash("sha256").update(bytes).digest("hex") + mappingKey;

  const run = queue.then(async () => {
    if (signal?.aborted) {
      throw new CfrCancelledError();
    }

    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      if (!inspectDecompiledText(cached)) {
        cache.delete(key);
        throw new CfrRestrictedError();
      }
      return cached;
    }

    const output = await request(bytes, mapping, signal);
    if (!inspectDecompiledText(output)) {
      throw new CfrRestrictedError();
    }

    const size = Buffer.byteLength(output);
    if (size <= MAX_CACHE) {
      while (cacheSize + size > MAX_CACHE || cache.size >= 128) {
        const first = cache.keys().next().value;
        if (!first) break;
        cacheSize -= Buffer.byteLength(cache.get(first) || "");
        cache.delete(first);
      }
      cache.set(key, output);
      cacheSize += size;
    }
    return output;
  });

  queue = run.then(
    () => {},
    () => {}
  );

  return run;
}

async function start(): Promise<ChildProcessWithoutNullStreams> {
  const bin = resolveBinDir();
  const jar = path.join(bin, "cfr.jar");
  const bridge = path.join(bin, "JadAiCfr.jar");
  const javaCmd = await resolveJavaCommand();

  const args = existsSync(bridge)
    ? ["-cp", [jar, bridge].join(path.delimiter), "JadAiCfr"]
    : ["-cp", jar, path.join(bin, "JadAiCfr.java")];

  const child = spawn(javaCmd, ["-Xmx320m", "-XX:+UseSerialGC", ...args], {
    windowsHide: true,
  });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  child.on("error", () => {});
  child.on("close", () => {
    if (worker === child) worker = undefined;
  });
  workerMapping = undefined;
  worker = child;
  return child;
}

async function request(
  bytes: Uint8Array,
  mapping?: string,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new CfrCancelledError();
  }
  clearTimeout(idle);
  const child = worker ?? (await start());
  if (signal?.aborted) {
    throw new CfrCancelledError();
  }

  try {
    return await new Promise<string>((resolve, reject) => {
      const lines = createInterface({ input: child.stdout });
      let settled = false;

      const finish = (error?: Error, output?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        lines.close();
        child.off("error", onError);
        child.off("close", onClose);
        if (error) reject(error);
        else resolve(output!);
      };

      const onError = () => finish(new Error("Java runtime is unavailable for CFR decompilation."));
      const onClose = () => finish(new Error("The CFR decompiler worker exited unexpectedly."));
      const onAbort = () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        if (worker === child) worker = undefined;
        finish(new CfrCancelledError());
      };

      const timer = setTimeout(() => {
        finish(new Error("The class exceeded the 45-second CFR decompilation limit."));
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        if (worker === child) worker = undefined;
      }, 45_000);

      signal?.addEventListener("abort", onAbort, { once: true });
      child.once("error", onError);
      child.once("close", onClose);

      lines.once("line", (line) => {
        const tabIdx = line.indexOf("\t");
        const status = tabIdx === -1 ? line : line.slice(0, tabIdx);
        const value = tabIdx === -1 ? "" : line.slice(tabIdx + 1);
        const output = Buffer.from(value, "base64").toString("utf8");
        if (status === "ok") {
          finish(undefined, output);
        } else if (output.includes("RESTRICTED_ARTIFACT_SIGNATURE")) {
          finish(new CfrRestrictedError());
        } else {
          finish(new Error(output || "CFR returned an invalid response."));
        }
      });

      const encoded =
        mapping === workerMapping && mapping
          ? "-"
          : Buffer.from(mapping ?? "").toString("base64");
      workerMapping = mapping;
      child.stdin.write(`${Buffer.from(bytes).toString("base64")}\t${encoded}\n`);
    });
  } finally {
    idle = setTimeout(() => {
      if (worker === child) worker = undefined;
      child.stdin.end();
    }, 30_000);
    idle.unref();
  }
}
