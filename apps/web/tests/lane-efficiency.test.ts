import { expect, it } from "vitest";
import * as web from "../lib/dota/lane-efficiency";
import * as api from "../../api/src/lib/dota/lane-efficiency";
it("uses the canonical API ten-minute Lane implementation in web and desktop", () => {
  expect(web.calculateLaneEfficiency).toBe(api.calculateLaneEfficiency);
  expect(web.LANE_WEIGHTS).toBe(api.LANE_WEIGHTS);
  expect(web.LANE_END).toBe(600);
});
