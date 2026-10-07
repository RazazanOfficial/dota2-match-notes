import java.io.FileInputStream;
import opendota.Parse;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.wire.shared.demo.proto.Demo.CDemoFileInfo;

/** Validates the identity inside the replay before sending any parsed output. */
public class ReplayInspector {
    private Long matchId;

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(CDemoFileInfo info) {
        matchId = info.getGameInfo().getDota().getMatchId();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("match ID and .dem path required");
        long expectedId = Long.parseLong(args[0]);
        ReplayInspector inspector = new ReplayInspector();
        try (FileInputStream input = new FileInputStream(args[1])) {
            new SimpleRunner(new InputStreamSource(input)).runWith(inspector);
        }
        if (inspector.matchId == null || inspector.matchId.longValue() != expectedId) {
            throw new IllegalArgumentException("Replay match ID does not match requested match: " + inspector.matchId);
        }
        try (FileInputStream input = new FileInputStream(args[1])) {
            new Parse(input, System.out, true);
        }
    }
}
