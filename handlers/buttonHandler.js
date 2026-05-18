const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../db");
const {
  statusBadge,
  buildJudgeHub,
  entryDetailEmbed,
  refreshJudgeHub,
  setThreadVisibility,
} = require("../utils/helpers");

function isJudge(member) {
  const judgeRoleId = process.env.JUDGE_ROLE_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  return (
    member.permissions.has("Administrator") ||
    (judgeRoleId && member.roles.cache.has(judgeRoleId)) ||
    (adminRoleId && member.roles.cache.has(adminRoleId))
  );
}

function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  return (
    member.permissions.has("Administrator") ||
    (adminRoleId && member.roles.cache.has(adminRoleId))
  );
}

async function handleButtons(interaction) {
  const { customId } = interaction;

  // ---------------------------------------------------------------------------
  // Submit Entry -> open submission modal
  // ---------------------------------------------------------------------------
  if (customId.startsWith("event_submit_")) {
    const eventId = customId.slice("event_submit_".length);
    const event = stmts.getEvent.get(eventId);

    if (!event || event.status !== "submissions_open") {
      return interaction.reply({
        content: "Submissions are currently closed.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const existing = stmts.getSubmissionByUser.get(
      eventId,
      interaction.user.id,
    );
    if (existing) {
      return interaction.reply({
        content: `You have already submitted. Your thread: <#${existing.thread_id}>`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_submit_${eventId}`)
      .setTitle(`Submit - ${event.name}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Entry Title")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Short Description")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true),
      ),
    );
    return interaction.showModal(modal);
  }

  // ---------------------------------------------------------------------------
  // Event Status -> ephemeral status card
  // ---------------------------------------------------------------------------
  if (customId.startsWith("event_status_")) {
    const eventId = customId.slice("event_status_".length);
    const event = stmts.getEvent.get(eventId);
    if (!event)
      return interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });

    const { count } = stmts.countSubmissions.get(event.id);
    const deadline = event.deadline_timestamp
      ? `<t:${event.deadline_timestamp}:F> (<t:${event.deadline_timestamp}:R>)`
      : "Not set";

    const embed = new EmbedBuilder()
      .setTitle(event.name)
      .setColor(0x5865f2)
      .addFields(
        { name: "Status", value: statusBadge(event.status), inline: true },
        { name: "Entries", value: `${count}`, inline: true },
        { name: "Deadline", value: deadline },
      )
      .setTimestamp();
    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ---------------------------------------------------------------------------
  // Judge hub pagination: jpage_prev_<page>_<eventId> / jpage_next_<page>_<eventId>
  // ---------------------------------------------------------------------------
  if (customId.startsWith("jpage_")) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to do that.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    const parts = customId.split("_"); // ['jpage', 'prev'/'next', page, eventId]
    const dir = parts[1];
    const currentPage = parseInt(parts[2], 10);
    const eventId = parts[3];
    const event = stmts.getEvent.get(eventId);
    if (!event) return;

    const newPage = dir === "prev" ? currentPage - 1 : currentPage + 1;
    const submissions = stmts.getSubmissionsByEvent.all(event.id);
    const rows = submissions.map((sub) => {
      const { avg, count } = stmts.getAvgScore.get(sub.id);
      return { sub, avg: avg ?? 0, scoreCount: count };
    });

    const { embed, components } = buildJudgeHub(
      event.name,
      event.id,
      rows,
      event.status,
      newPage,
    );
    return interaction.editReply({ embeds: [embed], components });
  }

  // ---------------------------------------------------------------------------
  // Phase transition buttons (admin only)
  // phase_judging_1 / phase_revealed_1 / phase_archived_1
  // ---------------------------------------------------------------------------
  if (customId.startsWith("phase_")) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "Only admins can change the event phase.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts = customId.split("_"); // ['phase', 'judging', '1']
    const targetPhase = parts[1];
    const eventId = parts[2];
    const event = stmts.getEvent.get(eventId);

    if (!event) return interaction.editReply("Event not found.");

    const guild = interaction.guild;
    const submissions = stmts.getSubmissionsByEvent.all(event.id);
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    if (targetPhase === "judging") {
      // Lock threads and make them visible to judges only
      await setThreadVisibility(
        guild,
        submissions,
        judgeRoleId,
        adminRoleId,
        true,
      );
      stmts.setEventStatus.run("judging", eventId);
      await refreshJudgeHub(guild, stmts.getEvent.get(eventId), stmts);

      // Ping judges in the judging channel
      if (event.judge_channel_id) {
        try {
          const judgeChannel = await guild.channels.fetch(
            event.judge_channel_id,
          );
          const ping = judgeRoleId ? `<@&${judgeRoleId}>` : "Judges";
          await judgeChannel.send(
            `${ping} judging is now open for **${event.name}**! Head to judging above and score the entries.`,
          );
        } catch (err) {
          console.error("[judging ping]", err.message);
        }
      }

      return interaction.editReply(
        `Phase set to **Judging**. ${submissions.length} thread${submissions.length !== 1 ? "s" : ""} locked and made visible to judges.`,
      );
    }

    if (targetPhase === "revealed") {
      // Make threads public, unlocked, read-only for everyone
      for (const sub of submissions) {
        try {
          const thread = await guild.channels.fetch(sub.thread_id);
          if (!thread) continue;
          await thread.setLocked(false);
          await thread.permissionOverwrites.edit(guild.id, {
            ViewChannel: true,
            SendMessages: false,
          });
          if (judgeRoleId)
            await thread.permissionOverwrites.edit(judgeRoleId, {
              ViewChannel: true,
              SendMessages: false,
            });
          await thread.permissionOverwrites.edit(sub.user_id, {
            ViewChannel: true,
            SendMessages: false,
          });
        } catch (_) {}
      }
      stmts.setEventStatus.run("revealed", eventId);
      await refreshJudgeHub(guild, stmts.getEvent.get(eventId), stmts);
      return interaction.editReply(
        "Phase set to **Revealed**. All threads are now public.",
      );
    }

    if (targetPhase === "archived") {
      // Post every single result to results channel, then lock everything
      const ranked = submissions
        .map((sub) => {
          const { avg, count } = stmts.getAvgScore.get(sub.id);
          return { sub, avg: avg ?? 0, count };
        })
        .sort((a, b) => b.avg - a.avg);

      if (event.results_channel_id) {
        try {
          const resultsChannel = await guild.channels.fetch(
            event.results_channel_id,
          );

          // Header
          const header = new EmbedBuilder()
            .setTitle(`${event.name} - Final Results`)
            .setDescription(
              `The event has concluded. Entries are revealed from lowest to highest — 1st place is at the bottom.`,
            )
            .setColor(0xffd700)
            .setTimestamp();
          await resultsChannel.send({ embeds: [header] });

          // Post lowest → highest so 1st place lands at the bottom
          const rankedWithRank = ranked.map((item, i) => ({ ...item, rank: i + 1 }));
          const postOrder = [...rankedWithRank].reverse();

          const labels = ["1st Place", "2nd Place", "3rd Place"];
          const colors = [0xffd700, 0xc0c0c0, 0xcd7f32];

          for (const { sub, avg, rank } of postOrder) {
            const scores = stmts.getScoresForSubmission.all(sub.id);
            const feedbackLines = scores
              .filter((s) => s.feedback)
              .map((s) => `- ${s.feedback}`);

            const embed = new EmbedBuilder()
              .setTitle(`${labels[rank - 1] ?? `#${rank}`} - ${sub.title}`)
              .setColor(colors[rank - 1] ?? 0x5865f2)
              .addFields(
                { name: "Creator", value: `<@${sub.user_id}>`, inline: true },
                {
                  name: "Category",
                  value: sub.category || "General",
                  inline: true,
                },
                {
                  name: "Final Score",
                  value: avg > 0 ? `${avg}/10` : "Not scored",
                  inline: true,
                },
                {
                  name: "Description",
                  value: sub.description || "No description.",
                },
              )
              .setFooter({ text: `Entry #${sub.entry_num}` })
              .setTimestamp();

            if (sub.link) embed.addFields({ name: "Link", value: sub.link });
            if (feedbackLines.length)
              embed.addFields({
                name: "Judge Feedback",
                value: feedbackLines.join("\n"),
              });

            const threadBtn = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel("View Submission Thread")
                .setStyle(ButtonStyle.Link)
                .setURL(
                  `https://discord.com/channels/${guild.id}/${sub.thread_id}`,
                ),
            );

            // Ping the creator alongside the embed
            await resultsChannel.send({
              content: `<@${sub.user_id}>`,
              embeds: [embed],
              components: [threadBtn],
            });
          }
        } catch (err) {
          console.error("[archive] results channel error:", err);
        }
      }

      // Lock and archive all threads
      for (const sub of submissions) {
        try {
          const thread = await guild.channels.fetch(sub.thread_id);
          if (thread) {
            await thread.setLocked(true);
            await thread.setArchived(true);
          }
        } catch (_) {}
      }

      stmts.setEventStatus.run("archived", eventId);
      await refreshJudgeHub(guild, stmts.getEvent.get(eventId), stmts);
      return interaction.editReply(
        `Event archived. All ${submissions.length} results posted to <#${event.results_channel_id}>.`,
      );
    }

    return interaction.editReply("Unknown phase.");
  }

  // ---------------------------------------------------------------------------
  // Delete event - step 1: ask for confirmation
  // ---------------------------------------------------------------------------
  if (customId.startsWith("event_delete_confirm_")) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "Only admins can delete events.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const eventId = customId.slice("event_delete_confirm_".length);
    const event = stmts.getEvent.get(eventId);
    if (!event)
      return interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });

    const { count } = stmts.countSubmissions.get(eventId);
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event_delete_execute_${eventId}`)
        .setLabel("Yes, delete everything")
        .setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({
      content: `Are you sure you want to delete **${event.name}**? This will permanently remove all channels, threads, and ${count} submission${count !== 1 ? "s" : ""}. There is no undo.`,
      components: [confirmRow],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ---------------------------------------------------------------------------
  // Delete event - step 2: execute
  // ---------------------------------------------------------------------------
  if (customId.startsWith("event_delete_execute_")) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "Only admins can delete events.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = customId.slice("event_delete_execute_".length);
    const event = stmts.getEvent.get(eventId);
    if (!event) return interaction.editReply("Event not found.");

    const guild = interaction.guild;
    const submissions = stmts.getSubmissionsByEvent.all(event.id);

    // Delete submission threads
    for (const sub of submissions) {
      try {
        const thread = await guild.channels.fetch(sub.thread_id);
        if (thread) await thread.delete();
      } catch (_) {}
    }

    // Delete submit and results channels before replying
    for (const channelId of [
      event.submission_channel_id,
      event.results_channel_id,
    ]) {
      if (!channelId) continue;
      try {
        const ch = await guild.channels.fetch(channelId);
        if (ch) await ch.delete();
      } catch (_) {}
    }

    // Remove from DB
    stmts.deleteEventScores.run(event.id);
    stmts.deleteEventVotes.run(event.id);
    stmts.deleteEventSubmissions.run(event.id);
    stmts.deleteEvent.run(event.id);

    // Reply before touching #judging — the interaction lives in that channel
    await interaction.editReply(`**${event.name}** has been deleted.`);

    // Delete judging channel via direct REST — bypasses the ViewChannel deny
    // overwrite that blocks guild.channels.fetch, only needs Manage Channels role perm
    if (event.judge_channel_id) {
      try {
        await interaction.client.rest.delete(
          `/channels/${event.judge_channel_id}`,
        );
      } catch (err) {
        console.error("[delete] judging channel:", err.message);
      }
    }
    if (event.category_id) {
      try {
        await interaction.client.rest.delete(`/channels/${event.category_id}`);
      } catch (err) {
        console.error("[delete] category:", err.message);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Judge hub: My Progress -> ephemeral per-judge checklist
  // ---------------------------------------------------------------------------
  if (customId.startsWith("jmyprogress_")) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to do that.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const eventId = customId.slice("jmyprogress_".length);
    const event = stmts.getEvent.get(eventId);
    if (!event)
      return interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });

    const submissions = stmts.getSubmissionsByEvent.all(event.id);
    if (!submissions.length)
      return interaction.reply({
        content: "No submissions found for this event.",
        flags: MessageFlags.Ephemeral,
      });

    let myScored = 0;
    const lines = submissions.map((sub) => {
      const myScore = stmts.getScore.get(sub.id, interaction.user.id);
      const { avg, count } = stmts.getAvgScore.get(sub.id);
      if (myScore) myScored++;
      const check = myScore ? "✅" : "⬜";
      const yours = myScore ? `your score: **${myScore.score}/10**` : "not scored";
      const avgStr = count > 0 ? `avg: ${avg}/10` : "no scores yet";
      return `${check} **#${sub.entry_num}** ${sub.title}  ·  ${yours}  ·  ${avgStr}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`My Progress — ${event.name}`)
      .setColor(0x5865f2)
      .setDescription(lines.join("\n"))
      .setFooter({
        text: `${myScored} of ${submissions.length} entries scored by you`,
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ---------------------------------------------------------------------------
  // Judge hub: View entry -> entry detail embed + Score button
  // ---------------------------------------------------------------------------
  if (customId.startsWith("jview_")) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to view entries.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const submissionId = parseInt(customId.slice("jview_".length), 10);
    const submission = stmts.getSubmission.get(submissionId);
    if (!submission)
      return interaction.reply({
        content: "Submission not found.",
        flags: MessageFlags.Ephemeral,
      });

    const viewEvent = stmts.getEvent.get(submission.event_id);
    if (!viewEvent || viewEvent.status !== "judging") {
      return interaction.reply({
        content: "Entries can only be viewed during the judging phase.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const { avg, count } = stmts.getAvgScore.get(submissionId);
    const myScore = stmts.getScore.get(submissionId, interaction.user.id);
    const embed = entryDetailEmbed(submission, avg ?? 0, count, myScore);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`jscore_${submissionId}`)
        .setLabel(myScore ? "Update Score" : "Score this Entry")
        .setStyle(myScore ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel("Open Thread")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${interaction.guild.id}/${submission.thread_id}`,
        ),
    );
    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ---------------------------------------------------------------------------
  // Judge hub: Score button -> open score modal
  // ---------------------------------------------------------------------------
  if (customId.startsWith("jscore_")) {
    if (!isJudge(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to score entries.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const submissionId = parseInt(customId.slice("jscore_".length), 10);
    const submission = stmts.getSubmission.get(submissionId);
    if (!submission)
      return interaction.reply({
        content: "Submission not found.",
        flags: MessageFlags.Ephemeral,
      });

    const scoreEvent = stmts.getEvent.get(submission.event_id);
    if (!scoreEvent || scoreEvent.status !== "judging") {
      return interaction.reply({
        content: "Scoring is only available during the judging phase.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (submission.user_id === interaction.user.id) {
      return interaction.reply({
        content: "You cannot score your own submission.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const existing = stmts.getScore.get(submissionId, interaction.user.id);

    const modal = new ModalBuilder()
      .setCustomId(`modal_score_${submissionId}`)
      .setTitle(`Score Entry #${submission.entry_num} - ${submission.title}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("score")
          .setLabel("Score (1-10)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(existing ? String(existing.score) : ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("feedback")
          .setLabel("Feedback (shown to creator after archiving)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
          .setValue(existing?.feedback ?? ""),
      ),
    );
    return interaction.showModal(modal);
  }
}

module.exports = handleButtons;
