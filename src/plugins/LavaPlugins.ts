import type { Plugin } from "./Plugin.ts";

export interface LavaSrcOptions {
  spotify?: {
    clientId?: string;
    clientSecret?: string;
    countryCode?: string;
    playlistPageLimit?: number;
    albumPageLimit?: number;
  };
  appleMusic?: {
    countryCode?: string;
    mediaAPIToken?: string;
  };
  deezer?: {
    masterKey?: string;
  };
  yandexMusic?: {
    accessToken?: string;
  };
}

export type SponsorBlockCategory =
  | "sponsor"
  | "selfpromo"
  | "interaction"
  | "intro"
  | "outro"
  | "preview"
  | "music_offtopic";

export interface SponsorBlockOptions {
  categories?: SponsorBlockCategory[];
}

export interface FloweryTTSOptions {
  voice?: string;
  speed?: number;
  translate?: boolean;
  silence?: number;
}

/**
 * Helper plugin for LavaSrc (Spotify, Apple Music, Deezer, Yandex Music integration)
 */
export function createLavaSrcPlugin(_options?: LavaSrcOptions): Plugin {
  return {
    name: "lavasrc",
    version: "4.0.0",
    init() {
      // Config registered automatically with Lavalink server
    },
  };
}

/**
 * Helper plugin for SponsorBlock (skips sponsor segments in YouTube tracks)
 */
export function createSponsorBlockPlugin(_options?: SponsorBlockOptions): Plugin {
  return {
    name: "sponsorblock",
    version: "4.0.0",
  };
}

/**
 * Helper plugin for FloweryTTS (Text-to-Speech audio generation)
 */
export function createFloweryTTSPlugin(_options?: FloweryTTSOptions): Plugin {
  return {
    name: "flowerytts",
    version: "4.0.0",
  };
}

