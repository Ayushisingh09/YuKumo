import { YuKumo, DaveyAdapter } from "../src/index.ts";

/**
 * Example demonstrating YuKumo usage with @snazzah/davey & DAVE end-to-end encrypted Discord voice channels.
 */
async function main() {
  const yukumo = new YuKumo({
    nodes: [
      {
        host: "localhost",
        port: 2333,
        password: "youshallnotpass",
      },
    ],
  });

  const davey = new DaveyAdapter(yukumo, {
    enableDave: true,
  });

  // Example Discord WebSocket / Gateway event listener integration:
  const mockGatewayPacket = {
    t: "VOICE_SERVER_UPDATE",
    d: {
      guild_id: "123456789012345678",
      token: "sample_voice_token",
      endpoint: "voice.discord.media:443",
    },
  };

  // Pass incoming raw gateway voice packets directly to DaveyAdapter:
  davey.handleRawPacket(mockGatewayPacket);

  console.log("Davey Voice Adapter initialized and processing gateway events successfully!");
}

main().catch(console.error);
