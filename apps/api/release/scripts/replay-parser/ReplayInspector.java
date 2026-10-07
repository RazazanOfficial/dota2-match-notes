import java.io.FileInputStream;
import java.util.*;
import com.google.gson.Gson;
import opendota.Parse;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.wire.shared.demo.proto.Demo.CDemoFileInfo;

/** Inspection and parsing are separate; Node validates identity between them. */
public class ReplayInspector {
    private final Set<String> matchIds = new LinkedHashSet<>();
    private Map<String, Object> metadata;

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(CDemoFileInfo info) {
        if (!info.hasGameInfo() || !info.getGameInfo().hasDota()) return;
        var dota = info.getGameInfo().getDota();
        matchIds.add(Long.toUnsignedString(dota.getMatchId()));
        // Ignore an empty message rather than overwriting an earlier full roster.
        if (metadata != null && dota.getPlayerInfoCount() == 0) return;
        var players = new ArrayList<Map<String, Object>>();
        for (var player : dota.getPlayerInfoList()) {
            var row = new LinkedHashMap<String, Object>();
            row.put("hero", player.getHeroName());
            row.put("team", player.getGameTeam());
            row.put("steamId", Long.toUnsignedString(player.getSteamid()));
            row.put("fake", player.getIsFakeClient());
            players.add(row);
        }
        metadata = new LinkedHashMap<>();
        metadata.put("gameMode", dota.getGameMode());
        metadata.put("winner", dota.getGameWinner());
        metadata.put("players", players);
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !(args[0].equals("inspect") || args[0].equals("parse")))
            throw new IllegalArgumentException("inspect/parse and .dem path required");
        if (args[0].equals("parse")) {
            try (FileInputStream input = new FileInputStream(args[1])) {
                new Parse(input, System.out, true);
            }
            return;
        }
        ReplayInspector inspector = new ReplayInspector();
        try (FileInputStream input = new FileInputStream(args[1])) {
            new SimpleRunner(new InputStreamSource(input)).runWith(inspector);
        }
        if (inspector.metadata == null) throw new IllegalArgumentException("Replay identity metadata is absent");
        inspector.metadata.put("matchIds", inspector.matchIds);
        System.out.println(new Gson().toJson(inspector.metadata));
    }
}
