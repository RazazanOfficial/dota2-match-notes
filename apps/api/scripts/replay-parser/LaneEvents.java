import java.io.FileInputStream;
import opendota.Parse;

/** Emit parser events for the bounded Lane Efficiency extractor. */
public class LaneEvents {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected .dem path");
        try (FileInputStream input = new FileInputStream(args[0])) {
            new Parse(input, System.out, false);
        }
    }
}
