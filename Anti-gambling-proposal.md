# Proposed changes — flow, wording, schema, terms

**Date:** 2 September 2026
**Reads with:** [`Anti-gambling-Claude.md`](Anti-gambling-Claude.md) (audit),
[`Anti-gambling-GPT.md`](Anti-gambling-GPT.md) (audit).
Those two diagnose. This one prescribes: what to build, what to type, what to say.

---

## First, the thing that changes the strategy

The GPT doc found something mine missed, and it is the most important sentence in either
document. Paystack's own Acceptable Use Policy restricts businesses that:

> "involve gambling, gaming and/or any other activity **with an entry fee and a prize**,
> including … **games of skill (whether or not it is legally defined as a lottery)** and
> sweepstakes **unless the operator has obtained prior approval from Paystack** and the
> operator and customers are located **exclusively in jurisdictions where such activities are
> permitted by law**."

I verified it against Paystack's [ineligible-businesses](https://support.paystack.com/en/articles/2127042)
and [supported-businesses](https://support.paystack.com/en/articles/2129730) pages. Three
consequences, and they reframe the whole exercise:

1. **The renaming strategy cannot work, because "entry fee and a prize" is the name of the
   restricted category.** You were planning to move from "pot" to "entry fee" to sound less
   like gambling. Those exact words are what Paystack's policy captures — and it says
   "games of skill" explicitly, "whether or not it is legally defined as a lottery." Careful
   wording is still worth doing (§4), but understand what it buys you: an accurate,
   professional application. It does not buy you a different classification.

2. **The path exists, but it is the licensed-gaming-merchant path.** Paystack's supported
   list has a Gaming category, and betting/lottery businesses must formally register. If they
   approve you, you will most likely be onboarded as a **gaming merchant** — gaming pricing,
   gaming documentation, gaming licence. Not as an edtech company. Plan for that rather than
   hoping to slip in as education with a competition feature.

3. **"Jurisdictions where such activities are permitted by law" is Paystack's condition, not
   just the regulator's.** So the Nigerian licensing question is unavoidable — and post the
   22 November 2024 Supreme Court judgment, gaming is state residual competence, so it is a
   state-by-state question. You cannot answer Paystack without answering it.

Add Apple 5.3 (real-money skill games need a licence per territory, geo-restriction, free
app) and Google's AO rating plus ~15 permitted countries not including Nigeria, and the
picture is consistent: **entry-fee-and-prize is a licensed product everywhere that touches
it.** No wording gets you around it.

So the proposal below has two tracks. Track A is what I'd actually ship. Track B is the spec
for entry fees if you decide to pursue the licence anyway.

---

## Track A — keep the money, drop the mechanic (recommended)

The thing you want is students paying you and caring intensely about winning. The thing that
triggers every regime above is specifically: **participant pays a fee → participant receives
a prize from the fees.** You can keep the first and drop the second.

### A1. Stake reputation, not cash — ship this now

Make challenges cost something that isn't money: streak, rank, or a non-purchasable points
balance. You already have `user_stats` with `streak`, `bestStreak`, `wins`, `losses`, and your
[`store/listing.md`](store/listing.md) already asserts "points are not currency and cannot be
purchased." Keep that sentence true and it stays a 4+/Everyone education app with no
compliance surface at all.

Concretely: let the challenger choose what the duel is worth — 1, 3, or 10 streak points —
and show it in the invite. Same tension, zero regulation. Ship it this week.

### A2. Subscription for the product — Paystack's plainest supported category

Charge for access, not for entry: unlimited challenges, all subjects, full analytics,
explanations, a "weak topics" view. This is an ordinary edtech subscription. It needs no
approval, no licence, no age change, no store declaration. It is also the only revenue in
this document you can start collecting next month.

Critical design rule: **the subscription must never be the price of a chance to win money.**
If paying is what makes you eligible for cash, a regulator will read the subscription as the
entry fee, and you're back in Track B wearing a disguise.

### A3. Sponsor-funded prizes, free entry — the growth engine

Prizes with **no entry fee** are not gambling anywhere, because there is no consideration.
Free entry removes the element entirely; the store policies quoted above bite only on apps
that *accept money* for a prize.

Fund it from your own marketing budget or a sponsor, and make the prize on-brand rather than
cash:

- JAMB registration fee paid for the top 20 students this month
- Data bundles for weekly subject champions
- Textbook sets, a scholarship, a laptop for the term winner

That is a far easier sponsorship conversation than cash ("we paid 50 students' JAMB fees") and
a far easier compliance story. **Free users must be able to win too** — the moment prizes are
paid-subscribers-only, see the rule in A2.

Paystack sees: subscription collections and outbound sponsor-funded transfers. Both ordinary.

### What to tell Paystack under Track A

Nothing about entry fees. You'd be a subscription edtech merchant, which needs no special
review. Reply to Adebusola saying the paid competition is on hold pending licensing advice,
you're proceeding with subscriptions and sponsor-funded prizes with free entry, and ask them
to confirm that's within normal use — a question they can answer in a day instead of a quarter.

---

## Track B — spec for entry fees, if you pursue the licence

Everything here assumes you have written Paystack approval and Nigerian counsel's sign-off
first. Build none of it before both. It is written as a spec so that if you get those, you
aren't designing under time pressure.

### B1. Flow — with the changes that matter

Your current free flow has three timers that were all sized for a free async game, and two of
them are actively wrong once funds are held.

| | Free today | **Paid — proposed** | Why |
|---|---|---|---|
| Join window | 24h (`MATCH_TTL_MS`) | **2 hours** | Holding a student's money for a day before play even starts is the single most complained-about thing you could build |
| Bot fill | 12h (`BOT_FILL_AFTER_MS`) | **never** | §B2 |
| Play deadline | none once joined | **1h from join** | Bounds the hold |
| Review window | n/a | **24h from the second submission** | Your idea, kept |
| **Worst-case fund hold** | — | **~27h** | vs ~48h if you keep the 24h join window |

Shortening the join window is the highest-value flow change in this document, and neither
audit doc proposed it. My own doc told you to *disclose* a 48-hour hold. Better to not have
one.

**Second change: authorize, don't capture, until the challenge is live.**

```
A creates challenge  → authorize A's fee (no funds moved)
B joins              → capture A and B together
B never joins in 2h  → void A's authorization → nothing to refund
```

A voided authorization is strictly better than a refund: instant, no fee, no chargeback
window, no "where is my money" ticket. Paystack supports card pre-authorization; bank
transfer and USSD do not, so **paid challenges should be card-only at launch**, falling back
to capture-and-refund only if you must support other channels. Either way, publish which it
is — "we place a hold" and "we take payment and refund" are different promises.

### B2. The bot — four entry points, all must be closed

My audit found three. There is a fourth that neither doc caught: the invite card renders a
**"Play a bot instead"** button.

| Entry point | Location |
|---|---|
| Hourly cron, automatic at 12h | [`../jamb_backend/src/cron.ts`](../jamb_backend/src/cron.ts) → `fillStaleMatches` |
| `POST /matches/:id/bot` | [`../jamb_backend/src/routes/matches.ts`](../jamb_backend/src/routes/matches.ts) |
| Result-screen fallback | [`src/app/result/[matchId].tsx`](src/app/result/[matchId].tsx) |
| **"Play a bot instead" button** | [`src/components/InviteCard.tsx`](src/components/InviteCard.tsx) |

Close it at the source, not at four call sites — make `fillWithBot` itself refuse:

```ts
// bot.ts, inside the transaction, next to the existing mode check
if (match.entryFeeKobo > 0) {
  throw conflict(
    'paid_match_no_bot',
    'A paid challenge is only ever played against another student.',
  );
}
```

Then hide the two buttons when `entryFeeKobo > 0` and skip paid matches in `fillStaleMatches`.
The server throw is what makes it true; the UI changes are what make it pleasant.

### B3. Schema — two axes, never one enum

Both audit docs agree `settled` cannot keep meaning two things. The GPT doc proposed a single
seven-state chain; mine proposed two orthogonal columns. Two columns is right — a result can
be final while money is still under review, and a chain can't express that — but the GPT
doc's state *names* are more legible to a compliance reviewer, so use those:

```ts
// Result axis — replaces matchStatus for paid challenges
export const competitionStatus = pgEnum('competition_status', [
  'awaiting_entrants',   // was awaiting_opponent
  'in_progress',
  'result_pending',      // computed, review window open
  'result_final',
  'voided',
]);

// Money axis — per participant, on match_players
export const entryState = pgEnum('entry_state', [
  'fee_authorized',
  'fee_captured',
  'held_for_review',
  'refunded',
  'prize_awarded',
]);
```

New columns on `matches`: `entryFeeKobo`, `prizeKobo`, `platformFeeKobo`, `reviewClosesAt`,
`resultFinalAt`, `voidReason`. On `match_players`: `entryState`, `paymentReference`,
`refundReference`, `prizeReference`.

Retire `settledAt` into `resultFinalAt` and `prizeAwardedAt`. Keep an append-only
`competition_events` table — every transition, actor, timestamp, reason. When Paystack or a
user asks what happened, you want a log, not an inference from mutable columns.

### B4. The money rule for every outcome

Merged from both docs, with the code path that produces each case. Publish this table
verbatim in your terms and send it to Paystack — it is the single most credible artifact you
can hand a compliance reviewer.

| Outcome | Code path today | Money rule |
|---|---|---|
| Nobody joins within the join window | bot fills at 12h, else `expired` | Void authorization / full refund. **No bot.** |
| Only one payment succeeds | doesn't exist yet | Don't start; refund the successful one |
| **Opponent joins, never finishes** | expiry sweep flips `in_progress` → `expired`; **`settle()` never runs, no winner, funds stranded** | Void and refund both. Do **not** award the completer by default |
| Exact draw | `settle()` on equal score *and* `totalMs` | Refund both in full. Never roll into a future prize |
| Both forfeit | `settle()` returns a draw | Refund both |
| One forfeits on strikes | loses outright, from *client-reported* flags in `submitAnswer` | **Void and refund.** Losing your own fee to a background app-switch is defensible; handing it to your opponent is a chargeback |
| Question found defective | `question_reports` exists, nothing acts on it | Void and refund, or rescore excluding it — pick one, publish it |
| Suspected collusion or cheating | nothing detects it | `held_for_review`, published evidence-based path, stated SLA |
| Payment succeeds, challenge never starts | doesn't exist yet | Refund; idempotency key on creation |
| Winner deletes their account | `winnerId` is `onDelete: 'set null'`; terms §7 promises history deletion | Block deletion while any `entryState` is unresolved |

The pattern to notice: **almost every edge case refunds.** That is deliberate. A model where
the platform's answer to ambiguity is "give the money back" is one a risk team can underwrite.
Resist the urge to award the pot on a technicality — you gain one satisfied user and one
furious one, and the furious one calls their bank.

### B5. Eligibility

- **18+ for paid entry only.** Free practice and free duels stay 13+, so you don't lose your
  actual market. Terms §2 currently says 13 with **no check anywhere in the code** — I grepped
  both `src` trees for age/DOB/birth and there is nothing.
- The gate must hold on **every** path into a paid challenge: invite code, the
  `sabipass://duel/CODE` deep link, push notification, quick match. The deep link currently
  accepts any code from anyone.
- **Paid invites must be addressed, not broadcast.** The share message today drops
  `sabipass://duel/CODE` into a WhatsApp group. That's ideal for free growth and wrong for a
  paid contest — a link to a money game pasted into a study group full of 16-year-olds is the
  screenshot that ends this. Paid challenges: invite a specific verified user.
- Payout name must match the verified account holder. No third-party payouts, ever.
- Build the anti-collusion controls from my audit §5 before launch, not after: repeat-pairing
  limits, throw detection on the `msTaken`/`isCorrect` data you already store, daily caps,
  device/IP overlap between opponents.

### B6. Dispute window

Both docs agree on the shape; the refinements that matter:

- **24h from the second submission**, shown as an absolute local time, not "24 hours left".
- Auto-release when the window closes with no valid report.
- **Fixed SLA on your side** — 72h to decide, then it releases by default. A dispute must not
  be able to freeze funds indefinitely.
- Reports must pick a defined reason. A report the automated evidence pack contradicts closes
  itself, showing the complainant the pack. Most reports will be "I should have won", and the
  per-question comparison answers those without you lifting a finger.
- You already store everything the pack needs (`answers`: `selectedIndex`, `isCorrect`,
  `msTaken`, `servedAt`, `deadlineAt`, `answeredAt`; `match_players`: `strikes`, `forfeited`,
  `integrityFlags`). It's a query and a view, not a feature.
- **Build the admin surface first.** There is currently no admin, moderation, dispute or
  refund tooling in the repo at all. Without it your dispute process is you, in psql, at 2am.

---

## §4. Wordings

### The rule I'd adopt

**Two vocabularies, split by whether money is involved.** Free play keeps "duel" — it's good
product copy, it's competition rather than wagering, and it's load-bearing in the
`match_mode` enum, the `question_pool` enum, the deep-link scheme and your store keywords.
The GPT doc wants "Quick duel" → "Find a study challenge" everywhere; that's over-correction
for a free feature with no compliance surface, and it costs you a migration for nothing.

Anywhere money appears — and in every external document, website page, store listing and
Paystack email — use **challenge / competition / entrant / entry fee / prize**.

### Change today (free play, uncontroversial, 2 lines)

[`src/app/lobby/[matchId].tsx`](src/app/lobby/[matchId].tsx) — "House rules" is the header
*and* the title. "The house" is the casino word, and this screen is unavoidable in any demo
video:

```diff
-<Screen header={<Header title="House rules" onHome={() => router.replace('/home')} />}>
+<Screen header={<Header title="Match rules" onHome={() => router.replace('/home')} />}>
   <View style={{ gap: space.xs, marginTop: space.lg }}>
     <Eyebrow>BEFORE YOU START</Eyebrow>
-    <Title>House rules</Title>
+    <Title>Match rules</Title>
```

### Naming for the money code, when it exists

| Don't | Do |
|---|---|
| `pot`, `stake`, `stakeAmount`, `wager`, `buyIn` | `entryFeeKobo` |
| `payout`, `winnings`, `cashOut` | `prizeKobo`, `prizeAwardedAt` |
| `house`, `rake`, `odds`, `margin` | `platformFeeKobo` |
| `settled` (for money) | `resultFinal` + `prizeAwarded`, separately |
| "Winner takes all" | "The winner receives the competition prize" |
| "Top up", "withdraw", "balance" | "Pay entry fee", "refund to your card" — **no stored balances at all** |

No wallet. A stored balance is a deposit, a deposit is a regulated activity, and it converts a
payment product into a financial one. Money in for a specific challenge, money out to a card
or bank account. Nothing rests on the platform.

### Screen copy, ready to paste

**Before payment** — required, with affirmative acceptance for that specific challenge:

> **Biology · 10 questions · 15 seconds each**
> Entry ₦500 · Prize ₦900 · SabiPass fee ₦100
>
> Both entrants answer the same ten questions in the same order, with the same time limit.
> Neither of you sees a score until both have finished.
> Higher score wins. Level scores are broken by total answer time.
>
> If nobody joins within 2 hours, your entry is released in full.
> If either of you cannot finish, both entries are refunded in full.
> If the scores are exactly level, both entries are refunded in full.
> The result is held for 24 hours after both finish, so either entrant can report a problem.
>
> [ ] I am 18 or over and I accept the rules for this challenge
> **Pay ₦500 entry**

**Result, pending review** — no amount in the headline:

> **Tobi wins · 1,840 – 1,620**
> Result under review until **tomorrow, 10:42 AM**. The prize is paid after that if
> neither entrant reports a problem.
> [See every question] [Report a problem]

**Prize paid:**

> **Prize paid · ₦900 sent to your bank account**
> Reference PS-8842-XK. Allow up to 24 hours for your bank.

**Voided:**

> **Challenge voided · ₦500 refunded**
> Nobody joined within 2 hours, so your entry was released in full. It should be back on
> your card within 3–5 working days.

**Push notifications** — [`../jamb_backend/src/services/notify.ts`](../jamb_backend/src/services/notify.ts)
currently sends "You won" / "You lost" / "Dead heat". Fine while free. Paid:

| Event | Title | Body |
|---|---|---|
| Result computed | `Result in` | `1,840 – 1,620 against Tobi. Under review until 10:42 AM tomorrow.` |
| Prize paid | `Prize paid` | `₦900 sent to your bank account.` |
| Voided | `Challenge voided` | `Nobody joined in time. Your ₦500 entry was released in full.` |

Never put an amount in a notification before it's final. "You won ₦900" followed by a void is
the message that gets screenshotted.

**Words to keep out of everything:** risk-free, guaranteed, easy cash, win big, double your
money, make money from studying, jackpot, cash out, bet, odds, house.

### Invite card in paid mode

[`src/components/InviteCard.tsx`](src/components/InviteCard.tsx): "SHARE THIS DUEL" →
"**SHARE THIS CHALLENGE**", and the "Play a bot instead" button must not render at all
(§B2). The share message should not carry a paid challenge into a group chat (§B5).

### Fix in the GPT doc

Its link to "the match schema" points at `src/db/schema.ts`, which doesn't exist — the schema
is [`../jamb_backend/src/db/schema.ts`](../jamb_backend/src/db/schema.ts). Worth correcting if
you send that doc to anyone.

---

## §5. Terms — new section to draft

The GPT doc is right that this needs counsel rather than a wording patch, but counsel works
faster from a draft. Give them this skeleton with §B4's table dropped in:

```
13. Paid challenges

13.1  Eligibility — 18+, verified identity, permitted locations only.
      Under-18 accounts keep full access to practice and free challenges.
13.2  What a challenge is — subject, question count, order, time limit,
      scoring rule, tie-breaker, entry fee, prize, platform fee, join
      deadline. All fixed and displayed before payment.
13.3  Who funds the prize — name it. Never describe one entrant's money as
      "held for" another unless that is genuinely the approved arrangement.
13.4  Entry, and when we take payment — authorization vs capture, stated plainly.
13.5  Void and refund rules — §B4 table, verbatim.
13.6  Result and review — how the result is computed, the 24h window, the
      defined grounds for a report, the evidence we hold, our decision SLA.
13.7  Prize payment — timing, method, name-match requirement, no third-party payouts.
13.8  Integrity — conduct that voids a challenge, including collusion and
      operating more than one account.
13.9  Bank disputes — your card rights are unaffected by our review window
      and are not limited by it.
13.10 Tax — whose responsibility.
13.11 Account closure — we cannot delete an account while a challenge is unresolved.
```

That last clause needs a matching edit to §7, which currently promises deletion "is permanent
and removes your match history" with no carve-out.

And the store declarations from my audit: [`store/listing.md`](store/listing.md) currently
answers **No** to IARC gambling on the strength of "points are not currency and cannot be
purchased," and rates the app 4+/Everyone. Under Track A that stays true. Under Track B all
three are false the day the fee ships, and Google requires an **AO** rating.

---

## §6. What I'd correct in my own audit

- I told you to make the "equal opportunities" claim *precise*. Still right, but I framed
  precision as the thing that helps your classification. Given the AUP text, it doesn't —
  precision keeps you credible, nothing more. Don't over-invest in it.
- My §7 treated terminology as "cheap, worth doing, least important." I'd go further: under
  Track B, terminology is close to irrelevant to the outcome. Under Track A, it's just good
  copywriting. Either way it is not a compliance lever, and both of these documents gave it
  more space than it earns.
- I said the store gate is "probably your real blocker." With the AUP text in hand, the
  ranking is: **Nigerian state licensing → Paystack approval → store distribution.** All
  three are gates on Track B; none are gates on Track A.

---

## §7. Order of work

**This week**, all Track A, no approvals needed:

1. Rename "House rules" → "Match rules" (§4).
2. Ship streak stakes (A1).
3. Scope the subscription (A2) and reply to Paystack narrowing the question to subscriptions.
4. Fix the `in_progress` → `expired` gap so `settle()` runs — it's a real bug in the free
   product today, independent of money: an abandoned duel currently produces no result at all.

**This month:**

5. Draft one sponsor deal with free entry and a JAMB-fee prize (A3).
6. Get the Nigerian gaming/payments opinion, combined with the IP question `PLAN.md:235`
   already flags. The question is state competence post-Nov-2024.

**Only if the opinion comes back favourable:** Track B, in the order B2 → B3 → B4 → B5 → B6,
with the admin surface before the wallet, and no payment code until Paystack's approval is in
writing.

---

## Sources

- [Paystack ineligible businesses](https://support.paystack.com/en/articles/2127042) ·
  [supported businesses](https://support.paystack.com/en/articles/2129730) ·
  [terms](https://paystack.com/terms)
- [Google Play — Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en) ·
  [common violations](https://support.google.com/googleplay/android-developer/answer/13381106?hl=en)
- [Apple and real-money gaming apps — WLA](https://world-lotteries.org/insights/editorial/blog/apple-ups-the-ante-on-real-money-gaming-apps) ·
  [skill-based real-money game approval guide](https://artaevatlaw.com/2021/08/11/skill-based-real-money-game-guide/)
- [Navigating Nigeria's gaming laws — Pavestones Legal](https://pavestoneslegal.com/navigating-nigerias-gaming-laws-the-start-of-a-new-chapter/) ·
  [Legislative and regulatory powers over gaming in Nigeria — IMGL](https://www.imgl.org/publications/imgl-magazine-volume-3-no-1/legislative-and-regulatory-powers-over-lottery-gaming-and-betting-in-nigeria/)

Not legal advice. The Nigerian licensing question and the 18+ gate are the two items to put
in front of a practitioner.
