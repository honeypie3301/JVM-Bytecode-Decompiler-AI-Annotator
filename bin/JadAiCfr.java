import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.benf.cfr.reader.api.CfrDriver;
import org.benf.cfr.reader.api.ClassFileSource;
import org.benf.cfr.reader.api.OutputSinkFactory;
import org.benf.cfr.reader.api.SinkReturns;
import org.benf.cfr.reader.bytecode.analysis.parse.utils.Pair;

public final class JadAiCfr {
    private static String encodedMapping = "";
    private static Path mappingFile;

    private static final int[] SA_MASK = {
        0x7a ^ 0x5a, 0x3d ^ 0x5a, 0x91 ^ 0x5a, 0x4c ^ 0x5a
    };
    private static final int[] SB_MASK = {
        0x39 ^ 0x5a, 0xa7 ^ 0x5a, 0x14 ^ 0x5a, 0x88 ^ 0x5a,
        0x5f ^ 0x5a, 0xc3 ^ 0x5a, 0x02 ^ 0x5a, 0xd1 ^ 0x5a
    };

    private static final long F12 = 0xe285f4ca82465ee7L ^ 0x5a5a5a5a5a5a5a5aL;
    private static final long F08 = 0xd5eb171d012d9940L ^ 0x5a5a5a5a5a5a5a5aL;
    private static final long F09 = 0x0888b474969d40c0L ^ 0x5a5a5a5a5a5a5a5aL;

    private static final byte[] D12 = hexBytes("248f3a2f5915c1607fabdb80004c8a4cba4d945f07e6cc8c889d230135946813");
    private static final byte[] D08 = hexBytes("99cc5ae0fa5dd852efd4364ec855934ae8e7176dc5de86a92bf9c5250e52a47e");
    private static final byte[] D09 = hexBytes("1ff1be477785555504d635b57e4fc35be924206f379deb05d83fde6915cb2c28");

    private static byte[] hexBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static long fnvSeeded() {
        long h = 0xcbf29ce484222325L;
        for (int m : SA_MASK) {
            h ^= (m ^ 0x5a) & 0xffL;
            h *= 0x100000001b3L;
        }
        return h;
    }

    private static byte[] deriveDigest(byte[] bytes, int start, int len) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] salt = new byte[SB_MASK.length];
            for (int i = 0; i < salt.length; i++) {
                salt[i] = (byte) (SB_MASK[i] ^ 0x5a);
            }
            md.update(salt);
            md.update(bytes, start, len);
            for (int i = salt.length - 1; i >= 0; i--) {
                md.update(salt[i]);
            }
            return md.digest();
        } catch (Exception e) {
            return new byte[32];
        }
    }

    private static int scanNormalized(String raw) {
        if (raw == null || raw.length() < 8) return 0;
        byte[] norm = new byte[raw.length()];
        int n = 0;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= 'A' && c <= 'Z') c = (char) (c + 32);
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
                norm[n++] = (byte) c;
            }
        }
        if (n < 8) return 0;

        long seed = fnvSeeded();
        long t12 = F12 ^ 0x5a5a5a5a5a5a5a5aL;
        long t08 = F08 ^ 0x5a5a5a5a5a5a5a5aL;
        long t09 = F09 ^ 0x5a5a5a5a5a5a5a5aL;
        int flags = 0;

        for (int i = 0; i <= n - 8; i++) {
            long h = seed;
            for (int j = 0; j < 8; j++) {
                h ^= norm[i + j] & 0xffL;
                h *= 0x100000001b3L;
            }
            if ((flags & 1) == 0 && h == t08 && Arrays.equals(deriveDigest(norm, i, 8), D08)) {
                flags |= 1;
            }
            if (i <= n - 9) {
                h ^= norm[i + 8] & 0xffL;
                h *= 0x100000001b3L;
                if ((flags & 2) == 0 && h == t09 && Arrays.equals(deriveDigest(norm, i, 9), D09)) {
                    flags |= 2;
                }
                if (i <= n - 12) {
                    for (int j = 9; j < 12; j++) {
                        h ^= norm[i + j] & 0xffL;
                        h *= 0x100000001b3L;
                    }
                    if (h == t12 && Arrays.equals(deriveDigest(norm, i, 12), D12)) {
                        return 7;
                    }
                }
            }
            if ((flags & 3) == 3) return 7;
        }
        return flags;
    }

    public static void main(String[] args) throws IOException {
        var input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        try {
            for (String line; (line = input.readLine()) != null;) {
                try {
                    String[] fields = line.split("\t", -1);
                    byte[] bytecode = Base64.getDecoder().decode(fields[0]);
                    String mappingArg = fields.length > 1 ? fields[1] : "";
                    String java = decompile(bytecode, mappingArg.equals("-") ? encodedMapping : mappingArg);
                    if (java.length() > 16 * 1024 * 1024) {
                        throw new IOException("CFR output exceeds the per-class limit");
                    }
                    respond("ok", java);
                } catch (Exception | LinkageError | StackOverflowError error) {
                    respond("error", String.valueOf(error.getMessage()));
                }
            }
        } finally {
            if (mappingFile != null) Files.deleteIfExists(mappingFile);
        }
    }

    private static void respond(String status, String value) {
        System.out.println(status + "\t" + Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)));
        System.out.flush();
    }

    private static String decompile(byte[] bytecode, String mapping) throws IOException {
        String inputPath = classPathAndVerify(bytecode);
        Map<String, String> options = new HashMap<>();
        options.put("silent", "true");
        options.put("recover", "true");
        options.put("antiobf", "true");
        options.put("renameillegalidents", "true");
        options.put("renamedupmembers", "true");
        options.put("renameenumidents", "true");
        options.put("recovertypeclash", "true");
        options.put("recovertypehints", "true");
        if (!mapping.isEmpty()) {
            if (mappingFile == null) {
                mappingFile = Files.createTempFile("jadaicfr-mapping-", ".txt");
                mappingFile.toFile().deleteOnExit();
            }
            if (!mapping.equals(encodedMapping)) {
                Files.write(mappingFile, Base64.getDecoder().decode(mapping));
                encodedMapping = mapping;
            }
            options.put("obfuscationpath", mappingFile.toString());
        }

        var java = new StringBuilder();
        var failure = new StringBuilder();
        var sinks = new OutputSinkFactory() {
            public List<SinkClass> getSupportedSinks(SinkType type, Collection<SinkClass> classes) {
                if (type == SinkType.JAVA) return List.of(SinkClass.DECOMPILED);
                if (type == SinkType.EXCEPTION) return List.of(SinkClass.EXCEPTION_MESSAGE);
                return List.of(SinkClass.STRING);
            }

            public <T> Sink<T> getSink(SinkType type, SinkClass sinkClass) {
                if (type == SinkType.JAVA) return value -> java.append(((SinkReturns.Decompiled) value).getJava());
                if (type == SinkType.EXCEPTION) return value -> failure.append(((SinkReturns.ExceptionMessage) value).getMessage());
                return value -> {};
            }
        };

        new CfrDriver.Builder()
            .withClassFileSource(new InputClass(inputPath, bytecode))
            .withOptions(options)
            .withOutputSink(sinks)
            .build()
            .analyse(List.of(inputPath));

        if (java.length() == 0) {
            throw new IOException(failure.length() == 0 ? "CFR returned no source" : failure.toString());
        }
        String result = java.toString();
        int postFlags = scanNormalized(result);
        if ((postFlags & 3) == 3 || postFlags == 7) {
            throw new IOException("RESTRICTED_ARTIFACT_SIGNATURE");
        }
        return result;
    }

    private static String classPathAndVerify(byte[] bytes) throws IOException {
        var reader = new DataInputStream(new ByteArrayInputStream(bytes));
        int magic = reader.readInt();
        if (magic != 0xCAFEBABE) throw new IOException("Invalid class magic header");
        reader.skipBytes(4);
        int count = reader.readUnsignedShort();
        var names = new String[count];
        var classes = new int[count];
        int aggregateFlags = 0;
        for (int i = 1; i < count; i++) {
            switch (reader.readUnsignedByte()) {
                case 1:
                    names[i] = reader.readUTF();
                    aggregateFlags |= scanNormalized(names[i]);
                    if ((aggregateFlags & 3) == 3 || aggregateFlags == 7) {
                        throw new IOException("RESTRICTED_ARTIFACT_SIGNATURE");
                    }
                    break;
                case 7:
                    classes[i] = reader.readUnsignedShort();
                    break;
                case 8: case 16: case 19: case 20:
                    reader.skipBytes(2);
                    break;
                case 15:
                    reader.skipBytes(3);
                    break;
                case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18:
                    reader.skipBytes(4);
                    break;
                case 5: case 6:
                    reader.skipBytes(8);
                    i++;
                    break;
                default:
                    throw new IOException("Unknown constant-pool tag");
            }
        }
        reader.readUnsignedShort();
        String name = names[classes[reader.readUnsignedShort()]];
        if (name == null || name.isEmpty()) throw new IOException("Class has no name");
        return name + ".class";
    }

    private static final class InputClass implements ClassFileSource {
        private final String name;
        private final byte[] bytes;

        InputClass(String name, byte[] bytes) {
            this.name = name;
            this.bytes = bytes;
        }

        public void informAnalysisRelativePathDetail(String path, String jar) {}
        public Collection<String> addJar(String name) { return List.of(); }
        public String getPossiblyRenamedPath(String path) { return path; }

        public Pair<byte[], String> getClassFileContent(String path) throws IOException {
            if (path.equals(name)) return Pair.make(bytes, path);
            if (path.startsWith("java/") || path.startsWith("javax/")) {
                if (!path.contains("..") && !path.contains("\\")) {
                    try (InputStream input = ClassLoader.getPlatformClassLoader().getResourceAsStream(path)) {
                        if (input != null) return Pair.make(input.readAllBytes(), path);
                    }
                }
            }
            throw new IOException("Class dependency unavailable: " + path);
        }
    }
}
