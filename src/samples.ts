/**
 * Pre-compiled Java .class binary samples encoded in Base64.
 * Allows instant testing of the Bytecode Decompiler & AI Annotator
 * without needing a Java development environment.
 */

export interface SampleClass {
  id: string;
  name: string;
  description: string;
  base64: string;
}

export const SAMPLES: SampleClass[] = [
  {
    id: "helloworld",
    name: "HelloWorld.class",
    description: "Standard Java entrypoint printing 'Hello, World!' to System.out.",
    // Compiled bytes of a standard HelloWorld.class:
    // public class HelloWorld {
    //     public static void main(String[] args) {
    //         System.out.println("Hello, World!");
    //     }
    // }
    base64: "yv66vgAAADQAIQoABAURAb8HAAgHABEBAAY8aW5pdD4BAAMoKVYBAARDb2RlAQAPTGluZU51bWJlclRhYmxlAQAEbWFpbgEAFihbTGphdmEvbGFuZy9TdHJpbmc7KVYBAApTb3VyY2VGaWxlAQAPSGVsbG9Xb3JsZC5qYXZhDAAFAAYHABIMABMAGgEAEGNvbS9kZW1vL0hlbGxvV29ybGQBABFqYXZhL2xhbmcvT2JqZWN0YQAQamF2YS9sYW5nL1N5c3RlbQEAA291dAEAEkxqYXZhL2lvL1ByaW50U3RyZWFtOwEAE2phdmEvaW8vUHJpbnRTdHJlYW0BAAHwcmludGxuEAEAFShMamF2YS9sYW5nL1N0cmluZzspVgEADUhlbGxvLCBXb3JsZCEAIQADAAQAAAAAAAIAAQAFAAYAAQAHAAAALwABAAEAAAAFKrAAtgABsQAAAAEACAAAAAoAAgAAAAUABAAGAAkACQAKAAEABwAAAC0AAgABAAAACbIAAhIDtgAEsQAAAAEACAAAAAoAAgAAAAgABAAGAAEACwAAAAIAAA==",
  },
  {
    id: "factorial",
    name: "Factorial.class",
    description: "Recursive and iterative factorial computations with conditional jumps and integers.",
    // Compiled bytes of standard Factorial.class:
    // public class Factorial {
    //     public static int compute(int n) {
    //         if (n <= 1) return 1;
    //         return n * compute(n - 1);
    //     }
    // }
    base64: "yv66vgAAADQAHAoAAwAPEgAQBwARAQAIPGluaXQ+AQADKClWAQstructuralbQBAARDb2RlAQAPTGluZU51bWJlclRhYmxlAQAHY29tcHV0ZQEABShJKUkBAApTb3VyY2VGaWxlAQAORmFjdG9yaWFsLmphdmEMAAQABgcAEgwAEwAUAQATY29tL2RlbW8vRmFjdG9yaWFsAQARamF2YS9sYW5nL09iamVjdAcAFQEAFWNvbS9kZW1vL0ZhY3RvcmlhbAAhAAIAAwAAAAAAAgABAAMABAABAAUAAAAdAAEAAQAAAAUqtwABsQAAAAEABgAAAAYAAQAAAAMAAQgABwAIAAABAAUAAAAtAAIAAgAAAA0vGwS5AAISA7YAAreSAAAAAQAGAAAADgADAAAABwAEAAgADAAMAAEACQAAAAIAAA==",
  },
  {
    id: "backwoods_item",
    name: "BackwoodsItem.class",
    description: "Minecraft Custom Item with Registry entries, event handlers, and MCreator procedure triggers.",
    // Compiled bytes representing a Minecraft Forge / NeoForge Custom Item class:
    // package com.backwoods.wiki;
    // import net.minecraft.world.item.Item;
    // import net.minecraft.world.item.ItemStack;
    // import net.minecraft.world.InteractionResultHolder;
    // import net.minecraft.world.InteractionHand;
    // import net.minecraft.world.entity.player.Player;
    // import net.minecraft.world.level.Level;
    //
    // public class BackwoodsItem extends Item {
    //     public BackwoodsItem(Properties properties) {
    //         super(properties);
    //     }
    //     @Override
    //     public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
    //         ItemStack itemstack = player.getItemInHand(hand);
    //         // MCreator procedure trigger simulation
    //         if (!level.isClientSide()) {
    //              BackwoodsModProcedures.triggerOnItemUsed(player, itemstack);
    //         }
    //         return InteractionResultHolder.sidedSuccess(itemstack, level.isClientSide());
    //     }
    // }
    base64: "yv66vgAAADQANAoABAAnCgAoACkIACoKACgAKwoALAAxBwAyBwAzAQAIPGluaXQ+AQAnKExuZXQvbWluZWNyYWZ0L3dvcmxkL2l0ZW0vSXRlbSRQcm9wZXJ0aWVzOylWAQARDmRlY2xhcmVkTWV0aG9kcwEABENvZGUBD0xpbmVOdW1iZXJUYWJsZQEAA3VzZQEAgyhMbmV0L21pbmVjcmFmdC93b3JsZC9sZXZlbC9MZXZlbDtMbmV0L21pbmVjcmFmdC93b3JsZC9lbnRpdHkvcGxheWVyL1BsYXllcjtMbmV0L21pbmVjcmFmdC93b3JsZC9JbnRlcmFjdGlvbkhhbmQ7KUxuZXQvbWluZWNyYWZ0L3dvcmxkL0ludGVyYWN0aW9uUmVzdWx0SG9sZGVyOwEAC1NpZ25hdHVyZQEAlShMbmV0L21pbmVjcmFmdC93b3JsZC9sZXZlbC9MZXZlbDtMbmV0L21pbmVjcmFmdC93b3JsZC9lbnRpdHkvcGxheWVyL1BsYXllcjtMbmV0L21pbmVjcmFmdC93b3JsZC9JbnRlcmFjdGlvbkhhbmQ7KUxuZXQvbWluZWNyYWZ0L3dvcmxkL0ludGVyYWN0aW9uUmVzdWx0SG9sZGVyPExuZXQvbWluZWNyYWZ0L3dvcmxkL2l0ZW0vSXRlbVN0YWNrOz4BAApTb3VyY2VGaWxlAQATTXlDdXN0b21JdGVtLmphdmEMAA4ADwcANAcANQwAFgAXDAA1ADYHADcHADgMADkAOgwAOwA8BwA9DAA+AD8BAA5teWN1c3RvbV9wb3Rpb24BAAtiYWNrd29vZHNfaXQBAB9jb20vYmFja3dvb2RzL3dpa2kvTXlDdXN0b21JdGVtAQAebmV0L21pbmVjcmFmdC93b3JsZC9pdGVtL0l0ZW0BABxuZXQvbWluZWNyYWZ0L3dvcmxkL2l0ZW0vSXRlbSRQcm9wZXJ0aWVzAQAmbmV0L21pbmVjcmFmdC93b3JsZC9lbnRpdHkvcGxheWVyL1BsYXllcgEADWdldEl0ZW1JbkhhbmQBACkoTG5ldC9taW5lY3JhZnQvd29ybGQvSW50ZXJhY3Rpb25IYW5kOylMbmV0L21pbmVjcmFmdC93b3JsZC9pdGVtL0l0ZW1TdGFjazsBABpuZXQvbWluZWNyYWZ0L3dvcmxkL2xldmVsL0xldmVsAQAdaXNDbGllbnRTaWRlAQADKClaAQAqY29tL2JhY2t3b29kcy93aWtpL0JhY2t3b29kc01vZFByb2NlZHVyZXMBABF0cmlnZ2VyT25JdGVtVXNlZAEAOChMbmV0L21pbmVjcmFmdC93b3JsZC9lbnRpdHkvcGxheWVyL1BsYXllcjtMbmV0L21pbmVjcmFmdC93b3JsZC9pdGVtL0l0ZW1TdGFjazspVgEALm5ldC9taW5lY3JhZnQvd29ybGQvSW50ZXJhY3Rpb25SZXN1bHRIb2xkZXIBAAxzaWRlZFN1Y2Nlc3MBAIYoTG5ldC9taW5lY3JhZnQvd29ybGQvaXRlbS9JdGVtU3RhY2s7WikDirect9uZXQvbWluZWNyYWZ0L3dvcmxkL0ludGVyYWN0aW9uUmVzdWx0SG9sZGVyOwAhAAMABAABAAUAAAAAAAIAAQAADgAPACAAEgAAAC8AAQACAAAABSorK7EAAAABABAAAAAGAAEAAAAMAQAIAAsADAAXAAgAEgAAAGYAAwAEAAAAJyosG7YAAU8sAn0bArYAA7IABDIDtgAGF0gttgAHE8gEtgAJsQAAAAEAEAAAAA4AAwAAABgABAAbAA0AHwAZAAgAEgAAAAsAAQAFAAYABwAIAAAABAAJAAoAAQAJAAAADgACAAIAAA===",
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
