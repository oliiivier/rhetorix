import { describe, expect, it } from "vitest";
import {
  extractTimestampParam,
  extractVideoId,
  isYouTubeUrl,
  isYouTubeWatchUrl,
} from "../src/youtube/youtube-detector";

describe("youtube-detector", () => {
  it("identifie les domaines YouTube valides", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://lemonde.fr")).toBe(false);
    expect(isYouTubeUrl("not-a-url")).toBe(false);
  });

  it("identifie les URL de visionnage analysables (watch et shorts)", () => {
    expect(isYouTubeWatchUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchUrl("https://www.youtube.com/feed/subscriptions")).toBe(false);
    expect(isYouTubeWatchUrl("https://www.youtube.com/")).toBe(false);
  });

  it("extrait correctement le videoId sous divers formats", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s&feature=share")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/shorts/XYZ12345")).toBe("XYZ12345");
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/channel/UC123")).toBeNull();
  });

  it("extrait le paramètre temporel t sous différents formats", () => {
    expect(extractTimestampParam("https://www.youtube.com/watch?v=abc&t=120")).toBe(120);
    expect(extractTimestampParam("https://www.youtube.com/watch?v=abc&t=120s")).toBe(120);
    expect(extractTimestampParam("https://www.youtube.com/watch?v=abc&t=2m15s")).toBe(135);
    expect(extractTimestampParam("https://www.youtube.com/watch?v=abc&t=1h2m3s")).toBe(3723);
    expect(extractTimestampParam("https://www.youtube.com/watch?v=abc")).toBe(0);
  });
});
