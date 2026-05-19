const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { stmts } = require("../db");
const {
  submissionEmbed,
  refreshJudgeHub,
  buildJudgeHub,
} = require("../utils/helpers");

function parseDeadline(raw) {
  if (!raw) return null;
  const match = raw.match(/<t:(\d+)(?::[A-Za-z])?>/);
  if (match) return parseInt(match[1], 10);
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

async function handleModals(interaction) {
  // -------------------------------------------------------------------------
  // Event setup modal
  // -------------------------------------------------------------------------
  if (interaction.customId === "modal_event_setup") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.fields.getTextInputValue("name").trim();
    const description =
      interaction.fields.getTextInputValue("description").trim() || "";
    const deadlineRaw = interaction.fields.getTextInputValue("deadline").trim();
    const deadlineTs = parseDeadline(deadlineRaw);

    const guild = interaction.guild;
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    const category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
    });

    const subChannel = await guild.channels.create({
      name: "submit",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
        ...(adminRoleId
          ? [
              {
                id: adminRoleId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                ],
              },
            ]
          : []),
      ],
    });

    const judgeOverwrites = [
      {
        id: guild.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
    ];
    if (judgeRoleId)
      judgeOverwrites.push({
        id: judgeRoleId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      });
    if (adminRoleId)
      judgeOverwrites.push({
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      });
    const judgeChannel = await guild.channels.create({
      name: "judging",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: judgeOverwrites,
    });

    const resultsChannel = await guild.channels.create({
      name: "results",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });

    const { lastInsertRowid: eventId } = stmts.insertEvent.run({
      guild_id: guild.id,
      name,
      description,
      deadline_timestamp: deadlineTs,
      category_id: category.id,
      submission_channel_id: subChannel.id,
      results_channel_id: resultsChannel.id,
      judge_channel_id: judgeChannel.id,
    });

    const subEmbed = new EmbedBuilder()
      .setTitle(name)
      .setColor(0x5865f2)
      .addFields(
        { name: "Results", value: `<#${resultsChannel.id}>`, inline: true },
        {
          name: "How to Submit",
          value:
            "1. Click Submit below\n2. Fill submission details in\n3. Upload files + Additional info in **private thread**",
        },
      )
      .setFooter({ text: `Event ID: ${eventId}` })
      .setTimestamp();

    const subRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event_submit_${eventId}`)
        .setLabel("Submit")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`event_status_${eventId}`)
        .setLabel("Event Status")
        .setStyle(ButtonStyle.Secondary),
    );
    await subChannel.send({ embeds: [subEmbed], components: [subRow] });
    await subChannel.send(
      `## ${name}\n\n${description}\n\n:date: **Competition Ends**: ${deadlineTs ? `<t:${deadlineTs}:f>` : "TBD"}\n\n:envelope: **Submit your builds** via the button above ^^\n\n:green_book: **Rules**:\n  :x: No stolen builds\n  :x: No inappropriate builds\n\n:thinking: **Any questions?**\n- channel goes here -\n\nGood Luck! :tada:`,
    );

    const { embed: hubEmbed, components: hubComponents } = buildJudgeHub(
      name,
      eventId,
      [],
      "submissions_open",
    );
    const hubMsg = await judgeChannel.send({
      embeds: [hubEmbed],
      components: hubComponents,
    });
    stmts.setJudgeHubMessage.run(hubMsg.id, eventId);

    const deadlineNote = deadlineTs ? `\nDeadline: <t:${deadlineTs}:F>` : "";

    return interaction.editReply(
      `Event **${name}** created.${deadlineNote}\nSubmission channel: <#${subChannel.id}>`,
    );
  }

  // -------------------------------------------------------------------------
  // Submission modal
  // -------------------------------------------------------------------------
  if (interaction.customId.startsWith("modal_submit_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = interaction.customId.slice("modal_submit_".length);
    const event = stmts.getEvent.get(eventId);

    if (!event || event.status !== "submissions_open") {
      return interaction.editReply("Submissions are currently closed.");
    }

    // Duplicate guard
    const existing = stmts.getSubmissionByUser.get(
      eventId,
      interaction.user.id,
    );
    if (existing) {
      return interaction.editReply(
        `You have already submitted to this event. Your thread: <#${existing.thread_id}>`,
      );
    }

    const title = interaction.fields.getTextInputValue("title");
    const description = interaction.fields.getTextInputValue("description");
    const link = null;
    const category = "General";

    const { count } = stmts.countSubmissions.get(eventId);
    const entryNum = count + 1;

    const guild = interaction.guild;
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    // Fetch admin IDs before creating the thread so gateway events from
    // previous thread member additions can't race and clear roles from cache

    // Create private thread inside the submission channel
    let thread;
    try {
      const subChannel = await guild.channels.fetch(
        event.submission_channel_id,
      );
      thread = await subChannel.threads.create({
        name: `#${entryNum} - ${title}`,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 10080, // 1 week
        invitable: false,
        reason: `Submission for event: ${event.name}`,
      });
    } catch (err) {
      console.error("[modalHandler] thread create failed:", err);
      return interaction.editReply(
        "Could not create your submission thread. Please contact an admin.",
      );
    }

    // Add submitter
    await thread.members.add(interaction.user.id);

    // Add admins
    const role = guild.roles.cache.get(adminRoleId);
    if (role) {
      await guild.members.fetch();
      for (const member of role.members.values()) {
        try {
          await thread.members.add(member.id);
        } catch (error) {
          console.error(`Failed to add ${member.user.tag}:`, error);
        }
      }
    }

    // Save to DB
    stmts.insertSubmission.run({
      event_id: eventId,
      user_id: interaction.user.id,
      thread_id: thread.id,
      codename: title,
      entry_num: entryNum,
      title,
      description,
      link,
      category,
    });

    const embed = submissionEmbed(event, entryNum, title, description);
    if (link) embed.addFields({ name: "Link", value: link });
    embed.addFields(
      { name: "Category", value: category, inline: true },
      {
        name: "Uploading files",
        value:
          "Drag and drop files directly into this thread. You can upload multiple times before the deadline.",
      },
    );
    await thread.send({ embeds: [embed] });

    // Edit the judge hub embed to include the new entry
    await refreshJudgeHub(guild, event, stmts);

    return interaction.editReply(
      `Submission received.\n\nEntry #${entryNum} — ${title}\nYour private thread: <#${thread.id}>\n\nUpload your files there.`,
    );
  }

  // -------------------------------------------------------------------------
  // Score modal
  // -------------------------------------------------------------------------
  if (interaction.customId.startsWith("modal_score_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const submissionId = parseInt(
      interaction.customId.slice("modal_score_".length),
      10,
    );
    const submission = stmts.getSubmission.get(submissionId);

    if (!submission) return interaction.editReply("Submission not found.");

    if (submission.user_id === interaction.user.id) {
      return interaction.editReply("You cannot score your own submission.");
    }

    const scoreRaw = interaction.fields.getTextInputValue("score").trim();
    const feedback =
      interaction.fields.getTextInputValue("feedback").trim() || null;
    const score = parseInt(scoreRaw, 10);

    if (isNaN(score) || score < 1 || score > 10) {
      return interaction.editReply(
        "Score must be a whole number between 1 and 10.",
      );
    }

    stmts.upsertScore.run({
      submission_id: submissionId,
      judge_id: interaction.user.id,
      score,
      feedback,
    });

    const { avg, count } = stmts.getAvgScore.get(submissionId);

    // Refresh hub so the average updates live
    const event = stmts.getEvent.get(submission.event_id);
    await refreshJudgeHub(interaction.guild, event, stmts);

    return interaction.editReply(
      `Score saved: **${score}/10** for Entry #${submission.entry_num} — ${submission.title}.\nCurrent average: **${avg}/10** from ${count} judge${count !== 1 ? "s" : ""}.`,
    );
  }
}

module.exports = { handleModals };
