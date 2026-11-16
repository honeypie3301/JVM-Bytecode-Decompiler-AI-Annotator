import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { inspectBinaryArtifact, inspectDecompiledText } from "./integrityGate.js";

const execFileAsync = promisify(execFile);

const MAX_CLASS = 8 * 1024 * 1024;
const MAX_MAPPING = 16 * 1024 * 1024;
const MAX_CACHE = 16 * 1024 * 1024;
const JRE_DOWNLOAD_URL =
  "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse";

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
  const candidates = [
    process.env.JAVA_BIN,
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java") : undefined,
    path.resolve("bin", "jre", "bin", "java"),
    "/tmp/temurin-jdk/bin/java",
    path.join(os.tmpdir(), "jadai-jre", "bin", "java"),
    "java",
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (candidate === "java" || existsSync(candidate)) {
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

async function bootstrapJreRuntime(): Promise<string> {
  const targetDir = path.join(os.tmpdir(), "jadai-jre");
  const javaBin = path.join(targetDir, "bin", "java");
  if (existsSync(javaBin) && (await isExecutableJava(javaBin))) {
    return javaBin;
  }

  await mkdir(os.tmpdir(), { recursive: true });
  const stageDir = await mkdtemp(path.join(os.tmpdir(), "jadai-jre-stage-"));
  const archivePath = path.join(stageDir, "jre.tar.gz");

  try {
    const resp = await fetch(JRE_DOWNLOAD_URL, { redirect: "follow" });
    if (!resp.ok) {
      throw new Error(`Failed to fetch JRE runtime (${resp.status})`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(archivePath, buf);

    const extractDir = path.join(stageDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir, "--strip-components=1"], {
      timeout: 120_000,
    });

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
  const bin = path.resolve("bin");
  const jar = path.join(bin, "cfr.jar");
  const bridge = path.join(bin, "JadAiCfr.jar");
  const javaCmd = await resolveJavaCommand();

  const args = existsSync(bridge)
    ? ["-cp", [jar, bridge].join(path.delimiter), "JadAiCfr"]
    : ["-cp", jar, path.join(bin, "JadAiCfr.java")];

  const child = spawn(javaCmd, ["-Xmx384m", "-XX:+UseSerialGC", ...args], {
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
