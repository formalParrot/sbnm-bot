const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  return (
    member.permissions.has("Administrator") ||
    (adminRoleId && member.roles.cache.has(adminRoleId))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-setup")
    .setDescription("Create a new event with all channels and structure"),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_event_setup")
      .setTitle("Create Event");

    const nameInput = new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Event Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const descInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Description")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    const deadlineInput = new TextInputBuilder()
      .setCustomId("deadline")
      .setLabel("Deadline (Unix Timestamp)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("1234567890");

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(deadlineInput),
    );

    return interaction.showModal(modal);
  },
};
