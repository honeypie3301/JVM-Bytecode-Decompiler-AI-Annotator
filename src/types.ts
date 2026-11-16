import { ParsedClass } from "./classParser";

export interface DecompiledResult {
  javaSource: string;
  classSummary: string;
  summaryModel?: string;
  annotations: Array<{
    method: string;
    concept: string;
    explanation: string;
  }>;
  includeAnnotations?: boolean;
}

export interface DecompilerFile {
  id: string;
  name: string;
  size: number;
  status: "idle" | "parsing" | "parsed" | "decompiling" | "decompiled" | "failed";
  parsedClass?: ParsedClass;
  rawBase64?: string;
  envelopeSeal?: string;
  mappingName?: string;
  decompiledResult?: DecompiledResult;
  decompileProgress?: string;
  error?: string;
  isProtected?: boolean;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  fileName: string;
  className: string;
  fileSize: number;
  flagged: boolean;
  reason?: string;
  ipPlaceholder?: string;
}

export type WorkspaceTab = "java" | "bytecode" | "structure";
