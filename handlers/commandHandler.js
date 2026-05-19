const { Collection, MessageFlags } = require('discord.js');

module.exports = async function handleCommands(interaction) {
 const command = interaction.client.commands.get(interaction.commandName);
 if (!command) return;

 const { cooldowns } = interaction.client;

 if (!cooldowns.has(command.data.name)) {
 cooldowns.set(command.data.name, new Collection());
 }

 const now = Date.now();
 const timestamps = cooldowns.get(command.data.name);
 const cooldownMs = (command.cooldown ?? 3) * 1000;

 if (timestamps.has(interaction.user.id)) {
 const expiry = timestamps.get(interaction.user.id) + cooldownMs;
 if (now < expiry) {
 const remaining = ((expiry - now) / 1000).toFixed(1);
 return interaction.reply({
 content: ` Please wait **${remaining}s** before using \`${command.data.name}\` again.`,
 flags: MessageFlags.Ephemeral,
 });
 }
 }

 timestamps.set(interaction.user.id, now);
 setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs);

 try {
 await command.execute(interaction);
 } catch (err) {
 console.error(`[ERROR] /${command.data.name}:`, err);
 const reply = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
 if (interaction.replied || interaction.deferred) {
 await interaction.followUp(reply).catch(() => {});
 } else {
 await interaction.reply(reply).catch(() => {});
 }
 }
};
