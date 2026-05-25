// src/handlers/commands.ts — slash command registration + dispatcher
import {
  Client, Events, REST, Routes,
  SlashCommandBuilder, MessageFlags,
} from "discord.js";
import { config } from "../config.js";
import { linkDiscord } from "../api.js";

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Powiąż konto Discord z Ghost Empire")
    .addStringOption((opt) =>
      opt
        .setName("kod")
        .setDescription("Kod 6 znaków wygenerowany w portalu Ghost Empire")
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(8),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("portal")
    .setDescription("Link do portalu Ghost Empire")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Lista komend bota Ghost Empire")
    .toJSON(),
];

export async function setupCommands(client: Client) {
  // Register commands for the guild (instant — global commands take up to 1h)
  const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Registered ${commands.length} slash commands for guild ${config.DISCORD_GUILD_ID}`);
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guild?.id !== config.DISCORD_GUILD_ID) {
      await interaction.reply({
        content: "Ten bot działa tylko na serwerze Ghost Empire.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      switch (interaction.commandName) {
        case "link": {
          const code = interaction.options.getString("kod", true).trim().toUpperCase();
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const result = await linkDiscord({
            code,
            discordId: interaction.user.id,
            discordUsername: interaction.user.username,
          });

          if ("ok" in result && result.ok) {
            await interaction.editReply({
              content: [
                "✅ **Konto powiązane!**",
                "",
                "Wróć na portal i odśwież stronę. Twoje tokeny z aktywności Discord będą leciały od teraz.",
                `${config.WEB_API_URL}/profile`,
              ].join("\n"),
            });
          } else {
            const errMsg = "error" in result ? result.error : "Nieznany błąd";
            await interaction.editReply({
              content: [
                `❌ **${errMsg}**`,
                "",
                "Wygeneruj nowy kod w portalu:",
                `${config.WEB_API_URL}/profile`,
              ].join("\n"),
            });
          }
          break;
        }

        case "portal": {
          await interaction.reply({
            content: `🌐 Portal Ghost Empire: ${config.WEB_API_URL}`,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case "help": {
          await interaction.reply({
            content: [
              "**Komendy Ghost Empire Bot:**",
              "",
              "`/link kod:XXXXXX` — powiąż swoje konto Discord z portalem",
              "`/portal` — link do strony",
              "`/help` — ta wiadomość",
              "",
              "**Jak zarabiać Ghost Tokens:**",
              `▸ Pisz na czacie (max raz na ${config.MESSAGE_COOLDOWN_SECONDS}s, ${config.MESSAGE_REWARD} GT)`,
              `▸ Bądź na voice channel (${config.VOICE_REWARD_PER_MINUTE} GT / min)`,
              "▸ Wpisuj drop codes na portalu podczas live'a",
              "▸ Zclaimuj daily questy",
            ].join("\n"),
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
      }
    } catch (err) {
      console.error(`[cmd ${interaction.commandName}] error:`, err);
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Wewnętrzny błąd bota. Spróbuj później." });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Wewnętrzny błąd bota. Spróbuj później.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });
}
