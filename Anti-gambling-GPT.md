# Paid Competition and Gambling-Risk Review

**Prepared:** 2 September 2026  
**Scope:** SabiPass's current product language and match implementation, plus the proposed paid 1v1 quiz feature.  
**Important:** This is product and processor-compliance analysis, not Nigerian legal advice. Get advice from a Nigerian lawyer who handles gaming, consumer payments, and promotions before enabling any paid competition.

## Bottom line

The current app is a free, educational head-to-head quiz product. It has no payment, wallet, deposit, payout, prize, or entrant-fund records in the code reviewed.

That changes materially if both students pay and the winner receives their combined payments. Calling those payments an "entry fee" and the amount a "prize" is more accurate than calling them a "bet" or "pot", but it does **not** change the substance of the transaction. It is still a game of skill with an entry fee and a prize.

Paystack's published Acceptable Use Policy expressly places **"gambling, gaming and/or any other activity with an entry fee and a prize"**, including **"games of skill"**, in its restricted category unless Paystack gives prior approval and the operator and customers are exclusively in jurisdictions where the activity is lawful. Do not accept participant-funded paid entries, make cash awards, or advertise a paid contest before receiving Paystack's written approval and obtaining advice on the applicable Nigerian licensing and consumer-law position.

Source: [Paystack Terms, Acceptable Use Policy, section 2](https://paystack.com/terms) (accessed 2 September 2026). Paystack has also asked to review the product and proposed payment flow, which is the right next step.

## What is already good evidence of skill

The present system gives you unusually strong evidence that a quiz result is performance-based:

- A single fixed, shuffled question list is stored for the match; both players receive the same questions in the same order. See [the match schema](src/db/schema.ts).
- Questions, deadlines, and elapsed time are generated and enforced by the server, not submitted by the client. See [the match engine](../jamb_backend/src/services/match.ts).
- Results use a published rule: higher score wins, then lower total answer time; an exact tie is a draw. See [the scoring service](../jamb_backend/src/services/scoring.ts).
- Scores and answer keys stay sealed until both participants have completed the quiz, which reduces selective-sharing and answer-key abuse. See [the result service](../jamb_backend/src/services/match.ts).
- The product is clearly positioned as JAMB practice in [the store listing](store/listing.md) and [the existing terms](store/terms.md).

Use those facts in the demo and in the rulebook. They explain fairness, but they do not remove the need for Paystack approval for an entry-fee-and-prize model.

## The hard rule: describe truthfully; do not try to wordsmith the classification away

Avoid gambling vocabulary because it is inaccurate and makes the product sound like wagering. Do not, however, tell Paystack that the model is "not gambling" or claim that it is outside their restricted category. Their policy expressly includes games of skill with an entry fee and prize.

A good description is:

> SabiPass is an educational exam-practice platform. Its proposed paid feature is a fixed-rule, two-participant academic knowledge competition: each eligible participant pays the displayed entry fee for a specific contest, receives the same preselected questions and time limits, and the result is determined by published score and time rules. We are seeking Paystack's prior written approval and guidance on all required licences, customer checks, payment flows, and geographic restrictions.

A bad description is:

> Two users put money in a pot and the winner takes it all.

The first is accurate and professional. The second is a direct wager pattern.

## Recommended terminology

| Use                                  | Avoid                                             |
| ------------------------------------ | ------------------------------------------------- |
| head-to-head study challenge         | duel, especially in payment screens and marketing |
| academic knowledge competition       | betting game                                      |
| participant                          | bettor, punter, player when discussing money      |
| published competition rules          | house rules                                       |
| entry fee for a specific competition | stake, wager, buy-in, contribution to a pot       |
| announced prize or award             | pot, jackpot, winner-takes-all                    |
| result pending review                | payout pending, money locked                      |
| refund to original payment method    | cash out, withdraw, top up                        |
| competition result                   | settlement, when referring only to the score      |

"Duel" is not itself proof of gambling, and it is fine as an internal technical name. But public paid-flow labels should lead with learning and competition. For example, change the pre-match heading currently shown as "House rules" in [the lobby](src/app/lobby/[matchId].tsx) to "Match rules" or "Competition rules" before any paid launch.

The current labels "Quick duel" and "Share this duel" in [the home and invite UI](src/app/home.tsx) and [the invite card](src/components/InviteCard.tsx) are suitable for free play, but should not appear beside entry fees or awards. Use "Find a study challenge" and "Invite a study partner" in that context.

## Product risks that must be removed from a paid mode

### 1. Never allow a paid match against a bot

The current product can fill an unclaimed duel with a bot after 12 hours. The bot answer simulation uses `Math.random()` in [the bot service](../jamb_backend/src/services/bot.ts). A paid participant playing a bot that has a random outcome is precisely the kind of outcome that undermines a skill-only claim.

For paid competitions:

- Do not offer a bot opponent.
- Do not automatically insert a bot after an invite expires.
- If the second eligible human participant does not join by the published deadline, void the competition and refund any paid entry to its original payment method.

### 2. Do not make a no-show, app interruption, or network loss an automatic cash win by default

The current free product treats two app-leave strikes as a forfeit. That is reasonable for a free learning record. With money, a disconnection or late answer can turn into a chargeback and a fairness dispute.

Before paid launch, publish a narrow rule for each case. A conservative starting point is:

| Event                                                            | Recommended paid-competition outcome                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second participant never joins by deadline                       | Void; automatically refund each paid participant.                                                                                                                       |
| Only one payment succeeds                                        | Do not start; automatically refund the successful payment.                                                                                                              |
| Platform or question-bank failure before or during play          | Void; refund both participants.                                                                                                                                         |
| A question is invalid or its official answer is materially wrong | Void; refund both participants, or rerun only with both participants' recorded consent.                                                                                 |
| Exact draw                                                       | Refund both entry fees; do not roll funds into another contest.                                                                                                         |
| Suspected cheating                                               | Freeze the result for review; use a published, evidence-based decision path.                                                                                            |
| User abandons or is disconnected                                 | Do not convert it directly to a cash award unless Paystack and counsel approve the exact rule; initially prefer void/refund where a technical cause cannot be excluded. |

Do not roll a draw, cancellation, or disputed amount into a larger future prize. A rollover balance looks and behaves more like wagering. Do not offer stored balances, deposits, cash-outs, or transferable credits unless a licensed and Paystack-approved structure specifically permits them.

### 3. Keep score completion separate from financial settlement

Today `settled` means the score is final. It should never also mean money has been paid. Add separate money states only after the commercial model is approved. A future state model should look like this:

```text
rules_published
  -> entry_pending
  -> entries_confirmed
  -> in_progress
  -> result_pending_review
  -> approved_for_settlement
  -> award_paid

Any pre-start payment/error path -> void_refund_pending -> refunded
A valid challenge to the result -> under_review -> approved_for_settlement | void_refund_pending
```

The existing 24-hour match TTL is not the same thing as a 24-hour post-result dispute period. Keep those deadlines distinct, display them clearly, and keep an immutable audit record for each transition.

### 4. A 24-hour in-product dispute window is sensible, but it is not a payment-processor shield

Use the following sequence only after Paystack approves the underlying model:

1. Both participants finish and the server calculates the published result.
2. The app records `result_pending_review`, shows the result, and displays the exact review deadline in local time.
3. Either participant can report only defined issues: scoring error, invalid question, material technical fault, account compromise, or evidence-backed cheating.
4. The report captures structured reason, timestamps, client/device context allowed by your privacy notice, and any supporting evidence. A participant cannot freeze the award indefinitely with a generic "I disagree" report.
5. No valid report by the deadline moves the record to `approved_for_settlement`.
6. A valid report pauses any award while an authorised reviewer decides under published rules.

The 24-hour product window does not replace a cardholder's bank chargeback rights. Paystack's dispute policy says processor and card disputes can arise later, and a merchant remains responsible for refunds, chargebacks, and related liabilities. Retain payment references, consent to rules, payment receipt, match configuration, question-set identifier, server timing, answer events, integrity events, decision record, and refund/award reference for the required retention period.

## Age, identity, and geography

The current terms allow general use from age 13. That may be appropriate for free practice, but do not let a 13-year-old enter a paid competition by default. Paystack's published terms state that its services are not directed to people under 18.

Before enabling paid mode, get written guidance and implement at least:

- a separate paid-feature eligibility gate, initially age 18+;
- country/state or other location controls limited to jurisdictions confirmed as lawful and approved by Paystack;
- verified legal name, phone number, and payout identity where required;
- a match between the entrant/payout recipient and the required verification record;
- sanctions, fraud, duplicate-account, and device-risk controls appropriate to the approved model;
- a clear privacy notice that explains the additional payment, verification, anti-fraud, and result-review data.

Do not collect BVN, bank credentials, card data, or other sensitive payment data directly unless the approved provider flow and your legal advice explicitly require it. Use provider-hosted payment and verification products where available.

## Safer commercial options, in order

1. **Paid education without cash awards.** Charge for subscriptions, question packs, analytics, or premium practice access. Rankings, badges, and non-cash achievement are lowest risk, though general consumer, tax, and store-payment rules still apply.
2. **Free-entry, sponsor-funded competitions.** A sponsor announces a fixed prize and the platform does not use participant payments to fund it. This removes the entrant-funded-pot feature, but promotions rules and Paystack approval may still apply.
3. **Paid skill competition with a promoter-funded, pre-announced award.** The entry price, award, rules, eligibility, and refund policy are fixed before payment. This may be easier to explain than passing pooled participant funds to a winner, but it still falls within Paystack's stated "entry fee and prize" restriction and requires written approval plus legal advice.
4. **Entrant-funded 1v1 winner payout.** This is the highest-risk option. Do not assume a 24-hour review period, anti-cheat controls, or different vocabulary makes it permissible. Do not implement it until Paystack and a Nigerian adviser approve the exact custody, collection, refund, award, licensing, geography, tax, KYC, and customer-disclosure model in writing.

## Terms and UI requirements before any approved paid launch

The existing [Terms of Use](store/terms.md) cover free practice only. They need a separate paid-competition section drafted or reviewed by counsel, not a small wording patch. It should state the following plainly and truthfully:

- Who may enter, including paid-feature age, location, and verification requirements.
- Each specific competition's subject, number and order of questions, time limit, scoring, tie-breaker, entry price, announced award, start/join deadline, and maximum participant count before payment.
- Whether the award is paid by SabiPass or another named sponsor. Never describe participant money as being "held for" another participant unless the approved arrangement genuinely provides that custody.
- All cancellation, no-join, technical-failure, invalid-question, draw, cheating, review, refund, and award-failure rules.
- The exact review deadline and the narrow grounds and evidence required for a result complaint.
- That the processor's settlement schedule and a payment-method dispute may differ from the in-app review deadline.
- Tax reporting or withholding responsibility, if applicable.
- Customer support contact details, receipts, records, and the privacy treatment of fraud/integrity information.

Put a concise rules summary immediately before payment and require an affirmative acceptance for that specific competition. The full terms must be linked there, and the final receipt/statement descriptor must accurately identify SabiPass and the product purchased. Do not use phrases such as "risk-free", "guaranteed win", "easy cash", "win your money back", or "make money from studying".

## What to show Paystack

Send a 2-3 minute walkthrough plus a short written flow document. Be candid that paid mode is not yet live.

Show:

1. The education-first landing and free JAMB practice modes.
2. A fixed-rule head-to-head study competition, including the rules shown before any entry.
3. The same question set, sequence, timer, score formula, and tie-breaker for both participants.
4. The server-controlled timing and anti-cheat evidence available for a result review.
5. The exact void/refund outcomes for non-join, failed payment, draw, invalid question, technical fault, and cheating report.
6. The separate post-result review state. Label it "result pending review", not "money held" or "payout locked".
7. The fact that paid mode excludes bots, wallet balances, deposits, cash-outs, and unapproved cross-border participation.

Ask Paystack these direct questions:

- Can Paystack approve this as a game-of-skill activity with an entry fee and award under its Acceptable Use Policy?
- Which licences, registrations, merchant category, and locations must be in place before approval?
- Can we collect an entry price for a fixed-rule competition, and may we make awards to participants? Which Paystack product and payout structure is approved?
- May the platform retain funds during a 24-hour product review period, or must refunds/awards be handled differently?
- What customer KYC, age, geographic, transaction-limit, record-retention, tax, fraud, and dispute-evidence requirements apply?
- May minors use the free education product while being blocked from any paid competition?

## Recommended next decision

Keep all live SabiPass matches free while Paystack reviews the demo. Build the demo around the existing fairness controls, but make the proposed commercial feature a clearly labelled, non-live prototype. The prudent first monetisation route is premium educational access with no cash award. If the business requires cash prizes, use only a model Paystack approves in writing and that Nigerian counsel confirms is lawful before design, copy, or payment code creates a conflicting promise to users.
