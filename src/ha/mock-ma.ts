// Mock answers for Music Assistant browse (Task 4), served by MockConnection.callWS
// for any websocket command the mock does not otherwise handle. Lets `npm run dev`
// exercise the real browse code path (config-entry lookup → get_library / search
// via call_service with return_response → normalised BrowseItem[]).

interface MockItem {
  name: string;
  uri: string;
  artist?: string;
}

const ARTISTS: MockItem[] = [
  { name: "Harbour Lights", uri: "library://artist/40", artist: "Artist" },
  { name: "The Quiet Hours", uri: "library://artist/41", artist: "Artist" },
  { name: "Marram", uri: "library://artist/42", artist: "Artist" },
];
const ALBUMS: MockItem[] = [
  { name: "Low Sun", uri: "library://album/50", artist: "Marram" },
  { name: "Field Notes", uri: "library://album/51", artist: "Field Notes" },
];
const RADIO: MockItem[] = [
  { name: "BBC Radio 6 Music", uri: "library://radio/1", artist: "Alternative and indie" },
  { name: "BBC Radio 4", uri: "library://radio/2", artist: "Talk and drama" },
  { name: "BBC Radio 3", uri: "library://radio/3", artist: "Classical and jazz" },
  { name: "Jazz FM", uri: "library://radio/4", artist: "Smooth jazz" },
  { name: "KEXP", uri: "library://radio/5", artist: "Seattle, independent" },
  { name: "Apple Music 1", uri: "library://radio/6", artist: "Apple Music" },
  { name: "NTS Radio 1", uri: "library://radio/7", artist: "London, eclectic" },
  { name: "FIP", uri: "library://radio/8", artist: "Paris, eclectic" },
];
const PLAYLISTS: MockItem[] = [
  { name: "Morning Coffee", uri: "library://playlist/10", artist: "42 tracks" },
  { name: "Dinner Party", uri: "library://playlist/11", artist: "58 tracks" },
  { name: "Sunday Slow", uri: "library://playlist/12", artist: "31 tracks" },
  { name: "Focus", uri: "library://playlist/13", artist: "77 tracks" },
  { name: "New Music Daily", uri: "library://playlist/14", artist: "Apple Music · 100 tracks" },
];
const TRACKS: MockItem[] = [
  { name: "Slow Tide", uri: "library://track/20", artist: "Harbour Lights" },
  { name: "Paper Lanterns", uri: "library://track/21", artist: "The Quiet Hours" },
  { name: "Northern Line", uri: "library://track/22", artist: "Field Notes" },
  { name: "Low Sun", uri: "library://track/23", artist: "Marram" },
  { name: "Tideline", uri: "library://track/24", artist: "Harbour Lights" },
  { name: "Quiet Signal", uri: "library://track/25", artist: "The Quiet Hours" },
];

const BY_TYPE: Record<string, MockItem[]> = {
  artist: ARTISTS,
  album: ALBUMS,
  radio: RADIO,
  playlist: PLAYLISTS,
  track: TRACKS,
};
const BUCKET: Record<string, string> = {
  artist: "artists",
  album: "albums",
  radio: "radio",
  playlist: "playlists",
  track: "tracks",
};

function filt(items: MockItem[], q: string): MockItem[] {
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q) || (i.artist ?? "").toLowerCase().includes(q));
}

export function mockBrowse(message: { type: string; [key: string]: unknown }): unknown {
  if (message.type === "config_entries/get") {
    return [{ entry_id: "mock_ma", domain: "music_assistant", title: "Music Assistant" }];
  }
  if (message.type === "call_service" && message["domain"] === "music_assistant") {
    const data = (message["service_data"] as Record<string, unknown>) ?? {};
    if (message["service"] === "get_library") {
      const mediaType = String(data["media_type"] ?? "track");
      return { response: { items: BY_TYPE[mediaType] ?? TRACKS, media_type: mediaType } };
    }
    if (message["service"] === "search") {
      const q = String(data["name"] ?? "").toLowerCase();
      const mt = data["media_type"];
      // media_type is a list (single-tab search) or omitted ("search everything").
      const types = Array.isArray(mt) ? mt.map(String) : mt ? [String(mt)] : ["artist", "album", "track", "playlist", "radio"];
      const response: Record<string, unknown> = {};
      for (const t of types) {
        const bucket = BUCKET[t];
        if (bucket) response[bucket] = filt(BY_TYPE[t] ?? [], q);
      }
      return { response };
    }
    return { response: {} };
  }
  // Unknown command in the mock: resolve to null (real HA answers these).
  return null;
}
