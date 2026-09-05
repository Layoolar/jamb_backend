# Anti-gambling review — SabiPass paid duels

**Date:** 2 September 2026
**Scope:** everything in `jamb_frontend` and `jamb_backend` that would change character the
moment an entry fee exists, plus the Paystack/store/legal framing around it.
**Status of the code today:** there is **no money code at all**. No Paystack, no wallet, no
fee, no payout, no `pot`/`stake`/`wager` anywhere. `PLAN.md:93` and `PLAN.md:376` both say
"no payments in v1". That is the single best thing about this review — nothing has to be
undone, and the naming can be right the first time.

---

## The short version

The advice you got is decent on *wording* and it is right that Paystack's reply is
encouraging rather than a rejection. But wording is the least of your problems, and the
advice misses the two things that actually decide whether this ships:

1. **Your bot makes the paid product literally gambling, not just gambling-*sounding*.**
   Today an unclaimed duel gets filled by a bot whose score is `Math.random()`. Attach a fee
   to that and a student pays money into an outcome decided by the house's random number
   generator. That is not a framing problem you can write your way out of; it is the
   definition of the thing you are trying not to be. Nothing else in this document matters
   until it is fixed. ([§1](#1-the-bot-is-the-whole-ballgame))

2. **The app stores are a harder gate than Paystack, and you're aiming at the wrong one
   first.** Apple explicitly treats real-money *skill* games as real-money gaming under
   guideline 5.3, and Google's policy has no skill-game carve-out at all — it names "games
   that accept money and offer prizes of cash" as a violation, requires a gambling licence
   per country, an **AO (Adult Only)** rating, and permits it in roughly 15 countries that
   have not included Nigeria. Android is most of your market. It is entirely possible for
   Paystack to say yes and for you to still have no way to distribute the feature.
   ([§2](#2-the-store-gate-is-probably-your-real-blocker))

Then, in descending order of how much money they can cost you: your age floor is 13
([§3](#3-your-age-floor-is-13-that-has-to-become-18)), several match outcomes have no
defined money rule and would strand funds ([§4](#4-outcomes-with-no-money-rule-today)),
there is a clean self-collusion cash-out channel that is exactly what a PSP screens for
([§5](#5-collusion-the-risk-paystack-actually-cares-about)), and one sentence in your
Paystack email is checkably untrue ([§6](#6-where-your-paystack-email-overclaims)).

Renaming things is §7. Do it, it's cheap, but do not mistake it for compliance.

---

## What you have that is genuinely strong

Say these to Paystack, because they are true, unusual, and verifiable in a demo:

- **The question set is fixed at creation.** `matches.questionIds` is written once in
  `createMatch` and shuffled once — both players get the same ten questions *in the same
  order*. ([`../jamb_backend/src/services/match.ts`](../jamb_backend/src/services/match.ts), `createMatch`)
- **Nothing is revealed until the duel is decided.** `getMatchResult` gates every score,
  answer key and explanation behind `status === 'settled'`. The second player cannot see
  the first player's score before committing. Most competitors get this wrong; you didn't.
  ([`../jamb_backend/src/services/match.ts`](../jamb_backend/src/services/match.ts), the `revealed` gate)
- **Timing is server-owned.** `servedAt`/`deadlineAt` are stamped in the database, serving is
  idempotent, and force-quitting mid-question returns the *original* deadline. The client
  never reports elapsed time — it only says which option was tapped.
- **Duel and practice question pools are provably disjoint** — a unique index on
  `questions.stem` plus a two-value `question_pool` enum, so you cannot grind a question in
  practice and recognise it in a paid duel. That is a real anti-cheat control, not a claim.
- **You already store a complete audit trail.** `answers` has `selectedIndex`, `isCorrect`,
  `msTaken`, `servedAt`, `deadlineAt`, `answeredAt` per question per player; `match_players`
  has `strikes`, `forfeited`, `integrityFlags`. The "evidence package" idea is one SQL query
  away — you don't need to build the data, only the view.
- **One open duel at a time**, so nobody can reroll a bad run and share only the good one.

That is a better skill-competition story than most operators can tell. Lead with it.

---

## 1. The bot is the whole ballgame

Three paths currently attach a bot to a duel:

| Path | Where |
|---|---|
| Hourly cron, automatic, 12h after creation | [`../jamb_backend/src/cron.ts`](../jamb_backend/src/cron.ts) → `fillStaleMatches` |
| User taps a button on the waiting screen | `POST /matches/:id/bot` in [`../jamb_backend/src/routes/matches.ts`](../jamb_backend/src/routes/matches.ts) |
| Offered in the UI as the way out of a stuck duel | [`src/app/result/[matchId].tsx`](src/app/result/[matchId].tsx) |

And the bot's performance is pure RNG — [`../jamb_backend/src/services/bot.ts`](../jamb_backend/src/services/bot.ts):

```ts
const ACCURACY = { 1: 0.82, 2: 0.62, 3: 0.41 };   // accuracy by difficulty
const isCorrect = Math.random() < accuracy;        // whether it gets it right
const msTaken   = Math.round(2500 + Math.random() * 8500);  // how fast
const selectedIndex = isCorrect ? q.correctIndex
  : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
```

With a fee attached, that is: user pays ₦X → house generates a random opponent score →
random draw decides who takes the money. Every element of gambling is present, including
the one you told Paystack was absent ("Nothing around chance"). It is also *worse* than a
neutral wager, because the house controls the RNG parameters and the user cannot audit them.

And the bot pays no entry fee, so the prize has to come from your own pocket or from the
loser's fee. Either way you are the counterparty to the bet. That is a bookmaker.

Note what happens to your own design comment in `createMatch`:

> *"Holding only one open duel means getting out of a bad one costs a settled match on your
> record (via the bot), so nothing is quietly discardable."*

Excellent reasoning while the game is free. With a fee, that same sentence reads "getting out
of a bad duel costs you your entry fee to a random number generator." The tradeoff inverts.

### Fix

- **A match with an entry fee can never be filled by a bot.** Not by cron, not on demand,
  not as a courtesy. Enforce it where it cannot be forgotten: give paid matches their own
  mode (or a non-null `entry_fee_kobo`), and make `fillWithBot` refuse outright rather than
  relying on a caller to check.
- **Unclaimed paid match at expiry → automatic full refund**, no bot, no "settled match".
- **Keep the bot for free play.** It is a good cold-start answer there and it is honestly
  labelled (`users.isBot`, rendered as "Bot"), which is more than most apps manage.
- Currently `BOT_FILL_AFTER_MS` (12h) fires *before* `MATCH_TTL_MS` (24h), so a paid duel
  would be bot-filled long before it could ever reach the refund path. That ordering has to
  reverse for paid matches.

---

## 2. The store gate is probably your real blocker

You are negotiating with Paystack first because they replied first. But the binding
constraint is likelier to be distribution.

**Google Play — Real-Money Gambling, Games, and Contests.** The policy prohibits
"content or services that enable or facilitate users' ability to wager, stake, or participate
using real money … to obtain a prize of real world monetary value," and lists as a violation
"Games that accept money in exchange for an opportunity to win a physical or monetary prize."
There is **no skill-based carve-out**. Apps that qualify under the licensed exception must
have a valid gambling licence for each country of distribution, be free to download, **not**
use Play In-app Billing, prevent under-age access, and carry an **AO (Adult Only)** rating.
Secondary reporting puts the permitted-country list at about fifteen — Australia, Belgium,
Canada, Colombia, Denmark, Finland, Germany, Japan, Mexico, New Zealand, Norway, Romania,
Spain, Sweden, US (select states). **Nigeria has not been on it.** Verify the current list
yourself before you plan around this, but assume the answer is no.

**Apple — guideline 5.3.** Real-money gaming apps need the necessary licensing and
permissions in every location where the app is used, must be geo-restricted to those
locations, and must be free on the App Store; IAP may not be used to buy credit for
real-money gaming. Apple treats **real-money skill games as falling inside this category**
even though skill games don't turn on chance — this is the specific point people get wrong.

**Nigeria.** The "it's skill, so it isn't gambling" argument is weaker here than in the US.
The National Lottery Act 2005 defines gambling to include the distribution of prizes "by lot
or chance, **or as a result of the exercise of skill and chance**," and the regulated
categories include promotional competitions and skill-based games involving prizes. Worse for
planning purposes: on **22 November 2024** the Supreme Court held that gaming is not within
federal legislative competence and curtailed the National Lottery Act to the FCT — so
licensing is now a **state-by-state** question (Lagos State's authority, etc.), not one
federal licence.

### What this means practically

Your own [`store/listing.md`](store/listing.md) warns, about the IARC questionnaire, that
"answering no when a username is visible to another player is the kind of inaccuracy that
gets a listing pulled later." That instinct is exactly right and it applies with far more
force to money. Do not ship the fee quietly into a store build rated 4+/Everyone that
answered "No" to the gambling question. That is the fastest route to a terminated developer
account, and a terminated Google account is not appealable in practice.

So the sequencing is: **settle distribution before you build payments.** Options, best first:

- **Prizes funded by you or a sponsor, entry free.** No consideration from the player means
  it isn't gambling in any jurisdiction, the store policies don't bite, and Paystack only ever
  sees ordinary subscription or sponsorship revenue. Weakest revenue, cleanest compliance.
- **Paid access, prizes as a marketing cost.** Students pay for the *product* (unlimited
  duels, analytics, more subjects) and prize money comes from your funds, not from the
  opponent's fee. Money never flows player → player, which removes the single feature that
  makes this look like betting. This is the model I'd push you toward: it keeps almost all
  of the motivational pull, and it is a normal edtech business a PSP underwrites without a
  compliance review.
- **Entry fee → pot → winner** (what you're asking about). Highest ceiling, and it requires
  state-level licensing advice, 18+ gating, AO rating, geo-restriction, a licensed-app
  exception on both stores, and possibly web-only distribution for the paid tier.

`PLAN.md:235` already tells you to see a Nigerian IP lawyer about the question bank. Make it
one trip and ask a gaming/payments lawyer at the same time. This is the one item in this
document where my opinion is worth less than a Nigerian practitioner's.

---

## 3. Your age floor is 13 — that has to become 18

- [`store/terms.md`](store/terms.md) §2: *"You must be 13 or older to use SabiPass."*
- [`store/listing.md`](store/listing.md): Apple **4+**; Google IARC answers **No** to gambling,
  with the note "points are not currency and cannot be purchased" — true today, false the day
  a fee exists.
- **There is no age check anywhere in the code.** I grepped for age/DOB/birth across both
  `src` trees: nothing. The 13+ rule is prose in a document, not a control.

JAMB candidates are heavily 16–18, so a real slice of your users are minors, and a paid
contest between minors is a blocker for any PSP, both stores, and Nigerian law
independently. Google's licensed exception requires an AO rating and blocking under-age
users outright.

If you keep paid duels, the app becomes two products: free practice and free duels for
everyone 13+, and paid competition behind a hard 18+ verification wall that a 16-year-old
cannot reach by any path — not by invite code, not by deep link (`sabipass://duel/CODE`
currently accepts any code from anyone), not by push notification. Design that boundary
before you build the wallet, because retrofitting it is much harder.

---

## 4. Outcomes with no money rule today

Paystack asked what happens to the money in each edge case. Here are the cases your state
machine can actually produce, several of which have no answer yet. Answer all of them in
writing before you send anything.

| Case | What the code does now | Money rule needed |
|---|---|---|
| Nobody joins | Bot fills at 12h; else `expired` at 24h ([`../jamb_backend/src/cron.ts`](../jamb_backend/src/cron.ts)) | Full refund. No bot. |
| **B joins, never finishes** | Expiry sweep flips `in_progress` → `expired`. **`settle()` never runs. No winner. Money stranded.** | Completing player wins, or both refunded — pick one and publish it |
| Draw | `settle()` returns a draw on equal score *and* equal `totalMs` | Refund both, minus fee or not — state it |
| Both forfeit | `settle()` returns a draw | Same as draw |
| One forfeits | Loses outright regardless of score | See below — this one is dangerous |
| Question found invalid | `question_reports` exists, nothing acts on it | Void and refund, or rescore |
| Payment succeeds, match never starts | No such path exists yet | Refund; idempotency key on creation |
| Winner deletes their account | `matches.winnerId` is `onDelete: 'set null'`, and terms §7 promises deletion "removes your match history" | Block deletion while funds are in flight |

Three of these deserve more than a table row.

**Forfeit-by-strikes is a consumer-protection landmine.** Two app-away events over
`STRIKE_THRESHOLD_MS` (2s) and you forfeit — and the strikes come from *client-reported*
flags in `submitAnswer`. The code comment reasons that a hostile client gains nothing by
lying because strikes only hurt the reporter. Sound while free. With money, "our app decided
you left the screen twice, so you lost ₦1,000" is a chargeback, a Play Store review, and a
Paystack complaint. A phone call, a system dialog, a network blip. My advice: with money on
the line, a forfeit should **void and refund**, not award the pot to the opponent. Losing your
own stake to a background event is defensible; *handing it to your opponent* is not.

**`status = 'settled'` is about to mean two different things.** Right now it means "the result
is computed." Add money and it also means "the prize has been paid" — and those are days
apart under your 24h window. Split them now:

```
result:  in_progress → result_pending → result_final | voided
money:   fee_held    → prize_awarded | refunded | held_for_review
```

Two independent columns, never one enum trying to say both. `settledAt` similarly needs to
become `resultFinalAt` and `prizeAwardedAt`.

**A duel can sit for 24 hours before the second player even starts** (`MATCH_TTL_MS`), so a
24h dispute window measured from the *last* submission means you may hold funds for ~48h.
Fine — but say "up to 48 hours" in the terms and the UI, not "24 hours", or your first
support ticket is about your own promise.

---

## 5. Collusion — the risk Paystack actually cares about

This is missing entirely from the advice you were given, and it is the first thing a payments
risk team looks for.

Two accounts controlled by one person can meet deliberately via invite code, and one can
throw the match. Money in on a card, money out to a different bank account, minus your cut.
That is a **cash-out / laundering channel**, and it is why PSPs are cautious about
peer-to-peer prize flows in the first place.

What exists today: `joinMatch` has `ne(matches.createdBy, userId)`, which stops you joining
your *own* duel. A second account defeats it in thirty seconds. Beyond that there is
**nothing** — no device fingerprinting, no repeat-pairing analysis, no throw detection, no
velocity limits. `integrityFlags` are, by the schema's own comment, *"logged for analysis,
never auto-banned"*, and I confirmed there is **no admin, moderation, dispute or refund
surface in the codebase at all**.

The good news: the detection signals are already in your `answers` rows. A thrown match is
statistically loud — near-zero score at implausible speed, or wrong answers chosen fast and
uniformly. You store `msTaken` and `isCorrect` per question, so you can catch it.

Before money: repeat-pairing limits between the same two accounts, throw detection on the
data you already have, per-day stake and payout caps, payout only to a bank account whose
name matches the verified account holder, device/IP overlap checks between opponents, and a
human review queue. **Build the admin surface before you take the first naira** — otherwise
your dispute process is you, running SQL by hand, at 2am, against a user who has your
Paystack merchant ID and knows how to file a complaint.

---

## 6. Where your Paystack email overclaims

> *"The 2 have EXACTLY equal opportunities … Nothing around chance."*

Mostly true, and defensible — but not exactly, and a compliance reviewer with your demo in
front of them can check it:

- **Speed is scored, and speed includes the network.** `pointsFor` gives up to 100 of the 200
  points available per question for how fast you answered, and `msTaken` is server wall-clock
  from serve to answer — round-trip included. Your own `PLAN.md:166` says the 3G round trip is
  300–800ms and adds a 1.5s grace for exactly this reason. Two students with identical
  knowledge on 4G and 3G do not have identical chances, and ties break on `totalMs`, so
  latency counts twice.
- **Play is asynchronous** — up to 24h apart, not simultaneous. Not chance, but not
  "identical conditions" either.
- **The bot**, per §1, is chance, and it's in the product right now.

None of this sinks the skill argument. Just make the claim precise instead of absolute:

> Both participants receive an identical question set in an identical order, fixed before
> either begins, with the same time limit, the same scoring rules and the same number of
> questions. Neither can see the other's score or any answer key until both have finished.
> The result is computed by a published, deterministic scoring rule from the participants'
> own answers. There are no odds, no house position, and no third-party event involved.

Every clause there is true of your code. "EXACTLY equal opportunities" is not, and
overclaiming to a compliance team is how you lose the benefit of the doubt on everything else.

Also drop "we have a lot of anti-cheat mechanisms" in favour of naming them, because the real
ones are good: server-owned clock, idempotent serve, disjoint question pools, screenshot and
screen-recording blocking, app-away strikes, no reveal before settlement. Your own
[`src/lib/anticheat.ts`](src/lib/anticheat.ts) is refreshingly honest that this is
"deterrence, not prevention — a second phone pointed at the screen defeats all of this. The
real control is the 15-second timer." That candour will serve you better with a reviewer than
a claim they can break in one try.

---

## 7. Terminology

Cheap, worth doing, and the least important section here.

**Fix this one today** — it's two lines and it's the worst word in the app:

- [`src/app/lobby/[matchId].tsx`](src/app/lobby/[matchId].tsx) uses **"House rules"** as both
  the header and the title. "The house" is *the* casino word. → **"Match rules"** or
  **"Exam rules"**.

**Names to get right the first time, when you add the money code:**

| Don't | Do |
|---|---|
| `pot`, `stake`, `stakeAmount`, `wager` | `entryFeeKobo` |
| `payout`, `winnings` | `prizeKobo`, `prizeAwardedAt` |
| `bet`, `odds`, `house`, `rake` | `platformFeeKobo` |
| "Winner takes all" | "The winner receives the competition prize" |

**Judgement calls:**

- **"Duel"** is fine and I would keep it. It's a competition word, not a gambling word — chess
  and debating both use it. It's also load-bearing: the `match_mode` and `question_pool`
  enums, the `sabipass://duel/CODE` deep link, your store keywords, and UI copy throughout.
  Renaming means a migration for near-zero compliance gain. If you want to soften the
  *outward* face, use "challenge" or "head-to-head" in store copy, the website and everything
  you send Paystack, and leave the internals alone.
- **"Beat your friends. Pass JAMB."** — keep. Competition, not money.
- **"You won" / "You lost"** push titles in
  [`../jamb_backend/src/services/notify.ts`](../jamb_backend/src/services/notify.ts) — fine while
  free. With money: *"You won the challenge — prize pending review"*, never *"You won ₦1,000"*.
  Don't put an amount in a notification before it's final.
- **Store category** is already Education with a Trivia secondary, and your listing note says
  "Education is the honest one." Right call. Keep the educational surface — practice mode,
  explanations, analytics — visibly larger than the paid competition, and make sure the
  landing page a Paystack reviewer opens leads with JAMB preparation, not with prizes.

---

## 8. On the 24h dispute window

Good instinct, and stronger than the version you were sold, because you already have the
audit trail to back it up (§"What you have"). Refinements:

- **Measure from the last submission, not the result** — and disclose the worst case as ~48h
  (§4).
- **Show the pending state in the UI**, as you were advised. That part is right.
- **Auto-release on a fixed SLA.** A dispute must not freeze funds indefinitely; give yourself
  a stated window (say 72h) to decide, after which it releases by default.
- **Require evidence, not a button.** Your valid/invalid list is sensible. Add: a dispute that
  the automated evidence pack contradicts is closed automatically, with the pack shown to the
  complainant. Most disputes will be "I think I should have won", and the per-question
  comparison answers those without you touching them.
- **The window is not a compliance argument.** It makes you look like a competent operator,
  which helps. It does not change how Paystack classifies the activity, and it does not touch
  §1, §2 or §3. Don't let it become the centrepiece of your pitch.

---

## 9. What I'd actually do, in order

1. **Decide the money model** (§2) — sponsor-funded, paid-access-with-prizes, or peer entry
   fees. Everything downstream depends on this and only the third one needs licensing.
2. **Get 30 minutes with a Nigerian gaming/payments lawyer**, combined with the IP question
   `PLAN.md:235` already flags. State competence post-Nov-2024 is the specific question.
3. **Check both stores' current policies yourself** — Google's permitted-country list and
   Apple 5.3 — before building anything.
4. **Reply to Paystack now** (§10), describing what is built versus proposed. You have no
   payment flow to demo, so don't imply one.
5. Fix the bot rule at the type level (§1) and rename "House rules" (§7).
6. Write the money rules table (§4) as a public document, and split result state from money
   state in the schema.
7. Build the 18+ boundary (§3), the admin/dispute surface and the collusion controls (§5).
8. Only then build the wallet.

---

## 10. Draft reply to Paystack

Accurate to this codebase, unlike the version you were given — which asserts a payment flow
you haven't built and implies the platform holds funds, an arrangement you should not describe
until you know how you'd do it.

> **Subject: Re: Educational 1v1 quiz competition — platform review**
>
> Hello Adebusola,
>
> Thank you for coming back to me. I'd like to be straightforward about where the product is:
> the educational platform is built and I can demo it end to end, but the paid competition
> feature is at design stage and no payment flow has been implemented yet. I'd rather have
> your team's guidance before I build it than after.
>
> **What the platform is.** SabiPass is a JAMB preparation app. Students practise past and
> original examination questions by subject, with worked explanations and performance
> tracking. One feature lets two students answer the same question set head to head.
>
> **How a head-to-head works today, without any money involved.** The ten-question set is
> selected and fixed when the challenge is created, and both participants receive it in the
> same order. Each has fifteen seconds per question, on a clock owned by our server rather
> than the device. Neither participant can see the other's score, the answer key, or any
> explanation until both have finished. The result is computed by a published, deterministic
> rule from the participants' own answers. There are no odds, no house position, no
> third-party event, and no randomised element in the result. We also block screenshots and
> screen recording during questions, keep the competitive and practice question banks strictly
> separate so answers cannot be learned in advance, and record a per-question audit trail
> (answer given, time taken, times served and submitted) for every participant.
>
> **What we are proposing.** Both participants would pay the same fixed entry fee to enter a
> challenge; the participant with the better score would receive a predefined prize. Before
> building it we have written rules for every other outcome — nobody accepts the challenge, a
> participant doesn't complete, a tie, a question found to be defective, a suspected
> integrity breach, a payment that succeeds where the challenge does not start — and in each
> case the rule is a refund rather than a payout. We would hold the result for a review period
> after both participants finish, during which either can raise a dispute against the audit
> trail, before any prize is released. Paid entry would be restricted to verified users aged
> 18 or over; under-18 users would retain full access to practice and to free challenges.
>
> **What I'm asking.** We understand your compliance team will need to classify this use case,
> and we're not asking you to accept our characterisation of it. We'd appreciate guidance on
> whether a skill-based educational competition of this kind falls within Paystack's permitted
> use cases; if so, what requirements would apply — licensing, KYC, settlement or fund-holding
> arrangements, restrictions on participant-to-participant flows; and whether there is a
> structure you'd prefer, for instance prizes funded by us rather than pooled from participant
> entry fees.
>
> I can provide a demo of the current platform at whatever depth is useful, including the
> integrity controls and the audit trail, and I'm happy to walk through the proposed flow on a
> call.
>
> Kind regards,
> Ayoola

Two notes on the demo video, if you make one: film the real screens
([`src/app/home.tsx`](src/app/home.tsx) → [`src/app/subjects.tsx`](src/app/subjects.tsx) →
lobby → [`src/app/play/[matchId].tsx`](src/app/play/[matchId].tsx) →
[`src/app/result/[matchId].tsx`](src/app/result/[matchId].tsx)), and rename "House rules"
before you hit record, because that screen is unavoidable in any honest walkthrough. And
don't mock up a payment step that doesn't exist — showing a real product plus a written
proposal reads as competent; showing a fake payment flow reads as something else entirely.

---

## Sources

- [Real-Money Gambling, Games, and Contests — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
- [Common violations for gambling apps — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13381106?hl=en)
- [Google Play developer policy changes & real money gambling — Gummicube](https://www.gummicube.com/blog/google-play-developer-policy-changes-real-money-gambling/)
- [Google's Real-Money Gambling, Games, and Contests Policy — iGaming Afrika](https://igamingafrika.com/googles-real-money-gambling-games-and-contests-policy/)
- [A guide to getting your skill-based real-money game approved — Artaev at Law](https://artaevatlaw.com/2021/08/11/skill-based-real-money-game-guide/)
- [Apple ups the ante on real-money gaming apps — World Lotteries Association](https://world-lotteries.org/insights/editorial/blog/apple-ups-the-ante-on-real-money-gaming-apps)
- [Navigating Nigeria's gaming laws: the start of a new chapter — Pavestones Legal](https://pavestoneslegal.com/navigating-nigerias-gaming-laws-the-start-of-a-new-chapter/)
- [Legislative and regulatory powers over lottery, gaming and betting in Nigeria — IMGL](https://www.imgl.org/publications/imgl-magazine-volume-3-no-1/legislative-and-regulatory-powers-over-lottery-gaming-and-betting-in-nigeria/)
- [An overview of gambling in Nigeria — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8274406/)
- [Setting up a game-of-skills business in Nigeria — 1st Attorneys](https://1stattorneys.com/articles/2019/04/03/setting-up-game-of-skills-business-in-nigeria/)

Not legal advice. Items §2 and §3 are the ones to put in front of a Nigerian practitioner.
