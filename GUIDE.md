# Bot Guide

---

## For admins

### Setting up an event
Run `/event-setup` with a name (and optionally a description). The bot will create a category with three channels automatically:
- **#submit** — where participants submit their entries
- **#judging** — your private panel, only you and judges can see it
- **#results** — where final placements get posted at the end

---

### Running the event

Events move through phases in order. You control this with the buttons in **#judging**.

| Phase | What's happening |
|---|---|
| Submissions Open | People can submit. This is the default when you create the event. |
| Judging | Submissions are locked. Judges are added to threads and can review + score. |
| Revealed | All submission threads go public. Everyone can see who made what. |
| Archived | Final results are posted to **#results** ranked by score. Threads are locked. |

To move to the next phase, just hit the button at the bottom of the judging panel in **#judging**.

---

### Commands

| Command | What it does |
|---|---|
| `/event-setup` | Creates a new event with all channels |
| `/event-status` | Shows a quick stats card (entries, scored, pending) |
| `/event-delete` | Deletes an event and everything in it — asks for confirmation first |

---

## For judges

When judging starts you'll get a ping in **#judging**. Head there and you'll see the judging panel with a button for each entry.

1. Click an entry button to see its details
2. Hit **Score this Entry** to give it a score from 1–10, and optionally leave feedback
3. The feedback you write will be shown to the creator once the event is archived

You can update your score any time before the event moves to the next phase. You can't score your own submission.

Hit **My Progress** at the bottom of the judging panel to see a personal checklist — which entries you've scored, your score for each, and the current average.

---

## For participants

### Submitting
1. Go to **#submit** and click **Submit**
2. Fill in your entry title and a short description
3. You'll get a private thread — upload your files there
4. You can upload as many times as you want before judging starts

Once judging begins your thread gets locked and judges will be able to read it. You won't be able to edit or add anything after that point, so make sure everything's uploaded before then.

### After judging
Once the event is archived, your results and any judge feedback will be posted in **#results**. You'll get pinged.
