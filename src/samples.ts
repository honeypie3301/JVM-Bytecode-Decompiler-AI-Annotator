/**
 * Pre-compiled Java .class binary samples encoded in Base64.
 * Allows instant testing of the Bytecode Decompiler & AI Annotator
 * without needing a local Java development environment.
 */

export interface SampleClass {
  id: string;
  name: string;
  className: string;
  description: string;
  base64: string;
}

export const SAMPLES: SampleClass[] = [
  {
    id: "helloworld",
    name: "HelloWorld.class",
    className: "com.demo.HelloWorld",
    description: "Standard Java entrypoint invoking PrintStream.println on System.out.",
    base64:
      "yv66vgAAADcAGgEABENvZGUBAAY8aW5pdD4BAAMoKVYBABBqYXZhL2xhbmcvT2JqZWN0BwAEAQATY29tL2RlbW8vSGVsbG9Xb3JsZAcABgwAAgADCgAFAAgBAARtYWluAQAWKFtMamF2YS9sYW5nL1N0cmluZzspVgEAEGphdmEvbGFuZy9TeXN0ZW0HAAwBAANvdXQBABVMamF2YS9pby9QcmludFN0cmVhbTsMAA4ADwkADQAQAQATamF2YS9pby9QcmludFN0cmVhbQcAEgEAB3ByaW50bG4BABUoTGphdmEvbGFuZy9TdHJpbmc7KVYMABQAFQoAEwAWAQANSGVsbG8sIFdvcmxkIQgAGAAhAAcABQAAAAAAAgABAAIAAwABAAEAAAARAAEAAQAAAAUqtwAJsQAAAAAACQAKAAsAAQABAAAAFQACAAEAAAAJsgAREhm2ABexAAAAAAAA",
  },
  {
    id: "factorial",
    name: "Factorial.class",
    className: "com.demo.Factorial",
    description: "Recursive integer computation featuring conditional branching and invokestatic.",
    base64:
      "yv66vgAAADcADgEABENvZGUBAAY8aW5pdD4BAAMoKVYBABBqYXZhL2xhbmcvT2JqZWN0BwAEAQASY29tL2RlbW8vRmFjdG9yaWFsBwAGDAACAAMKAAUACAEAB2NvbXB1dGUBAAQoSSlJDAAKAAsKAAcADAAhAAcABQAAAAAAAgABAAIAAwABAAEAAAARAAEAAQAAAAUqtwAJsQAAAAAACQAKAAsAAQABAAAAHAADAAEAAAAQGgSjAAUErBoaBGS4AA1orAAAAAAAAA==",
  },
  {
    id: "relic_staff_item",
    name: "RelicStaffItem.class",
    className: "com.wiki.examples.RelicStaffItem",
    description: "Minecraft Forge/NeoForge custom Item class with server-side procedure dispatch.",
    base64:
      "yv66vgAAADcAJgEABENvZGUBAAY8aW5pdD4BAC0oTG5ldC9taW5lY3JhZnQvd29ybGQvaXRlbS9JdGVtJFByb3BlcnRpZXM7KVYBAB1uZXQvbWluZWNyYWZ0L3dvcmxkL2l0ZW0vSXRlbQcABAEAIGNvbS93aWtpL2V4YW1wbGVzL1JlbGljU3RhZmZJdGVtBwAGDAACAAMKAAUACAEADWNvb2xkb3duVGlja3MBAAFJAQADdXNlAQCfKExuZXQvbWluZWNyYWZ0L3dvcmxkL2xldmVsL0xldmVsO0xuZXQvbWluZWNyYWZ0L3dvcmxkL2VudGl0eS9wbGF5ZXIvUGxheWVyO0xuZXQvbWluZWNyYWZ0L3dvcmxkL0ludGVyYWN0aW9uSGFuZDspTG5ldC9taW5lY3JhZnQvd29ybGQvSW50ZXJhY3Rpb25SZXN1bHRIb2xkZXI7AQAfbmV0L21pbmVjcmFmdC93b3JsZC9sZXZlbC9MZXZlbAcADgEADGlzQ2xpZW50U2lkZQEAAygpWgwAEAARCgAPABIBAChuZXQvbWluZWNyYWZ0L3dvcmxkL2VudGl0eS9wbGF5ZXIvUGxheWVyBwAUAQANZ2V0SXRlbUluSGFuZAEASyhMbmV0L21pbmVjcmFmdC93b3JsZC9JbnRlcmFjdGlvbkhhbmQ7KUxuZXQvbWluZWNyYWZ0L3dvcmxkL2l0ZW0vSXRlbVN0YWNrOwwAFgAXCgAVABgBACFjb20vd2lraS9leGFtcGxlcy9SZWxpY1Byb2NlZHVyZXMHABoBABF0cmlnZ2VyT25JdGVtVXNlZAEAUShMbmV0L21pbmVjcmFmdC93b3JsZC9lbnRpdHkvcGxheWVyL1BsYXllcjtMbmV0L21pbmVjcmFmdC93b3JsZC9pdGVtL0l0ZW1TdGFjazspVgwAHAAdCgAbAB4BACtuZXQvbWluZWNyYWZ0L3dvcmxkL0ludGVyYWN0aW9uUmVzdWx0SG9sZGVyBwAgAQAMc2lkZWRTdWNjZXNzAQBCKExqYXZhL2xhbmcvT2JqZWN0O1opTG5ldC9taW5lY3JhZnQvd29ybGQvSW50ZXJhY3Rpb25SZXN1bHRIb2xkZXI7DAAiACMKACEAJAAhAAcABQAAAAEAEgAKAAsAAAACAAEAAgADAAEAAQAAABIAAgACAAAABiortwAJsQAAAAAAAQAMAA0AAQABAAAAKgADAAUAAAAeLC22ABk6BCu2ABOaAAksGQS4AB8ZBCu2ABO4ACWwAAAAAAAA",
  },
];

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
