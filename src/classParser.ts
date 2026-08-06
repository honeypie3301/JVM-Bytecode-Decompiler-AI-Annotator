/**
 * JVM .class File Parser
 * High-fidelity parser for compiled Java bytecode classes.
 * Decodes the binary structure, disassembles bytecode opcodes,
 * and maps constant pool references.
 */

export interface ParsedClass {
  magic: string;
  minorVersion: number;
  majorVersion: number;
  jdkVersion: string;
  constantPool: CPInfo[];
  accessFlags: number;
  accessFlagsNames: string[];
  thisClassName: string;
  superClassName: string;
  interfaces: string[];
  fields: ParsedField[];
  methods: ParsedMethod[];
}

export interface CPInfo {
  index: number;
  tag: number;
  tagName: string;
  details: string;
  raw: any;
}

export interface ParsedField {
  accessFlags: number;
  accessFlagsNames: string[];
  name: string;
  descriptor: string;
  attributes: ParsedAttribute[];
}

export interface ParsedMethod {
  accessFlags: number;
  accessFlagsNames: string[];
  name: string;
  descriptor: string;
  attributes: ParsedAttribute[];
  code?: ParsedCode;
}

export interface ParsedAttribute {
  name: string;
  length: number;
  info: Uint8Array;
}

export interface ParsedCode {
  maxStack: number;
  maxLocals: number;
  instructions: Instruction[];
  exceptionTable: ExceptionTableEntry[];
}

export interface Instruction {
  offset: number;
  opcode: number;
  mnemonic: string;
  operands: number[];
  details: string;
}

export interface ExceptionTableEntry {
  startPc: number;
  endPc: number;
  handlerPc: number;
  catchType: number;
  catchClassName: string;
}

// JVM Constants
const CP_TAGS = {
  Utf8: 1,
  Integer: 3,
  Float: 4,
  Long: 5,
  Double: 6,
  Class: 7,
  String: 8,
  Fieldref: 9,
  Methodref: 10,
  InterfaceMethodref: 11,
  NameAndType: 12,
  MethodHandle: 15,
  MethodType: 16,
  Dynamic: 17,
  InvokeDynamic: 18,
  Module: 19,
  Package: 20,
};

const CP_TAG_NAMES: { [key: number]: string } = {
  1: "Utf8",
  3: "Integer",
  4: "Float",
  5: "Long",
  6: "Double",
  7: "Class",
  8: "String",
  9: "Fieldref",
  10: "Methodref",
  11: "InterfaceMethodref",
  12: "NameAndType",
  15: "MethodHandle",
  16: "MethodType",
  17: "Dynamic",
  18: "InvokeDynamic",
  19: "Module",
  20: "Package",
};

// Access Flags Mapping
const ACCESS_FLAGS = {
  PUBLIC: 0x0001,
  PRIVATE: 0x0002,
  PROTECTED: 0x0004,
  STATIC: 0x0008,
  FINAL: 0x0010,
  SUPER: 0x0020, // also SYNCHRONIZED
  SYNCHRONIZED: 0x0020,
  VOLATILE: 0x0040, // also BRIDGE
  TRANSIENT: 0x0080, // also VARARGS
  NATIVE: 0x0100,
  INTERFACE: 0x0200,
  ABSTRACT: 0x0400,
  STRICT: 0x0800,
  SYNTHETIC: 0x1000,
  ANNOTATION: 0x2000,
  ENUM: 0x4000,
  MODULE: 0x8000,
};

export function getAccessFlagNames(flags: number, isClass: boolean = false): string[] {
  const list: string[] = [];
  if (flags & ACCESS_FLAGS.PUBLIC) list.push("public");
  if (flags & ACCESS_FLAGS.PRIVATE) list.push("private");
  if (flags & ACCESS_FLAGS.PROTECTED) list.push("protected");
  if (flags & ACCESS_FLAGS.STATIC) list.push("static");
  if (flags & ACCESS_FLAGS.FINAL) list.push("final");
  if (isClass && (flags & ACCESS_FLAGS.INTERFACE)) {
    list.push("interface");
  } else {
    if (flags & ACCESS_FLAGS.ABSTRACT) list.push("abstract");
  }
  if (!isClass && (flags & ACCESS_FLAGS.NATIVE)) list.push("native");
  if (flags & ACCESS_FLAGS.SYNCHRONIZED) {
    if (!isClass) list.push("synchronized");
  }
  if (flags & ACCESS_FLAGS.VOLATILE) {
    if (!isClass) list.push("volatile");
  }
  if (flags & ACCESS_FLAGS.TRANSIENT) {
    if (!isClass) list.push("transient");
  }
  if (flags & ACCESS_FLAGS.ENUM) list.push("enum");
  if (flags & ACCESS_FLAGS.ANNOTATION) list.push("@interface");
  return list;
}

// Map Java major version to readable JDK version
export function getJdkVersion(major: number): string {
  if (major >= 45 && major <= 48) return `JDK 1.${major - 44}`;
  if (major >= 49) return `Java ${major - 44}`;
  return "Unknown JDK";
}

// Opcode Mnemonics and Operands size
export const OPCODES: { [key: number]: { name: string; operands: number } } = {
  0x00: { name: "nop", operands: 0 },
  0x01: { name: "aconst_null", operands: 0 },
  0x02: { name: "iconst_m1", operands: 0 },
  0x03: { name: "iconst_0", operands: 0 },
  0x04: { name: "iconst_1", operands: 0 },
  0x05: { name: "iconst_2", operands: 0 },
  0x06: { name: "iconst_3", operands: 0 },
  0x07: { name: "iconst_4", operands: 0 },
  0x08: { name: "iconst_5", operands: 0 },
  0x09: { name: "lconst_0", operands: 0 },
  0x0a: { name: "lconst_1", operands: 0 },
  0x0b: { name: "fconst_0", operands: 0 },
  0x0c: { name: "fconst_1", operands: 0 },
  0x0d: { name: "fconst_2", operands: 0 },
  0x0e: { name: "dconst_0", operands: 0 },
  0x0f: { name: "dconst_1", operands: 0 },
  0x10: { name: "bipush", operands: 1 },
  0x11: { name: "sipush", operands: 2 },
  0x12: { name: "ldc", operands: 1 },
  0x13: { name: "ldc_w", operands: 2 },
  0x14: { name: "ldc2_w", operands: 2 },
  0x15: { name: "iload", operands: 1 },
  0x16: { name: "lload", operands: 1 },
  0x17: { name: "fload", operands: 1 },
  0x18: { name: "dload", operands: 1 },
  0x19: { name: "aload", operands: 1 },
  0x1a: { name: "iload_0", operands: 0 },
  0x1b: { name: "iload_1", operands: 0 },
  0x1c: { name: "iload_2", operands: 0 },
  0x1d: { name: "iload_3", operands: 0 },
  0x1e: { name: "lload_0", operands: 0 },
  0x1f: { name: "lload_1", operands: 0 },
  0x20: { name: "lload_2", operands: 0 },
  0x21: { name: "lload_3", operands: 0 },
  0x22: { name: "fload_0", operands: 0 },
  0x23: { name: "fload_1", operands: 0 },
  0x24: { name: "fload_2", operands: 0 },
  0x25: { name: "fload_3", operands: 0 },
  0x26: { name: "dload_0", operands: 0 },
  0x27: { name: "dload_1", operands: 0 },
  0x28: { name: "dload_2", operands: 0 },
  0x29: { name: "dload_3", operands: 0 },
  0x2a: { name: "aload_0", operands: 0 },
  0x2b: { name: "aload_1", operands: 0 },
  0x2c: { name: "aload_2", operands: 0 },
  0x2d: { name: "aload_3", operands: 0 },
  0x2e: { name: "iaload", operands: 0 },
  0x2f: { name: "laload", operands: 0 },
  0x30: { name: "faload", operands: 0 },
  0x31: { name: "daload", operands: 0 },
  0x32: { name: "aaload", operands: 0 },
  0x33: { name: "baload", operands: 0 },
  0x34: { name: "caload", operands: 0 },
  0x35: { name: "saload", operands: 0 },
  0x36: { name: "istore", operands: 1 },
  0x37: { name: "lstore", operands: 1 },
  0x38: { name: "fstore", operands: 1 },
  0x39: { name: "dstore", operands: 1 },
  0x3a: { name: "astore", operands: 1 },
  0x3b: { name: "istore_0", operands: 0 },
  0x3c: { name: "istore_1", operands: 0 },
  0x3d: { name: "istore_2", operands: 0 },
  0x3e: { name: "istore_3", operands: 0 },
  0x3f: { name: "lstore_0", operands: 0 },
  0x40: { name: "lstore_1", operands: 0 },
  0x41: { name: "lstore_2", operands: 0 },
  0x42: { name: "lstore_3", operands: 0 },
  0x43: { name: "fstore_0", operands: 0 },
  0x44: { name: "fstore_1", operands: 0 },
  0x45: { name: "fstore_2", operands: 0 },
  0x46: { name: "fstore_3", operands: 0 },
  0x47: { name: "dstore_0", operands: 0 },
  0x48: { name: "dstore_1", operands: 0 },
  0x49: { name: "dstore_2", operands: 0 },
  0x4a: { name: "dstore_3", operands: 0 },
  0x4b: { name: "astore_0", operands: 0 },
  0x4c: { name: "astore_1", operands: 0 },
  0x4d: { name: "astore_2", operands: 0 },
  0x4e: { name: "astore_3", operands: 0 },
  0x4f: { name: "iastore", operands: 0 },
  0x50: { name: "lastore", operands: 0 },
  0x51: { name: "fastore", operands: 0 },
  0x52: { name: "dastore", operands: 0 },
  0x53: { name: "aastore", operands: 0 },
  0x54: { name: "bastore", operands: 0 },
  0x55: { name: "castore", operands: 0 },
  0x56: { name: "sastore", operands: 0 },
  0x57: { name: "pop", operands: 0 },
  0x58: { name: "pop2", operands: 0 },
  0x59: { name: "dup", operands: 0 },
  0x5a: { name: "dup_x1", operands: 0 },
  0x5b: { name: "dup_x2", operands: 0 },
  0x5c: { name: "dup2", operands: 0 },
  0x5d: { name: "dup2_x1", operands: 0 },
  0x5e: { name: "dup2_x2", operands: 0 },
  0x5f: { name: "swap", operands: 0 },
  0x60: { name: "iadd", operands: 0 },
  0x61: { name: "ladd", operands: 0 },
  0x62: { name: "fadd", operands: 0 },
  0x63: { name: "dadd", operands: 0 },
  0x64: { name: "isub", operands: 0 },
  0x65: { name: "lsub", operands: 0 },
  0x66: { name: "fsub", operands: 0 },
  0x67: { name: "dsub", operands: 0 },
  0x68: { name: "imul", operands: 0 },
  0x69: { name: "lmul", operands: 0 },
  0x6a: { name: "fmul", operands: 0 },
  0x6b: { name: "dmul", operands: 0 },
  0x6c: { name: "idiv", operands: 0 },
  0x6d: { name: "ldiv", operands: 0 },
  0x6e: { name: "fdiv", operands: 0 },
  0x6f: { name: "ddiv", operands: 0 },
  0x70: { name: "irem", operands: 0 },
  0x71: { name: "lrem", operands: 0 },
  0x72: { name: "frem", operands: 0 },
  0x73: { name: "drem", operands: 0 },
  0x74: { name: "ineg", operands: 0 },
  0x75: { name: "lneg", operands: 0 },
  0x76: { name: "fneg", operands: 0 },
  0x77: { name: "dneg", operands: 0 },
  0x78: { name: "ishl", operands: 0 },
  0x79: { name: "lshl", operands: 0 },
  0x7a: { name: "ishr", operands: 0 },
  0x7b: { name: "lshr", operands: 0 },
  0x7c: { name: "iushr", operands: 0 },
  0x7d: { name: "lushr", operands: 0 },
  0x7e: { name: "iand", operands: 0 },
  0x7f: { name: "land", operands: 0 },
  0x80: { name: "ior", operands: 0 },
  0x81: { name: "lor", operands: 0 },
  0x82: { name: "ixor", operands: 0 },
  0x83: { name: "lxor", operands: 0 },
  0x84: { name: "iinc", operands: 2 },
  0x85: { name: "i2l", operands: 0 },
  0x86: { name: "i2f", operands: 0 },
  0x87: { name: "i2d", operands: 0 },
  0x88: { name: "l2i", operands: 0 },
  0x89: { name: "l2f", operands: 0 },
  0x8a: { name: "l2d", operands: 0 },
  0x8b: { name: "f2i", operands: 0 },
  0x8c: { name: "f2l", operands: 0 },
  0x8d: { name: "f2d", operands: 0 },
  0x8e: { name: "d2i", operands: 0 },
  0x91: { name: "i2b", operands: 0 },
  0x92: { name: "i2c", operands: 0 },
  0x93: { name: "i2s", operands: 0 },
  0x94: { name: "lcmp", operands: 0 },
  0x95: { name: "fcmpl", operands: 0 },
  0x96: { name: "fcmpg", operands: 0 },
  0x97: { name: "dcmpl", operands: 0 },
  0x98: { name: "dcmpg", operands: 0 },
  0x99: { name: "ifeq", operands: 2 },
  0x9a: { name: "ifne", operands: 2 },
  0x9b: { name: "iflt", operands: 2 },
  0x9c: { name: "ifge", operands: 2 },
  0x9d: { name: "ifgt", operands: 2 },
  0x9e: { name: "ifle", operands: 2 },
  0x9f: { name: "if_icmpeq", operands: 2 },
  0xa0: { name: "if_icmpne", operands: 2 },
  0xa1: { name: "if_icmplt", operands: 2 },
  0xa2: { name: "if_icmpge", operands: 2 },
  0xa3: { name: "if_icmpgt", operands: 2 },
  0xa4: { name: "if_icmple", operands: 2 },
  0xa5: { name: "if_acmpeq", operands: 2 },
  0xa6: { name: "if_acmpne", operands: 2 },
  0xa7: { name: "goto", operands: 2 },
  0xa8: { name: "jsr", operands: 2 },
  0xa9: { name: "ret", operands: 1 },
  0xaa: { name: "tableswitch", operands: -1 },
  0xab: { name: "lookupswitch", operands: -1 },
  0xac: { name: "ireturn", operands: 0 },
  0xad: { name: "lreturn", operands: 0 },
  0xae: { name: "freturn", operands: 0 },
  0xaf: { name: "dreturn", operands: 0 },
  0xb0: { name: "areturn", operands: 0 },
  0xb1: { name: "return", operands: 0 },
  0xb2: { name: "getstatic", operands: 2 },
  0xb3: { name: "putstatic", operands: 2 },
  0xb4: { name: "getfield", operands: 2 },
  0xb5: { name: "putfield", operands: 2 },
  0xb6: { name: "invokevirtual", operands: 2 },
  0xb7: { name: "invokespecial", operands: 2 },
  0xb8: { name: "invokestatic", operands: 2 },
  0xb9: { name: "invokeinterface", operands: 4 },
  0xba: { name: "invokedynamic", operands: 4 },
  0xbb: { name: "new", operands: 2 },
  0xbc: { name: "newarray", operands: 1 },
  0xbd: { name: "anewarray", operands: 2 },
  0xbe: { name: "arraylength", operands: 0 },
  0xbf: { name: "athrow", operands: 0 },
  0xc0: { name: "checkcast", operands: 2 },
  0xc1: { name: "instanceof", operands: 2 },
  0xc2: { name: "monitorenter", operands: 0 },
  0xc3: { name: "monitorexit", operands: 0 },
  0xc4: { name: "wide", operands: -1 },
  0xc5: { name: "multianewarray", operands: 3 },
  0xc6: { name: "ifnull", operands: 2 },
  0xc7: { name: "ifnonnull", operands: 2 },
  0xc8: { name: "goto_w", operands: 4 },
  0xc9: { name: "jsr_w", operands: 4 },
};

class BinaryReader {
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  u1(): number {
    if (this.offset >= this.view.byteLength) return 0;
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  u2(): number {
    if (this.offset + 1 >= this.view.byteLength) return 0;
    const val = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return val;
  }

  u4(): number {
    if (this.offset + 3 >= this.view.byteLength) return 0;
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  bytes(length: number): Uint8Array {
    const safeLen = Math.min(length, this.view.byteLength - this.offset);
    if (safeLen <= 0) return new Uint8Array(0);
    const arr = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, safeLen);
    this.offset += safeLen;
    return new Uint8Array(arr); // clone
  }

  skip(length: number): void {
    this.offset += length;
  }

  getOffset(): number {
    return this.offset;
  }

  getRemaining(): number {
    return this.view.byteLength - this.offset;
  }
}

export function parseClassFile(buffer: ArrayBuffer): ParsedClass {
  const reader = new BinaryReader(buffer);

  // 1. Magic number (0xCAFEBABE)
  const magicNum = reader.u4();
  const magic = magicNum.toString(16).toUpperCase();
  if (magicNum !== 0xCAFEBABE) {
    throw new Error(`Invalid magic number: 0x${magic}. Expected 0xCAFEBABE`);
  }

  // 2. Minor and Major Versions
  const minorVersion = reader.u2();
  const majorVersion = reader.u2();
  const jdkVersion = getJdkVersion(majorVersion);

  // 3. Constant Pool Count
  const constantPoolCount = reader.u2();
  const cpRaw: any[] = [];
  cpRaw[0] = null; // 1-based index

  // Read Constant Pool Items
  for (let i = 1; i < constantPoolCount; i++) {
    const tag = reader.u1();
    switch (tag) {
      case CP_TAGS.Utf8: {
        const length = reader.u2();
        const b = reader.bytes(length);
        const str = new TextDecoder("utf-8").decode(b);
        cpRaw[i] = { tag, value: str };
        break;
      }
      case CP_TAGS.Integer: {
        const val = reader.u4();
        // convert to signed int
        const signedVal = (val & 0x80000000) ? val - 0x100000000 : val;
        cpRaw[i] = { tag, value: signedVal };
        break;
      }
      case CP_TAGS.Float: {
        const val = reader.u4();
        // Represent as bits (can refine later if needed)
        cpRaw[i] = { tag, value: val };
        break;
      }
      case CP_TAGS.Long: {
        const high = reader.u4();
        const low = reader.u4();
        // Occupies two cp indexes
        cpRaw[i] = { tag, value: `${high}_${low}` };
        cpRaw[i + 1] = null;
        i++;
        break;
      }
      case CP_TAGS.Double: {
        const high = reader.u4();
        const low = reader.u4();
        cpRaw[i] = { tag, value: `${high}_${low}` };
        cpRaw[i + 1] = null;
        i++;
        break;
      }
      case CP_TAGS.Class: {
        const nameIndex = reader.u2();
        cpRaw[i] = { tag, nameIndex };
        break;
      }
      case CP_TAGS.String: {
        const stringIndex = reader.u2();
        cpRaw[i] = { tag, stringIndex };
        break;
      }
      case CP_TAGS.Fieldref:
      case CP_TAGS.Methodref:
      case CP_TAGS.InterfaceMethodref: {
        const classIndex = reader.u2();
        const nameAndTypeIndex = reader.u2();
        cpRaw[i] = { tag, classIndex, nameAndTypeIndex };
        break;
      }
      case CP_TAGS.NameAndType: {
        const nameIndex = reader.u2();
        const descriptorIndex = reader.u2();
        cpRaw[i] = { tag, nameIndex, descriptorIndex };
        break;
      }
      case CP_TAGS.MethodHandle: {
        const refKind = reader.u1();
        const refIndex = reader.u2();
        cpRaw[i] = { tag, refKind, refIndex };
        break;
      }
      case CP_TAGS.MethodType: {
        const descriptorIndex = reader.u2();
        cpRaw[i] = { tag, descriptorIndex };
        break;
      }
      case CP_TAGS.Dynamic:
      case CP_TAGS.InvokeDynamic: {
        const bootstrapMethodAttrIndex = reader.u2();
        const nameAndTypeIndex = reader.u2();
        cpRaw[i] = { tag, bootstrapMethodAttrIndex, nameAndTypeIndex };
        break;
      }
      case CP_TAGS.Module:
      case CP_TAGS.Package: {
        const nameIndex = reader.u2();
        cpRaw[i] = { tag, nameIndex };
        break;
      }
      default:
        // Skip fallback
        cpRaw[i] = { tag, value: "Unknown tag" };
    }
  }

  // Constant pool helpers to resolve names
  function getUtf8String(index: number): string {
    const item = cpRaw[index];
    if (item && item.tag === CP_TAGS.Utf8) {
      return item.value;
    }
    return `[#${index}]`;
  }

  function resolveClassName(index: number): string {
    const item = cpRaw[index];
    if (item && item.tag === CP_TAGS.Class) {
      return getUtf8String(item.nameIndex);
    }
    return `[#${index}]`;
  }

  function resolveNameAndType(index: number): { name: string; descriptor: string } {
    const item = cpRaw[index];
    if (item && item.tag === CP_TAGS.NameAndType) {
      return {
        name: getUtf8String(item.nameIndex),
        descriptor: getUtf8String(item.descriptorIndex),
      };
    }
    return { name: `[#${index}]`, descriptor: "" };
  }

  // Resolve CP elements into readable CPInfo items
  const constantPool: CPInfo[] = [];
  for (let i = 1; i < cpRaw.length; i++) {
    const item = cpRaw[i];
    if (!item) continue;

    const tagName = CP_TAG_NAMES[item.tag] || `Unknown (${item.tag})`;
    let details = "";

    switch (item.tag) {
      case CP_TAGS.Utf8:
        details = `"${item.value}"`;
        break;
      case CP_TAGS.Integer:
      case CP_TAGS.Float:
      case CP_TAGS.Long:
      case CP_TAGS.Double:
        details = String(item.value);
        break;
      case CP_TAGS.Class:
        details = `Class: ${resolveClassName(i)}`;
        break;
      case CP_TAGS.String:
        details = `String: ${getUtf8String(item.stringIndex)}`;
        break;
      case CP_TAGS.Fieldref:
      case CP_TAGS.Methodref:
      case CP_TAGS.InterfaceMethodref: {
        const cls = resolveClassName(item.classIndex);
        const nt = resolveNameAndType(item.nameAndTypeIndex);
        details = `${cls}.${nt.name} : ${nt.descriptor}`;
        break;
      }
      case CP_TAGS.NameAndType: {
        const nt = resolveNameAndType(i);
        details = `Name: "${nt.name}" Descriptor: "${nt.descriptor}"`;
        break;
      }
      case CP_TAGS.MethodHandle:
        details = `Kind: ${item.refKind} Index: #${item.refIndex}`;
        break;
      case CP_TAGS.MethodType:
        details = `Descriptor: ${getUtf8String(item.descriptorIndex)}`;
        break;
      case CP_TAGS.InvokeDynamic:
        const nt = resolveNameAndType(item.nameAndTypeIndex);
        details = `BootstrapMethod: #${item.bootstrapMethodAttrIndex} NameAndType: ${nt.name}:${nt.descriptor}`;
        break;
      default:
        details = JSON.stringify(item);
    }

    constantPool.push({
      index: i,
      tag: item.tag,
      tagName,
      details,
      raw: item,
    });
  }

  // 4. Access Flags, This Class, Super Class
  const accessFlags = reader.u2();
  const accessFlagsNames = getAccessFlagNames(accessFlags, true);

  const thisClassIdx = reader.u2();
  const thisClassName = resolveClassName(thisClassIdx);

  const superClassIdx = reader.u2();
  const superClassName = superClassIdx > 0 ? resolveClassName(superClassIdx) : "java/lang/Object";

  // 5. Interfaces
  const interfacesCount = reader.u2();
  const interfaces: string[] = [];
  for (let i = 0; i < interfacesCount; i++) {
    const idx = reader.u2();
    interfaces.push(resolveClassName(idx));
  }

  // Helper for attributes
  function parseAttributes(count: number): ParsedAttribute[] {
    const attrs: ParsedAttribute[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdx = reader.u2();
      const attrName = getUtf8String(nameIdx);
      const attrLength = reader.u4();
      const info = reader.bytes(attrLength);
      attrs.push({
        name: attrName,
        length: attrLength,
        info,
      });
    }
    return attrs;
  }

  // 6. Fields
  const fieldsCount = reader.u2();
  const fields: ParsedField[] = [];
  for (let i = 0; i < fieldsCount; i++) {
    const fFlags = reader.u2();
    const fNameIdx = reader.u2();
    const fDescIdx = reader.u2();
    const fAttrsCount = reader.u2();
    const fName = getUtf8String(fNameIdx);
    const fDesc = getUtf8String(fDescIdx);
    const fAttrs = parseAttributes(fAttrsCount);

    fields.push({
      accessFlags: fFlags,
      accessFlagsNames: getAccessFlagNames(fFlags, false),
      name: fName,
      descriptor: fDesc,
      attributes: fAttrs,
    });
  }

  // 7. Methods
  const methodsCount = reader.u2();
  const methods: ParsedMethod[] = [];
  for (let i = 0; i < methodsCount; i++) {
    const mFlags = reader.u2();
    const mNameIdx = reader.u2();
    const mDescIdx = reader.u2();
    const mAttrsCount = reader.u2();
    const mName = getUtf8String(mNameIdx);
    const mDesc = getUtf8String(mDescIdx);
    const mAttrs = parseAttributes(mAttrsCount);

    // Look for Code attribute
    let code: ParsedCode | undefined = undefined;
    const codeAttr = mAttrs.find((a) => a.name === "Code");
    if (codeAttr) {
      code = parseCodeAttribute(codeAttr.info, getUtf8String, resolveClassName, resolveNameAndType, cpRaw);
    }

    methods.push({
      accessFlags: mFlags,
      accessFlagsNames: getAccessFlagNames(mFlags, false),
      name: mName,
      descriptor: mDesc,
      attributes: mAttrs,
      code,
    });
  }

  return {
    magic,
    minorVersion,
    majorVersion,
    jdkVersion,
    constantPool,
    accessFlags,
    accessFlagsNames,
    thisClassName,
    superClassName,
    interfaces,
    fields,
    methods,
  };
}

// Bytecode Mnemonic Decoder inside Code Attribute
function parseCodeAttribute(
  info: Uint8Array,
  getUtf8: (idx: number) => string,
  resolveClass: (idx: number) => string,
  resolveNT: (idx: number) => { name: string; descriptor: string },
  cpRaw: any[]
): ParsedCode {
  const reader = new BinaryReader(info.buffer.slice(info.byteOffset, info.byteOffset + info.byteLength));
  const maxStack = reader.u2();
  const maxLocals = reader.u2();
  const codeLength = reader.u4();
  const codeBytes = reader.bytes(codeLength);

  // Parse Exception Table
  const exceptionTableLength = reader.u2();
  const exceptionTable: ExceptionTableEntry[] = [];
  for (let i = 0; i < exceptionTableLength; i++) {
    const startPc = reader.u2();
    const endPc = reader.u2();
    const handlerPc = reader.u2();
    const catchType = reader.u2();
    const catchClassName = catchType > 0 ? resolveClass(catchType) : "any (finally)";
    exceptionTable.push({
      startPc,
      endPc,
      handlerPc,
      catchType,
      catchClassName,
    });
  }

  // Disassemble bytecode instructions
  const instructions: Instruction[] = [];
  let pc = 0;

  while (pc < codeBytes.length) {
    const offset = pc;
    const opcode = codeBytes[pc];
    pc++;

    const opMeta = OPCODES[opcode];
    if (!opMeta) {
      // Unknown instruction
      instructions.push({
        offset,
        opcode,
        mnemonic: `db 0x${opcode.toString(16).padStart(2, "0")}`,
        operands: [],
        details: "Unknown Opcode",
      });
      continue;
    }

    const operands: number[] = [];
    let details = "";

    // Handle variable-length opcodes: wide, tableswitch, lookupswitch
    if (opcode === 0xc4) {
      // wide instruction
      const subOp = codeBytes[pc];
      pc++;
      const index = (codeBytes[pc] << 8) | codeBytes[pc + 1];
      pc += 2;
      operands.push(subOp, index);
      const subMnemonic = OPCODES[subOp]?.name || `unknown(0x${subOp.toString(16)})`;
      details = `wide ${subMnemonic} #${index}`;
      instructions.push({
        offset,
        opcode,
        mnemonic: "wide",
        operands,
        details,
      });
      continue;
    }

    if (opcode === 0xaa) {
      // tableswitch
      // skip padding
      const pad = (4 - ((offset + 1) % 4)) % 4;
      pc += pad;
      const defOffset = (codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3];
      pc += 4;
      const low = (codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3];
      pc += 4;
      const high = (codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3];
      pc += 4;
      details = `tableswitch low=${low} high=${high} default=${offset + defOffset}`;
      instructions.push({ offset, opcode, mnemonic: "tableswitch", operands: [], details });
      // skip jump offsets
      const numTargets = high - low + 1;
      pc += numTargets * 4;
      continue;
    }

    if (opcode === 0xab) {
      // lookupswitch
      const pad = (4 - ((offset + 1) % 4)) % 4;
      pc += pad;
      const defOffset = (codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3];
      pc += 4;
      const npairs = (codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3];
      pc += 4;
      details = `lookupswitch npairs=${npairs} default=${offset + defOffset}`;
      instructions.push({ offset, opcode, mnemonic: "lookupswitch", operands: [], details });
      pc += npairs * 8;
      continue;
    }

    // Standard fixed-operand instruction
    const opSize = opMeta.operands;
    for (let o = 0; o < opSize; o++) {
      if (pc < codeBytes.length) {
        operands.push(codeBytes[pc]);
        pc++;
      }
    }

    // Resolve operand details
    if (opSize === 1) {
      const byte1 = operands[0];
      if (opcode === 0x10) {
        // bipush
        const signedVal = byte1 > 127 ? byte1 - 256 : byte1;
        details = String(signedVal);
      } else if (opcode === 0x12) {
        // ldc - constant pool index
        details = `#${byte1} [${resolveCPDetailString(byte1, cpRaw, getUtf8, resolveClass, resolveNT)}]`;
      } else {
        details = `#${byte1}`;
      }
    } else if (opSize === 2) {
      const byte1 = operands[0];
      const byte2 = operands[1];
      const index = (byte1 << 8) | byte2;

      if (opcode === 0x11) {
        // sipush
        const signedVal = index > 32767 ? index - 65536 : index;
        details = String(signedVal);
      } else if (
        opcode === 0xb2 || // getstatic
        opcode === 0xb3 || // putstatic
        opcode === 0xb4 || // getfield
        opcode === 0xb5 || // putfield
        opcode === 0xb6 || // invokevirtual
        opcode === 0xb7 || // invokespecial
        opcode === 0xb8 || // invokestatic
        opcode === 0xbb || // new
        opcode === 0xbd || // anewarray
        opcode === 0xc0 || // checkcast
        opcode === 0xc1 || // instanceof
        opcode === 0x13 || // ldc_w
        opcode === 0x14 // ldc2_w
      ) {
        details = `#${index} [${resolveCPDetailString(index, cpRaw, getUtf8, resolveClass, resolveNT)}]`;
      } else if (
        opcode === 0x99 || // ifeq
        opcode === 0x9a || // ifne
        opcode === 0x9b || // iflt
        opcode === 0x9c || // ifge
        opcode === 0x9d || // ifgt
        opcode === 0x9e || // ifle
        opcode === 0x9f || // if_icmpeq
        opcode === 0xa0 || // if_icmpne
        opcode === 0xa1 || // if_icmplt
        opcode === 0xa2 || // if_icmpge
        opcode === 0xa3 || // if_icmpgt
        opcode === 0xa4 || // if_icmple
        opcode === 0xa5 || // if_acmpeq
        opcode === 0xa6 || // if_acmpne
        opcode === 0xa7 || // goto
        opcode === 0xc6 || // ifnull
        opcode === 0xc7 // ifnonnull
      ) {
        // compute branch target PC offset (signed 16-bit)
        let signedOffset = index;
        if (signedOffset > 32767) signedOffset -= 65536;
        const targetPc = offset + signedOffset;
        details = `-> offset ${targetPc}`;
      } else if (opcode === 0x84) {
        // iinc
        const constant = byte2 > 127 ? byte2 - 256 : byte2;
        details = `local_${byte1} += ${constant}`;
      } else {
        details = `${byte1}, ${byte2}`;
      }
    } else if (opSize === 4) {
      const idx = (operands[0] << 8) | operands[1];
      if (opcode === 0xb9 || opcode === 0xba) {
        // invokeinterface, invokedynamic
        details = `#${idx} [${resolveCPDetailString(idx, cpRaw, getUtf8, resolveClass, resolveNT)}] count=${operands[2]}`;
      } else {
        details = operands.join(", ");
      }
    } else {
      details = operands.join(", ");
    }

    instructions.push({
      offset,
      opcode,
      mnemonic: opMeta.name,
      operands,
      details,
    });
  }

  return {
    maxStack,
    maxLocals,
    instructions,
    exceptionTable,
  };
}

// Low level detail resolver
function resolveCPDetailString(
  idx: number,
  cpRaw: any[],
  getUtf8: (i: number) => string,
  resolveClass: (i: number) => string,
  resolveNT: (i: number) => { name: string; descriptor: string }
): string {
  const item = cpRaw[idx];
  if (!item) return `[#${idx}]`;

  switch (item.tag) {
    case CP_TAGS.Utf8:
      return item.value;
    case CP_TAGS.Integer:
    case CP_TAGS.Float:
    case CP_TAGS.Long:
    case CP_TAGS.Double:
      return String(item.value);
    case CP_TAGS.Class:
      return resolveClass(idx);
    case CP_TAGS.String:
      return getUtf8(item.stringIndex);
    case CP_TAGS.Fieldref:
    case CP_TAGS.Methodref:
    case CP_TAGS.InterfaceMethodref: {
      const clsName = resolveClass(item.classIndex);
      const nt = resolveNT(item.nameAndTypeIndex);
      return `${clsName}.${nt.name}:${nt.descriptor}`;
    }
    case CP_TAGS.NameAndType: {
      const nt = resolveNT(idx);
      return `${nt.name}:${nt.descriptor}`;
    }
    default:
      return `Tag ${item.tag}`;
  }
}
