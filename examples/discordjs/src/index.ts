/**
 * YuKumo + discord.js v14 example bot
 *
 * Environment variables:
 *   DISCORD_TOKEN  — Discord bot token
 *   LAVALINK_HOST  — Lavalink host (default: localhost)
 *   LAVALINK_PORT  — Lavalink port (default: 2333)
 *   LAVALINK_PASS  — Lavalink password (default: youshallnotpass)
 *
 * Commands:
 *   !play <query>  — Search and play a track
 *   !pause         — Pause playback
 *   !resume        — Resume playback
 *   !skip          — Skip current track
 *   !stop          — Stop playback
 *   !volume <0-1000> — Set volume
 *   !destroy       — Destroy the player
 */

import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from "discord.js";
import { YuKumo } from "YuKumo";
import type { VoiceStateUpdate, VoiceServerUpdate, SearchResult } from "YuKumo";

const TOKEN = process.env.DISCORD_TOKEN ?? "";
const LAVALINK_HOST = process.env.LAVALINK_HOST ?? "localhost";
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT ?? 2333);
const LAVALINK_PASS = process.env.LAVALINK_PASS ?? "youshallnotpass";

if (TOKEN === "") {
  console.error("DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

const YuKumo = new YuKumo({
  nodes: [{ host: LAVALINK_HOST, port: LAVALINK_PORT, password: LAVALINK_PASS }],
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  await YuKumo.init();
  console.log("YuKumo initialized");

  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        new SlashCommandBuilder()
          .setName("play")
          .setDescription("Search and play a track")
          .addStringOption((o) => o.setName("query").setDescription("Search query or URL").setRequired(true))
          .toJSON(),
        new SlashCommandBuilder()
          .setName("pause")
          .setDescription("Pause playback")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("resume")
          .setDescription("Resume playback")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("skip")
          .setDescription("Skip current track")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("stop")
          .setDescription("Stop playback and clear queue")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("volume")
          .setDescription("Set volume (0–1000)")
          .addIntegerOption((o) => o.setName("level").setDescription("Volume level").setMinValue(0).setMaxValue(1000).setRequired(true))
          .toJSON(),
        new SlashCommandBuilder()
          .setName("destroy")
          .setDescription("Destroy the player")
          .toJSON(),
      ],
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands", err);
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const update: VoiceStateUpdate = {
    guildId: newState.guild.id,
    sessionId: newState.sessionId ?? "",
    channelId: newState.channelId,
    userId: newState.id,
  };
  YuKumo.handleVoiceStateUpdate(update);
});

client.on(Events.VoiceServerUpdate, (data) => {
  const update: VoiceServerUpdate = {
    token: data.token,
    endpoint: data.endpoint,
  };
  YuKumo.handleVoiceServerUpdate(data.guild.id, update);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;
  if (guildId == null) {
    await interaction.reply({ content: "This command can only be used in a guild", ephemeral: true });
    return;
  }

  const member = interaction.member;
  if (member == null || !("voice" in member) || member.voice.channelId == null) {
    await interaction.reply({ content: "You must be in a voice channel", ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  let player = YuKumo.getPlayer(guildId);

  if (player == null && commandName !== "play") {
    await interaction.reply({ content: "No player exists. Use /play first", ephemeral: true });
    return;
  }

  switch (commandName) {
    case "play": {
      const query = interaction.options.getString("query", true);

      if (player == null) {
        player = await YuKumo.createPlayer({
          guildId,
          voiceChannelId: member.voice.channelId,
          textChannelId: interaction.channelId,
        });
      }

      const result: SearchResult = await YuKumo.search(query);
      if (result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
        await interaction.reply({ content: "No results found", ephemeral: true });
        return;
      }

      const track = result.tracks[0]!;
      await YuKumo.play(guildId, track);

      await interaction.reply({ content: `Playing: **${track.info.title}**` });
      break;
    }

    case "pause": {
      await YuKumo.pause(guildId);
      await interaction.reply({ content: "Paused" });
      break;
    }

    case "resume": {
      await YuKumo.resume(guildId);
      await interaction.reply({ content: "Resumed" });
      break;
    }

    case "skip": {
      const skipped = await YuKumo.skip(guildId);
      await interaction.reply({
        content: skipped != null ? `Skipped **${skipped.info.title}**` : "No more tracks in queue",
      });
      break;
    }

    case "stop": {
      await YuKumo.stop(guildId);
      await interaction.reply({ content: "Stopped" });
      break;
    }

    case "volume": {
      const level = interaction.options.getInteger("level", true);
      await YuKumo.setVolume(guildId, level);
      await interaction.reply({ content: `Volume set to ${level}` });
      break;
    }

    case "destroy": {
      await YuKumo.destroyPlayer(guildId);
      await interaction.reply({ content: "Player destroyed" });
      break;
    }
  }
});

process.on("SIGINT", async () => {
  await YuKumo.destroy();
  await client.destroy();
  process.exit(0);
});

await client.login(TOKEN);
