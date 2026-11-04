/* The Podium — UI wiring. No framework, no network calls. */
(function () {
  "use strict";

  /* Scroll behavior (TY, Oct 28): every full load starts at the top,
     regardless of where the user was scrolled before refreshing. Belt
     and braces for this static app: disable browser scroll restoration
     and scroll to top on load, timed so a late restoration cannot
     override it. Deep-link loads (#post/...) are exempt — the app scrolls
     those to the linked post by design. Tab-click scrolling is untouched. */
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e) { /* older engine: the load handler below still applies */ }
  function startAtTop() {
    if (/^#post\//.test(window.location.hash || "")) return;
    window.scrollTo(0, 0);
  }
  window.addEventListener("load", function () {
    startAtTop();
    if (window.requestAnimationFrame) window.requestAnimationFrame(startAtTop);
    setTimeout(startAtTop, 0);
  });

  var state = PodiumStore.load(etNow());
  /* Committee store: load on startup; establish the key once so the empty
     roster persists (missing/corrupt payloads start empty, other data aside). */
  PodiumStore.saveCommittee(PodiumStore.loadCommittee());
  /* The Podium 1.0 ships with no citizens: ensure the single signed-in local
     user on every boot (persisted afterward like any state). No identity
     picker, no citizen list. */
  if (!state.citizens.length) { state.citizens.push({ id: "citizen", name: "Citizen", state: "" }); }
  if (!state.currentUserId || !state.citizens.some(function (c) { return c.id === state.currentUserId; })) {
    state.currentUserId = state.citizens[0].id;
    PodiumStore.save(state);
  }
  var currentView = "feed";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function excerpt(body, n) {
    if (body.length <= n) return body;
    return body.slice(0, n).replace(/\s\S*$/, "") + "\u2026";
  }
  function votesLabel(n) {
    return n + " " + (n === 1 ? T("vote.one") : T("vote.many"));
  }
  /* Frozen author state (display metadata only; empty means none shown). */
  function stateSuffix(p) {
    return p && p.authorState ? " \u00b7 " + esc(p.authorState) : "";
  }
  /* Frozen language tag, step 1 of the multilingual slice: rendered beside
     the author/state line in the existing muted meta style. "und" (and a
     missing tag) renders nothing. Guarded: without Intl, or for a code
     Intl does not know, the raw code shows. */
  var langDisplayNames = null;
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      langDisplayNames = new Intl.DisplayNames(["en"], { type: "language" });
    }
  } catch (e) { langDisplayNames = null; }
  function langName(p) {
    var code = p && typeof p.lang === "string" ? p.lang : "";
    if (!code || code === "und") return "";
    if (langDisplayNames) {
      try {
        var n = langDisplayNames.of(code);
        if (n) return n;
      } catch (e) { /* unknown code: show it raw below */ }
    }
    return code;
  }
  function langSuffix(p) {
    var n = langName(p);
    return n ? ' \u00b7 <span class="hint">' + esc(n) + "</span>" : "";
  }
  /* ---------- interface language (multilingual slice, step 3) ----------
     All user-visible chrome renders through the strings table
     (js/strings.js, exposed as PodiumStrings): en values are the verbatim
     pre-existing English; es values translate. Every es branch is gated
     on the stored language. Post bodies, names, states, refs, votes,
     numbers, and dates never pass through here.
     The test runner does not load js/strings.js, so when PodiumStrings is
     absent the helpers fall back to EN_CHROME below: a mechanical copy of
     the table en column (verified identical), English-only. No test file
     is touched for this. */
  var EN_CHROME = {
    /* document */
    "doc.title": "The Podium 1.0 \u2014 A Civic Portal",
    "skip.main": "Skip to main content",
    "gov.text": "An official website of the United States government",
    "gov.how": "Here\u2019s how you know.",
    /* header */
    "brand.sub": "The purpose of this platform is to ensure that every citizen has the opportunity to be heard by the nation.",


    "citizen.signedin": "Signed in as",






    "citizen.state.label": "State",
    "citizen.state.aria": "Your state",
    "citizen.state.title": "Optional: your stated state, stored on this device only.",
    "citizen.state.unset": "State not set",
    "lang.label": "Language",
    /* tabs */
    "tab.feed": "Live Feed",
    "tab.briefing": "The Weekly Briefing",
    "tab.prior": "Prior Posts & Answers",
    "tab.status": "Status Updates",
    "tab.watch": "Watch Live",
    "tab.post": "Submit Post",
    "tab.committee": "Committee",
    /* committee roster (structure only; draw/rotation land in Prompts 5-6) */
    "committee.aria": "Citizen committee roster",
    "committee.lede": "The committee is 12 ordinary verified citizens, chosen by random draw, serving 12-week terms, with one new citizen joining every week. The committee reviews and approves answers, follows through until the issue is resolved, and does not fund \u2014 it asks for and allocates funds.",
    "committee.empty": "No committee members yet. The first members will be drawn by random draw once verified citizens agree to serve.",
    "committee.week": "Week {n} of 12",
    "committee.terms": "Term start: {start} \u00b7 Cycles out: {out}",
    "committee.joined": "Joined this week",
    "committee.cycling": "Cycles out next week",
    "committee.draw": "Selected by random draw",
    "committee.draw.beacon": "Beacon timestamp",
    "committee.draw.value": "Beacon value",
    "committee.draw.pool": "Pool size",
    "committee.draw.pos": "Draw position",
    "committee.note": "One citizen cycles out and one new citizen joins every week, so the committee is always 12 people with a mix of experience.",
    "committee.rules.summary": "Committee rules \u2014 selection, pay, structure & schedule",
    "committee.rules.selection.heading": "How members are selected",
    "committee.rules.selection.body": "Twelve ordinary verified citizens, chosen by random draw from a national pool using the NIST Randomness Beacon \u2014 the same rig-proof method as the post draw. Selection is a summons, not a draft: if your name comes up, you agree to serve or decline and the next citizen is drawn. To serve you must be a verified citizen, 18 or older, with no post in the current cycle, not a government employee, and not currently incarcerated or on parole or probation \u2014 a past felony does not exclude you; eligibility returns 5 years after the sentence is fully complete. Terms are 12 weeks, one new citizen joins every week, and after cycling out you sit out 12 weeks. No more than 2 terms per year. No committee member can submit a post while serving on the committee, for the whole 12-week term.",
    "committee.rules.pay.heading": "Pay",
    "committee.rules.pay.body": "Members are paid $150 per day, for Friday and Saturday ($300 a week). The solo thinking days are not separately paid. Travel, hotel, and meals for the weekly in-person meeting are covered separately at government rates and booked directly \u2014 members never pay out of pocket \u2014 plus childcare support for in-person days. The pay is $150 flat, no top-up. The plan isn't for committee members to get rich off this \u2014 it's more of a public service.",
    "committee.rules.structure.heading": "Structure",
    "committee.rules.structure.body": "Twelve members, each holding an equal share of the decision-making power. Government agency liaisons advise only and do not vote. Each week the committee receives the selected posts and the AI-drafted answers and votes on whether to follow the AI suggestions. A split vote means no action on that post this week and the post reverts to shine light \u2014 it is still read aloud and tracked, never buried. The narrator and the committee spokesperson are permanent salaried roles who present only: the narrator reads posts word-for-word and the spokesperson presents the committee's approved answers. Neither has any authority over posts or answers. If either quits or is fired, the committee hires a replacement \u2014 hired by the committee, fired by the committee by vote, against public criteria.",
    "committee.rules.schedule.heading": "Weekly schedule",
    "committee.rules.schedule.body": "Members receive the selected posts as soon as they are selected and have 3 days on their own to think about them. They all meet in person on Friday to deliberate and vote, and on Saturday to send the agency requests and set tracking in motion. The agency's response arrives Wednesday morning by video call, and the narrator and the committee spokesperson make the script and record live at 1:00 PM ET. Travel and lodging for every member every week are covered at government rates and booked directly.",
    "committee.rules.startup.heading": "Starting the program: the first committee",
    "committee.rules.startup.p1": "The program starts with 12 new citizens selected at once, by the same NIST draw and summons as every later selection.",
    "committee.rules.startup.p2": "To reach the steady rotation \u2014 one member joining and one leaving each Monday \u2014 the first 12 serve staggered starting terms. Each member is assigned an exit week, 1 through 12, by a single NIST random draw at the first meeting. The member assigned week 1 cycles out after one week of service; the member assigned week 2 cycles out after two weeks; and so on until the member assigned week 12, who serves the full twelve weeks.",
    "committee.rules.startup.p3": "Each Monday, the member cycling out is replaced by a new member drawn the same way, so the committee always has 12 serving members. After the twelfth week, every seat is on a normal 12-week term and the steady rotation is in place.",
    "committee.rules.startup.p4": "A full 12-week term pays $300 a week \u2014 $3,600. The member who cycles out first serves one week and is paid $300: the biggest financial loss of the starting group, $3,300 less than a full term. Each later exit loses less; the member who serves all twelve weeks loses nothing.",
    "committee.rules.startup.p5": "This is not a penalty. The staggered exit is what makes the rotation possible: without it, all 12 would leave at once after twelve weeks and the committee would lose all of its experience in a single week. With it, eleven experienced members always remain to carry the work and teach the newcomer. The first members out are the ones who make the program work \u2014 their short first terms are a crucial part of starting it, not a punishment for anything they did.",
    "committee.rules.startup.p6": "A short starting term still counts as a term for the sit-out rule: after cycling out, a member sits out twelve weeks before being eligible again.",
    "switch.face.label": "View as",
    "switch.face.civilian": "Civilian (public view)",
    "switch.face.committee": "Committee demo character",
    "switch.face.demo": "demo",
    "term.heading": "Your committee term",
    "term.week": "Term week {n} of 12",
    "term.exit": "Exit week {n}",
    "term.pay": "Pay $300/week \u2014 $3,600 for a full term",
    /* answer approver (answerer of record) */
    "approver.prefix": "Reviewed and approved by",
    "approver.suffix": "civilian committee member, Week {week} of 12",
    "approver.none": "No committee member is serving yet.",
    "approver.notserving": "Only a serving committee member can approve answers.",
    "tab.watchlive.badge": "LIVE",
    "tab.watchlive.airing": "Watch Live, briefing on air now",
    "nav.primary": "Primary",
    /* verbatim rule card */
    "rule.heading": "The Verbatim Rule",
    "rule.reminder": "Reminder of the rule",
    "rule.p1": "By the rules of this portal, the highest-voted post <strong>MUST</strong> be read aloud \u2014 word for word, exactly as its author wrote it \u2014 and discussed, by a representative of the United States, in front of the entire country. Another post, drawn at random, must be read and discussed the same way.",
    "rule.p2": "AI will be used to detect profanity and errors, correct grammar, and suggest clearer formatting. It will never steer you: your topic, your position, or your meaning. And once your post is published, it is final.",
    "rule.p3": "Keep in mind that your post may be read in front of the entire nation. Write in your most professional manner. Profanity, slang, and ridicule will not post. State your idea or concern plainly and professionally. You are not posting a comment. You are addressing the nation \u2014 speaking to and for every American. Give it the seriousness it deserves.",
    "rule.p4": "Even if the committee cannot resolve an issue, it has at least brought light to the concern. That is the bare essential of this platform: to shine a light on concerns and ideas, and to try to resolve them or implement helpful changes.",
    "rule.readfull": "Read the full rule",
    /* fine print */
    "fine.summary": "Fine print (official register)",
    "fine.lede": "All submissions are subject to automated pre-publication review. Submissions containing profanity, slurs, or personal attacks shall not be published. Submissions containing slang or errors materially affecting comprehensibility shall be held pending correction by the submitting party, with suggested revisions provided for consideration; no submission shall be altered by the System without the submitting party\u2019s express action. Weekly selections shall consist of (i) the submission receiving the highest number of votes during the applicable period and (ii) one (1) submission selected by random drawing from among all eligible published submissions. Selected submissions shall be read aloud in their entirety, verbatim, and discussed in the weekly briefing. A published submission is final and shall not be edited or redacted.",
    "fine.statements": "Statements of policy, principles, and fundamentals",
    "fine.purpose": "The purpose of this platform is to ensure that every citizen has the opportunity to be heard by the nation. Citizens will address the nation and speak on its behalf.",
    "fine.li1": "The highest-voted post and one randomly drawn post are read aloud word-for-word, in full, by a U.S. representative and discussed in the weekly briefing. No editor stands between author and nation. Nothing is edited after posting.",
    "fine.li2": "AI detects problems and suggests wording before publication only. It never steers a post's topic, position, or meaning, and never changes, substitutes, or declines a post on its own.",
    "fine.li3": "Profanity, slurs, and personal attacks are hard-blocked and never publish. Slang, misspellings, grammar, and unclear text are held with suggested rewording; the author accepts or retypes, and AI never silently changes text. Held drafts are not published, do not enter the draw, and do not use the citizen's one-post slot.",
    "fine.li4": "Once published, a post is final. It cannot be deleted, withdrawn, archived, or hidden.",
    "fine.li5": "Voting is upvote-only. One vote per citizen per weekly cycle, switchable until voting closes Sunday at 11:59 PM ET.",
    "fine.li6": "One post per citizen per weekly cycle.",
    "fine.li7": "Posts are capped at 630 words.",
    "fine.li8": "The random draw is rig-proof: the eligible pool is frozen in a fixed published order at the cutoff, and the position is the NIST Randomness Beacon value mod pool size, plus one. The draw is internal only, with no button, replay, or re-roll.",
    "fine.li9": "The committee prepares answers only. It never alters, substitutes, delays, or declines a selection. It reviews selections a week ahead and routes each answer to the correct branch and level.",
    "fine.li10": "The committee does not fund. It asks for funds and allocates funds.",
    "fine.li11": "Committee answers begin as AI drafts that the committee votes on as written \u2014 never edited \u2014 and approves as the committee, the answerer of record; no individual member is named. AI never delivers a final answer alone and never touches a citizen post. The drafts are public: the public sees the drafts and the vote, not only approved answers.",
    "fine.li12": "An exact-duplicate post in the same cycle does not create a new post; the citizen is offered an upvote on the existing post, with no post-anyway exit. The draw pool excludes the winner and any post exactly matching the winner. Similar-but-distinct posts are advisory only.",
    "fine.li13": "The Live Feed shows the current cycle only. Past-cycle posts that were never selected are deleted; selected posts are kept as the briefing record.",
    "fine.li14": "Posting and voting run Monday 12:00 AM to Sunday 11:59 PM ET. The pool freezes at the Sunday cutoff, the draw is Monday at 12:00 PM ET, the committee has the week plus a Monday-Tuesday buffer, and the briefing airs Wednesdays at 1:00 PM ET as the fixed opening segment.",
    "fine.li15": "This Week shows only the most recently aired briefing. Next Week shows the next briefing's selections. A briefing's replay publishes when that briefing airs. Prior Posts & Answers and Status Updates list aired selections only.",
    "fine.li16": "Sign-in here is a placeholder: this starter runs as a single local profile with no identity verification. Real identity verification is required before production use.",
    "fine.li17": "Language: a citizen may post in any language. The original post is the official record and is read aloud verbatim in the author's language. Translations are machine aids for readers and never replace the original.",
    /* feed */
    "feed.aria": "Feed of citizen posts",
    "feed.order": "Feed order",
    "feed.order.aria": "Feed order",

    "feed.recent": "Recent",
    "feed.top": "Top Voted",
    "feed.needs": "Needs Votes",
    "feed.discover": "Discover",
    "feed.topic": "Topic",
    "feed.alltopics": "All topics",
    "feed.topicfilter.aria": "Filter by topic",
    "feed.search": "Keyword search",
    "feed.search.ph": "e.g. bridges, school lunches",
    "feed.perpage": "Per page",
    "feed.voterule": "One vote per citizen per week. You can change it until voting closes Sunday at 11:59 PM ET.",
    "feed.prev": "\u2190 Prev",
    "feed.next": "Next \u2192",
    "feed.page": "Page",
    "feed.page.of": "of",
    "feed.opened.open": "You opened a shared post. Sign in to upvote it. ",
    "feed.opened.past": "You opened a shared post from a past week. Voting is closed on past weeks\u2019 posts. ",
    "feed.showfull": "Show full feed",
    "feed.gone": "This post is no longer available. Posts that are not selected for a weekly briefing are removed when their cycle closes. ",
    "feed.gone.li": "This post is no longer available. Posts that are not selected for a weekly briefing are removed when their cycle closes.",
    "feed.nocode": "No item with code {code}.",
    "feed.nocode.li": "No post, answer, or update carries that code.",
    "feed.code.thread": "Code {code}: jumping to that item in the thread.",
    "feed.code.record": "Code {code}: post plus its answer and updates.",
    "feed.note.top": "Highest-voted first. This week\u2019s leader becomes the top-voted briefing pick.",
    "feed.note.needs": "Least-voted first, so unseen posts surface. These are this week\u2019s posts \u2014 voting is open on all of them.",
    "feed.note.discover": "Shuffled for discovery \u2014 re-pick Discover for a fresh shuffle. These are this week\u2019s posts \u2014 voting is open on all of them.",
    "feed.note.results.one": "1 result(s).",
    "feed.note.results.many": "{n} result(s).",
    "feed.note.recent": "Newest first. These are this week\u2019s posts \u2014 voting is open on all of them.",
    "feed.note.filtered": " Filtered to topic \u201c{topic}\u201d ({n}).",
    "feed.empty": "No posts here yet.",
    "briefing.empty": "No briefing has aired yet.",
    "draw.pending": "No draw has run yet \u2014 no posts, no pool, no winner.",
    "prior.empty": "No prior briefings yet.",
    "status.empty": "No updates yet.",
    "feed.fullrecord": "See full record",
    "feed.fullrecord.ref": "Full record: {ref}",
    /* votes */
    "vote.up": "\u25b3 Upvote",
    "vote.upvoted": "\u25b2 Upvoted",
    "vote.one": "vote",
    "vote.many": "votes",
    "vote.yours": " \u00b7 Your vote",
    "vote.closed": " \u00b7 voting closed",
    "vote.upvoteit": "Upvote it instead",
    "vote.upvoted.check": "Upvoted \u2713",
    "vote.closedweek": "Voting closed (past week)",
    "share.button": "Share",
    "share.copied": "Link copied \u2713",
    "share.failed": "Copy failed",
    "cycle.voting": "voting now",
    "date.now": "just now",
    /* badges + selection words */
    "badge.top": "Top-voted",
    "badge.random": "Random pick",
    "selbadge.top": "TOP-VOTED",
    "selbadge.random": "RANDOM DRAW",
    "selbadge.position": "position",
    "selbadge.of": "of",
    "lib.top": "Top-voted",
    "lib.random": "Random draw",
    "thread.top": "top-voted",
    "thread.random": "random draw",
    "seltitle.top": "Top-voted selection",
    "seltitle.random": "Random-draw selection",
    "pipe.top": "top-voted",
    "pipe.random": "random pick",
    "pipe.none": "not yet selected",
    "stage.selected": "Selected",
    "stage.committee": "In Committee Review",
    "stage.briefed": "Briefed",
    "stage.aria": "Pipeline stage: {stage}",
    "stage.inline.selected": "selected",
    "stage.inline.committee": "in committee",
    "stage.inline.briefed": "briefed",
    /* thread */
    "thread.answer": "Official Answer",
    "thread.update": "Update",
    "thread.thispost": "this post",
    "translate.button": "Translate",
    "translate.label": "Machine translation to English \u2014 the original above is the official record.",
    "translate.unavailable": "Translation unavailable right now.",
    /* composer */
    "post.aria": "Post composer",
    "post.rule.applies": "The Verbatim Rule applies.",
    "post.rule.text": "Your post may be read aloud, word for word, in front of the entire nation. Profanity, slang, and ridicule will not post. Once published, it is final.",
    "post.rule.reminder": "Your post may be read aloud, word for word, in front of the entire nation. Profanity, slang, and ridicule will not post. Once published, it is final.",

    "notice.published.a": "<strong>One post per citizen per weekly cycle.</strong> You already published this week (",
    "notice.published.b": "). You can still vote on this week\u2019s posts.",
    "post.topic": "Topic",
    "post.topic.hint": "Pick a topic, or accept the single AI suggestion at review.",
    "post.timer.hint": "read-aloud time \u00b7 max 630 words",
    "post.address": "Your address to the nation",
    "post.text.ph": "State your idea or concern plainly and professionally\u2026",
    "ai.live": "AI: live (Muse Spark)",
    "ai.stub": "AI: local fallback",
    "gate.overlimit": "Too long for the national reading: {n} of 630 words maximum. Shorten your post to fit the 4:30 read-aloud slot.",
    "gate.hard": "<strong>Cannot publish:</strong> this draft contains {spans}, which counts as profanity, a slur, or a personal attack. Such posts are never published. Remove it and keep your address professional.",
    "gate.soft": "<strong>Held for your correction:</strong> {n} wording issue(s) would embarrass you before a national audience. Accept a suggestion or retype the word yourself \u2014 nothing changes without your action.",
    "chip.use": "Use \u201c{sug}\u201d",
    "chip.remove": "Remove it",
    "chip.aria.replace": "Replace {w} with {s}",
    "chip.aria.remove": "Replace {w} by removing it",
    "gate.punct": "Punctuation and spacing need a touch-up \u2014 one click fixes double spaces, spaces before punctuation, and the final period. ",
    "gate.punct.fix": "Fix punctuation and spacing",
    "gate.unclear": "<strong>Held so you can be heard clearly:</strong> this draft is hard to understand as written, so it cannot publish yet. This is not a refusal \u2014 your post is not declined. Use the help below, or fix the draft yourself; you can return and publish at any time.",
    "gate.ok": "Wording check passed. Your topic, position, and meaning are yours alone \u2014 the check never touches them.",
    "reason.live": "Live wording check.",
    "offer.built": "Built only from your answers:",
    "offer.proposed": "Proposed version \u2014 same meaning, clearer words:",
    "offer.until": " Nothing publishes until you click \u201cUse this version.\u201d",
    "offer.yours": "Your words:",
    "offer.version": "Proposed version:",
    "offer.use": "Use this version",
    "offer.keep": "Keep my words",
    "offer.hear": "Hear the proposed version",
    "offer.novoice": "Your browser cannot read aloud; please read the proposed version above before approving.",
    "prompts.title": "Help us understand \u2014 answer in your own words:",
    "prompts.nooffer": " no rewrite is offered because no clear position could be found in the draft. Nothing is invented: a draft is built only from your answers, and only with your approval.",
    "prompts.what": "What happened?",
    "prompts.want": "What do you want fixed or changed?",
    "prompts.who": "Who should fix it?",
    "prompts.build": "Build my draft from these answers",
    "prompts.needone": "Answer at least one question above, in your own words.",
    "prompts.badwords": "These answers cannot be used as written: they contain wording that can never publish. Change the flagged words and try again.",
    "hear.draft": "Hear this draft",
    "hear.novoice": "Your browser cannot read text aloud.",
    "preview.hear": "Hear it as the nation will",
    "preview.publish": "Publish (final)",
    "preview.back": "Back to editing",
    "preview.title": "Weekly briefing \u2014 verbatim reading",
    "preview.words": "words",
    "preview.readaloud": "read aloud",
    "preview.suggest.a": "AI topic suggestion, shown once at review \u2014 yours to accept or ignore: <strong>",
    "preview.suggest.b": "</strong> ",
    "preview.usetopic": "Use this topic",
    "publish.note": "Publishing is final: posts cannot be edited or redacted. The AI checks wording only \u2014 never your topic, position, or meaning.",
    "publish.done": "Published \u2014 final. Your post cannot be edited or redacted. It now stands for this week\u2019s vote.",
    "voiced.title": "Already voiced",
    "voiced.dismiss": "\u00d7 Dismiss",
    "voiced.dismiss.aria": "Dismiss this suggestion",
    "voiced.reminder": "A conflicting post may divide votes and reduce the likelihood of your concern being heard.",
    "voiced.instead": "Vote for theirs instead",
    "voiced.both": "Post mine and vote theirs too",
    "voiced.asis": "Post mine as-is",
    "copy.exists": "This post already exists in this cycle \u2014 upvote it to add your voice.",
    "copy.existing": "<strong>Existing post:</strong> \u201c{quote}\u201d",
    /* citizen modal */





    /* briefing */
    "briefing.aria": "Weekly briefing",
    "briefing.title": "This week\u2019s briefing \u2014 {date}",
    "briefing.lede1": "Two posts take the majority of the segment: the highest-voted post and one post drawn at random. Both are read aloud verbatim and answered. Follow-ups on earlier posts get only a brief live mention; the full record lives under Prior Posts & Answers and Status Updates.",
    "briefing.lede2": "The locked weekly schedule (all times ET): posting and voting week Monday 00:00 \u2192 Sunday 23:59; cutoff Sunday 23:59, when the eligible pool is frozen and published; draw Monday 12:00, pre-announced; committee week Monday \u2192 Sunday to evaluate both selected posts and formulate both answers \u2014 answers ONLY, it can never alter, substitute, delay, or decline a selection; briefing Wednesday 1:00 PM. The Podium segment is the fixed opening segment of the Wednesday briefing: if no regular briefing is scheduled that Wednesday, the segment still runs standalone at the same time, same room, same cameras.",
    "briefing.watch": "Watch Live \u2192",
    "briefing.watch.hint": "Attend the airing of this briefing.",
    "briefing.next": "Next Week",
    "briefing.next.hint": "Selected posts in committee review. Answers are still being formulated \u2014 never presented as final. These selections are published after the Monday draw, once the draw has selected the posts: the full posts for the next briefing appear here from the draw onward, in full, with answers coming on the briefing date.",
    "briefing.draw": "The random draw \u2014 verifiably fair",
    "briefing.draw.lede": "The eligible pool is frozen and published <em>first</em> (all gate-passed posts since the last draw, minus the top-voted winner). The system runs the draw at the pre-announced time: <code>position = beacon value mod pool size + 1</code>. Random selection conducted using the NIST Randomness Beacon.",
    "briefing.draw.excluded": "Excluded from the pool",
    "briefing.draw.readonly": "Read-only record: pool size, beacon timestamp and value, computed position, and the drawn post. The draw is an internal system function \u2014 nothing here re-runs it.",
    "briefing.draw.worked": "Worked example",
    "briefing.draw.worked.body": "Pool of 12, beacon value ending \u20264839 \u2192 4839 mod 12 = 3 \u2192 +1 = <strong>post #4</strong>.",
    "briefing.draw.committee": "Committee rule: the committee prepares answers ONLY. It can never alter, substitute, delay, or decline a selected post. It has one week to formulate an answer and route the topic to the right branch or level of government.",
    "draw.cycle": "Cycle",
    "draw.frozen": "Pool frozen",
    "draw.frozen.val": "{cutoff} \u2014 {n} eligible posts (winner and winner-matching copies excluded), published before the draw",
    "draw.beacon": "Beacon pulse",
    "draw.beacon.val": "{time} \u2014 value {hex} (numeric excerpt {num})",
    "draw.computation": "Computation",
    "draw.computation.val": "{num} mod {size} = {r} \u2192 +1 = post #{pos}",
    "draw.selected": "Selected",
    "draw.winner": "already has the briefing\u2019s top slot",
    "draw.dupe": "anti-flood deduplication (content matches the winner\u2019s)",
    "draw.readfull": "Read full post",
    "draw.collapse": "Collapse",
    "zone.post.excerpt": "Citizen Post \u2014 excerpt, verbatim",
    "zone.post.full": "Citizen Post \u2014 in full, verbatim",
    "zone.post.read": "Read verbatim in full",
    "zone.answer.excerpt": "Official Answer \u2014 excerpt",
    "zone.answer.full": "Official Answer \u2014 in full",
    "zone.answer.read": "Read answer in full",
    "zone.summary": "Show summary",
    "zone.post.screening": "Citizen Post \u2014 verbatim",
    "zone.answer.screening": "Committee Answer \u2014 verbatim",
    "zone.post.next": "Citizen Post \u2014 verbatim in full",
    "zone.post.final": "Citizen Post \u2014 verbatim, final",
    "next.selectedfor": "\u2014 {name} \u00b7 selected for next week\u2019s briefing",
    "next.answercoming": "Answer coming {date}. The committee is still formulating it.",
    "wonder.draft": "Draft answer with Wonder",


    "wonder.pending": "AI-drafted by Muse Wonder \u2014 pending committee review",



    "wonder.approve": "Approve draft",
    "wonder.decline": "Decline draft",
    "wonder.declined.note": "Declined by the committee. This post reverts to shine light: it will still be read aloud at the briefing and tracked, never buried.",
    "wonder.drafting": "Drafting with Muse Wonder ({model})...",
    "wonder.unavailable": "Muse Wonder is unavailable (no session key, or the call failed) \u2014 no draft available. Answers are never drafted by Spark.",
    "wonder.approved": "Approved by committee",
    "wonder.nocites": "This draft carries no citations and no \u201cNo commitments in this answer\u201d declaration, so it cannot be approved.",
    "wonder.request.label": "Agency request (send Saturday)",
    "wonder.request.copy": "Copy request",
    "wonder.request.copied": "Request copied \u2713",
    "wonder.request.body": "To {agency}: {ask} (Re: post {ref}).",
    "wonder.notapproval": "An AI suggestion is not a government approval.",
    "cite.legend": "Citations",
    "help.title": "Committee help",
    "help.placeholder": "Describe what is broken or what you need help with.",
    "help.category.label": "What kind of problem is this?",
    "help.cat.broken": "Something doesn't load or work",
    "help.cat.data": "Wrong information shown",
    "help.cat.howto": "I don't know how to do something",
    "help.cat.other": "Something else",
    "help.submit": "Ask Wonder for help",
    "help.response.label": "Wonder's help",
    "help.tracked": "Recorded as a system issue \u2014 the committee can track it on Status Updates.",
    "help.answered": "Answered here \u2014 no further action needed.",
    "help.issues": "System issues",
    "help.unavailable": "Wonder is unavailable (no session key, or the call failed) \u2014 no help available.",
    "audit.ev.authorityGranted": "Authority granted",
    "audit.ev.authorityRevoked": "Authority revoked (term ended)",
    "cite.commitment": "Commitment",
    "cite.source": "Source",
    "cite.remove": "Remove",
    "cite.nocommit": "No commitments in this answer",

    "cite.commitment.ph": "Short quote of the commitment\u2026",
    "cite.source.ph": "Agency or authority\u2026",
    "cite.date": "Date",
    "cite.date.ph": "Date (e.g. Oct 28, 2026)",
    /* prior + status */
    "prior.aria": "Prior posts and answers archive",
    "prior.lede": "The archive of past briefing selections: each item shows the original post, verbatim, plus the committee\u2019s answer. Check anytime \u2014 this is not part of the live show.",
    "thread.selected": "Selected post",
    "prior.updatelatest": "Most recent update",
    "prior.status": "Status:",
    "prior.tostatus": "Status updates for {ref} \u2192",
    "status.aria": "Status updates follow-through record",
    "status.lede": "The follow-through record: each item shows the dated progress updates plus the current status. Check anytime \u2014 this is not part of the live show.",
    "status.dated": "Dated progress updates",
    "status.toprior": "\u2190 Post and answer for {ref}",
    /* watch */
    "watch.aria": "Watch live broadcast",
    "watch.lede": "Attend the weekly briefing broadcast. The Weekly Briefing tab holds the record of what was and will be discussed; this tab is the airing itself.",

    "watch.auto": "Auto (clock)",
    "watch.upcoming": "Upcoming",
    "watch.live": "Live",
    "watch.replay": "Replay",
    "watch.live.title": "Live \u2014 This Week\u2019s Briefing",
    "watch.replay.title": "Replay \u2014 {cycle}",
    "watch.live.badge": "LIVE",
    "watch.replay.badge": "REPLAY",









    "watch.onair": "The briefing is on air now",
    "watch.next": "Next briefing: {label}, 1:00 PM ET",
    "watch.noagenda": "Agenda to be announced after the next draw.",
    "watch.noselect": "Selections for this briefing have not been drawn yet.",
    "watch.draw": "Draw: {date}.",
    "watch.onbill": "On the air bill ({cycle} selections):",
    "watch.hint": "For a live stream or a pre-recorded screening, whichever is next. If you are on this tab when the briefing airs, the stream starts automatically.",
    "watch.screening": "Screening",
    "watch.nowreading": "Now reading ({i} of {n})",
    "watch.noitems": "Agenda to be announced.",
    "watch.library": "Pre-recorded screenings",
    "watch.library.empty": "No past briefings yet.",
    "watch.standby": "No live briefing at this time.",
    "watch.library.aired": "aired",

    "watch.play.screening": "Play this screening",
    "watch.processing": "Replay processing, available soon",
    "watch.processing.full": "Replay processing, available soon \u2014 {cycle} aired {date}.",
    "watch.stop": "Stop replay",
    "watch.back": "\u2190 Briefing record",

    /* footer */
    "footer.about": "About",
    "footer.process": "The Process",
    "footer.process.chain": "Live Feed \u2192 The Weekly Briefing \u2192 Prior Posts & Answers \u2192 Status Updates \u2192 Watch Live \u2192 Submit Post",
    "footer.notices": "Notices",
    "footer.starternotice": "<strong>Starter notice:</strong> sign-in is a placeholder; no real personal data is collected, requested, or stored. AI checks run locally until a Model API key is provided for the session. This starter ships with no users, posts, answers, or updates.",
    "footer.key": "Model API key",
    "footer.key.hint": "(session only \u2014 kept in sessionStorage, cleared when the tab closes; never committed)",
    "footer.key.ph": "Paste key for this session",
    "footer.key.save": "Save key",
    "footer.key.clear": "Clear",
    "preview.close": "Back to editing",
  };
  var PS_NONE = { LANG_KEY: "podium1.v1.lang",
    t: function (id) { return EN_CHROME[id] || id; },
    tf: function (id, map) { var s = EN_CHROME[id] || id; if (map) Object.keys(map).forEach(function (k) { s = s.split("{" + k + "}").join(String(map[k])); }); return s; },
    tes: function (s) { return s; }, topicEs: function (s) { return s; }, statusEs: function (s) { return s; },
    get: function () { return "en"; }, set: function () { /* English only */ }, sync: function () { return "en"; } };
  function PS() { return (typeof PodiumStrings !== "undefined") ? PodiumStrings : PS_NONE; }
  function T(id) { return PS().t(id); }
  function Tf(id, map) { return PS().tf(id, map); }
  function Tes(s) { return PS().tes(s); }
  function Ttopic(s) { return PS().topicEs(s); }
  function Tstatus(s) { return PS().statusEs(s); }
  function uiLang() { return PS().get(); }
  /* Display dates: store values pass through untouched; only the computed
     "just now" label translates. */
  function dateShown(p) {
    var d = PodiumStore.displayDateFor(p, etNow());
    return d === "just now" ? T("date.now") : d;
  }
  /* Read-aloud timer: local deterministic format, translated by fixed
     replacement in es mode; en passes through byte-identical. */
  function timerShown(text) {
    var s = PodiumAI.formatTimer(text);
    if (uiLang() !== "es") return s;
    return s.replace("read-aloud time", "tiempo de lectura").replace(" of ", " de ");
  }
  /* Lowercase inline pipeline stage for meta lines. */
  function inlineStage(shown) {
    if (shown === "committee") return T("stage.inline.committee");
    if (shown === "selected") return T("stage.inline.selected");
    return T("stage.inline.briefed");
  }
  /* Inline stage for the Already-voiced line, where English shows the bare
     pipeline word ("top-voted, committee"). */
  function pipeStage(shown) {
    if (uiLang() !== "es") return shown;
    return T("stage.inline." + shown);
  }

  /* ---------- tabs ---------- */
  /* Active-tab persistence (TY, Oct 28): the current view id is written to
     sessionStorage on every view change, so a reload restores the same tab
     (a fresh tab has empty sessionStorage and boots to Live Feed as
     before). Deep links win over the saved tab; see init. */
  var TAB_KEY = "podium1.v1.tab";
  var VALID_VIEWS = { feed: 1, post: 1, briefing: 1, watch: 1, prior: 1, status: 1, committee: 1 };
  function saveView(name) {
    try { window.sessionStorage.setItem(TAB_KEY, name); } catch (e) { /* session-only */ }
  }
  function savedView() {
    try {
      var v = window.sessionStorage.getItem(TAB_KEY);
      return (v && VALID_VIEWS[v]) ? v : null;
    } catch (e) { return null; }
  }
  var tabs = document.querySelectorAll(".main-nav .tab");
  function showView(name) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-view") === name;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    currentView = name;
    saveView(name);
    ["feed", "post", "briefing", "watch", "prior", "status", "committee"].forEach(function (v) {
      $("view-" + v).hidden = (v !== name);
    });
    if (name === "feed") renderFeed();
    if (name === "briefing") renderBriefing();
    if (name === "prior") renderPrior();
    if (name === "status") renderStatus();
    if (name === "committee") renderCommittee();
    if (name === "watch") { renderWatch(); } else { stopWatchPlayback(); }
    if (name === "post") renderComposerGate();
    window.scrollTo(0, 0);
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { showView(t.getAttribute("data-view")); });
  });
  $("readFullRule").addEventListener("click", function (e) {
    e.preventDefault();
    window.scrollTo(0, 0);
  });

  /* ---------- citizen ---------- */
  function currentUser() {
    return state.currentUserId ? PodiumStore.citizenById(state, state.currentUserId) : null;
  }
  /* The Podium 1.0 runs as a single signed-in local user: always signed in,
     no switcher. State stays a plain optional profile field. */
  function renderCitizen() {
    var chip = $("citizenChip");
    var me = currentUser() || { name: "Citizen", state: "" };
    chip.innerHTML = esc(T("citizen.signedin")) + " <strong>" + esc(me.name) + "</strong>" +
      (me.state ? " \u00b7 " + esc(me.state) : "");
    $("citizenStateWrap").hidden = false;
    $("citizenStateSel").value = me.state || "";
  }
  /* GOVERNMENT-MODEL BACKEND HOOKS (TY, Nov 3 - structure only, nothing
     below is implemented; the starter stays a static site with no backend):
     - Identity proofing (IAL2, NIST SP 800-63): hook a Login.gov / ID.me
       integration where the real sign-up collects identity - photo ID + SSN +
       selfie/facial match, or in-person at a Post Office. This starter never
       collects SSNs (sign-in here is a single local profile placeholder).
     - Sign-in (AAL2): hook FIDO2/passkey + security-key (WebAuthn) and
       authenticator-app MFA where the real sign-in verifies the session;
       SMS text-back is NIST-"restricted" - fallback only, with a warning.
     - SSN field-level encryption: hook envelope encryption (KMS/HSM data
       keys) at any point that would persist an SSN - no such point exists
       in this starter (SSN fields are disabled and unwired by design).
     - Hosting: FedRAMP-authorized cloud behind WAF + DDoS protection;
       hook at deploy/infra, not in this client code.
     - Backups: encrypted off-site replicas hook at PodiumStore.save
       (see the save() hook note in js/store.js) - WORM retention.
     - Domain: .gov domain + DNSSEC + HSTS preload; hook at hosting/DNS.
     - Crypto: FIPS 140-3 validated module replaces the local SHA-256
       primitive (see the js/store.js hook); TLS 1.2 minimum / 1.3
       preferred for all transports (same endpoint helper, footer key).
     - Email: SPF/DKIM/DMARC p=reject + MTA-STS for any product mail
       (verification codes ride SMS in the real product, email stays
       transactional) - hook at the mail sender, none exists here.
     - Monitoring: FISMA continuous monitoring (audit logging, vuln
       scanning, incident response) - the client-side hash-chained audit
       log in this starter is the visible model, not the compliance control. */
  /* ---------- modal focus management ---------- */
  var modalReturnFocus = null;
  function modalFocusables(box) {
    return Array.prototype.slice.call(box.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"))
      .filter(function (el) { return el.offsetParent !== null; });
  }
  function openModal(box) {
    modalReturnFocus = document.activeElement;
    box.hidden = false;
    var f = modalFocusables(box);
    if (f.length) f[0].focus();
  }
  function closeModal(box) {
    box.hidden = true;
    if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
    modalReturnFocus = null;
  }



  /* ---------- feed ---------- */
  /* Feed scale (TY, Oct 28, part 1 of 2): DISPLAY-ONLY pagination and sorts.
     Pagination/sorts/filters never change which posts exist, which post is
     top-voted, or which posts are in a cycle's draw pool. The ordered list
     is snapshotted (frozen): page turns use the frozen id list, votes
     update counts in place without re-sorting, and re-sorting happens only
     when the user changes sort, topic, search, or page size. */
  var subtabs = document.querySelectorAll(".subtab");
  var FEED_SORTS = { recent: 1, top: 1, needs: 1, discover: 1 };
  var FEED_PAGE_SIZES = [10, 20, 50];
  var FEED_STATE_KEY = "podium1.v1.feed";
  var feedSort = "recent";   /* recent | top | needs | discover */
  var feedTopic = "";        /* "" = all topics */
  var feedPageSize = 20;
  var feedPage = 1;
  var feedList = null;       /* frozen array of post ids in display order */
  var feedListKey = "";      /* sort|topic|query|size the frozen list was built for */
  var feedFreeze = false;    /* storage-event path: prune only, never add posts */
  function feedQuery() { return $("searchInput").value.trim(); }
  function isCodeSearch() {
    return /^([A-Z])-(\d+)(?:-(A|U\d+))?$/i.test(feedQuery());
  }
  function feedKey() {
    return feedSort + "|" + feedTopic + "|" + feedQuery().toLowerCase() + "|" + feedPageSize;
  }
  function saveFeedState() {
    try {
      window.sessionStorage.setItem(FEED_STATE_KEY,
        JSON.stringify({ sort: feedSort, topic: feedTopic, page: feedPage }));
    } catch (e) { /* session-only */ }
  }
  function restoreFeedState() {
    try {
      var s = JSON.parse(window.sessionStorage.getItem(FEED_STATE_KEY) || "null");
      if (!s) return;
      if (FEED_SORTS[s.sort]) feedSort = s.sort;
      if (typeof s.topic === "string" && state.topics.indexOf(s.topic) !== -1) feedTopic = s.topic;
      var p = parseInt(s.page, 10);
      feedPage = (p >= 1) ? p : 1;
    } catch (e) { /* fresh or corrupt session: defaults stand */ }
  }
  function setFeedSort(mode, forceRebuild) {
    if (linkedPostId || linkMissing) { linkedPostId = null; linkedSuffix = null; linkMissing = false; }
    feedSort = mode;
    feedPage = 1;
    if (forceRebuild) feedList = null; /* explicit sort pick always rebuilds (Discover reshuffles) */
    saveFeedState();
    renderFeed();
  }
  function setFeedTopic(t) {
    if (linkedPostId || linkMissing) { linkedPostId = null; linkedSuffix = null; linkMissing = false; }
    feedTopic = t || "";
    feedPage = 1;
    saveFeedState();
    renderFeed();
  }
  subtabs.forEach(function (t, i) {
    t.addEventListener("click", function () { setFeedSort(t.getAttribute("data-feed"), true); });
    t.tabIndex = t.classList.contains("is-active") ? 0 : -1;
    t.addEventListener("keydown", function (e) {
      var j = null;
      if (e.key === "ArrowRight") j = (i + 1) % subtabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + subtabs.length) % subtabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = subtabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      setFeedSort(subtabs[j].getAttribute("data-feed"), true);
      subtabs[j].focus();
    });
  });
  function fillTopics(sel, withAll) {
    sel.innerHTML = "";
    if (withAll) {
      var o = document.createElement("option");
      o.value = ""; o.textContent = T("feed.alltopics");
      sel.appendChild(o);
    }
    state.topics.forEach(function (t) {
      var op = document.createElement("option");
      op.value = t; op.textContent = Ttopic(t);
      sel.appendChild(op);
    });
  }
  fillTopics($("topicFilter"), true);
  fillTopics($("composerTopic"), false);
  $("composerTopic").addEventListener("change", saveDraft);
  /* Citizen state: the stated state for the signed-in local user, frozen
     onto posts at publish by the store. Display metadata only. */
  var US_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
  (function () {
    var sel = $("citizenStateSel");
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = T("citizen.state.unset");
    sel.appendChild(o0);
    US_STATES.forEach(function (nm) {
      var o = document.createElement("option");
      o.value = nm;
      o.textContent = nm;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      var u = currentUser();
      if (!u) return;
      u.state = sel.value || "";
      PodiumStore.save(state);
      renderCitizen();
    });
  })();
  $("topicFilter").addEventListener("change", function () { setFeedTopic($("topicFilter").value); });
  /* Search re-renders the whole feed per keystroke, so it waits for a
     short pause (same clear-then-set style as the draft-save debounce). */
  var SEARCH_DEBOUNCE_MS = 300;
  var searchTimer = null;
  $("searchInput").addEventListener("input", function () {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = null;
    searchTimer = setTimeout(function () {
      searchTimer = null;
      if (linkedPostId || linkMissing) { linkedPostId = null; linkedSuffix = null; linkMissing = false; }
      feedPage = 1;
      saveFeedState();
      renderFeed();
    }, SEARCH_DEBOUNCE_MS);
  });
  $("pageSizeSel").addEventListener("change", function () {
    var n = parseInt($("pageSizeSel").value, 10);
    feedPageSize = (FEED_PAGE_SIZES.indexOf(n) !== -1) ? n : 20;
    feedPage = 1;
    saveFeedState();
    renderFeed();
  });
  $("prevPage").addEventListener("click", function () {
    if (feedPage > 1) { feedPage -= 1; saveFeedState(); renderFeed(); scrollFeedIntoView(); }
  });
  $("nextPage").addEventListener("click", function () {
    feedPage += 1; saveFeedState(); renderFeed(); scrollFeedIntoView();
  });
  function scrollFeedIntoView() {
    var list = $("postList");
    if (list && list.scrollIntoView) list.scrollIntoView();
  }
  function matchingPostIds() {
    var ids = [];
    var q = feedQuery().toLowerCase();
    PodiumStore.postsForCycle(state, currentCycle()).forEach(function (p) {
      if (feedTopic && p.topic !== feedTopic) return;
      if (q) {
        /* Keyword search covers the body AND the author name AND the topic,
           so "Lisa" or "Housing" finds posts a body-only search would miss. */
        var author = PodiumStore.citizenById(state, p.authorId);
        var hay = (p.body + " " + (author ? author.name : "") + " " + p.topic).toLowerCase();
        if (hay.indexOf(q) === -1) return;
      }
      ids.push(p.id);
    });
    return ids;
  }
  function sortFeedIds(ids) {
    var arr = ids.slice();
    function byId(id) { return PodiumStore.postById(state, id); }
    if (feedSort === "top") {
      arr.sort(function (a, b) { return byId(b).votes - byId(a).votes; });
    } else if (feedSort === "needs") {
      arr.sort(function (a, b) { return byId(a).votes - byId(b).votes; });
    } else if (feedSort === "discover") {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
    } else {
      arr.sort(function (a, b) { return byId(a).createdAt < byId(b).createdAt ? 1 : -1; });
    }
    return arr;
  }
  function ensureFeedList(forceRebuild) {
    var key = feedKey();
    if (!forceRebuild && feedList && feedListKey === key) {
      var ids = matchingPostIds();
      var pruned = feedList.filter(function (id) { return ids.indexOf(id) !== -1; });
      if (pruned.length === feedList.length && pruned.length === ids.length) return feedList;
      if (feedFreeze || pruned.length) {
        feedList = feedFreeze ? pruned : sortFeedIds(ids);
        feedListKey = key;
        feedFreeze = false;
        return feedList;
      }
      /* fell through: mass delete plus additions with an empty survivor
         set — rebuild so the view is never wrongly empty */
    }
    feedFreeze = false;
    feedList = sortFeedIds(matchingPostIds());
    feedListKey = key;
    return feedList;
  }
  function syncFeedControls() {
    subtabs.forEach(function (x) {
      var on = x.getAttribute("data-feed") === feedSort;
      x.classList.toggle("is-active", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
    });
    $("topicFilter").value = feedTopic;
    $("pageSizeSel").value = String(feedPageSize);
  }
  function renderTopicList() {
    var box = $("topicList");
    box.innerHTML = "";
    var counts = {};
    state.topics.forEach(function (t) { counts[t] = 0; });
    var total = 0;
    PodiumStore.postsForCycle(state, currentCycle()).forEach(function (p) {
      if (counts[p.topic] === undefined) counts[p.topic] = 0;
      counts[p.topic] += 1;
      total += 1;
    });
    function addBtn(label, topic, count) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-small topic-btn";
      b.textContent = label + " (" + count + ")";
      b.setAttribute("aria-pressed", (feedTopic === topic) ? "true" : "false");
      b.addEventListener("click", function () { setFeedTopic(topic); });
      box.appendChild(b);
    }
    addBtn(T("feed.alltopics"), "", total);
    state.topics.forEach(function (t) { addBtn(Ttopic(t), t, counts[t] || 0); });
  }
  function renderPager(total, totalPages) {
    var pager = $("feedPager");
    pager.hidden = totalPages <= 1;
    $("pageInfo").textContent = T("feed.page") + " " + feedPage + " " + T("feed.page.of") + " " + totalPages;
    $("prevPage").disabled = feedPage <= 1;
    $("nextPage").disabled = feedPage >= totalPages;
  }
  function refreshVoteButtons(pid) {
    if (!pid) return;
    var p = PodiumStore.postById(state, pid);
    if (!p) return;
    var voted = state.currentUserId ? PodiumStore.hasVoted(state, state.currentUserId, pid) : false;
    var open = p.cycleId === currentCycle();
    document.querySelectorAll('.vote-btn[data-post="' + pid + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", voted ? "true" : "false");
      b.textContent = voted ? T("vote.upvoted") : T("vote.up");
      var li = b.closest("li");
      var count = li ? li.querySelector(".vote-count") : null;
      if (count) {
        count.textContent = votesLabel(p.votes) + (voted ? T("vote.yours") : "") +
          (open ? "" : T("vote.closed"));
      }
    });
  }

  function statusChip(postId) {
    var b = PodiumStore.briefingItemFor(state, postId);
    if (!b) return "";
    var shown = displayPipeline(PodiumStore.cycleById(state, b.cycleId), b.pipeline);
    var stage = inlineStage(shown);
    if (b.selection === "top") return '<span class="post-status top">' + esc(T("badge.top")) + " \u00b7 " + esc(stage) + "</span>";
    return '<span class="post-status random">' + esc(T("badge.random")) + " \u00b7 " + esc(stage) + "</span>";
  }

  var linkedPostId = null;
  var linkedSuffix = null;
  var lastCodeJump = null;
  var linkMissing = false;

  /* On-demand post translation (multilingual slice, step 4): a reader aid,
     never the record. The control appears on full-post views (thread view,
     briefing cards, Prior cards) only when the post's frozen lang differs
     from the current UI language. The original is never altered, hidden,
     or replaced; the translation renders in a separate labeled box below
     it. Translations cache in memory for the session (post id + target
     language); a reload clears them. One attempt per click; failures show
     the unavailable note and disable the button (no retry loop). */
  var translateCache = new Map();
  function needsTranslation(p) {
    var pl = p && p.lang;
    return !!pl && pl !== "und" && pl !== uiLang();
  }
  function translateBox(text) {
    var box = document.createElement("div");
    box.className = "zone zone-post";
    box.innerHTML = '<span class="zone-label">' + esc(T("translate.label")) + "</span>" +
      "<blockquote>" + esc(text) + "</blockquote>";
    return box;
  }
  function mountTranslateSlot(slot, post) {
    if (slot.getAttribute("data-mounted")) return;
    slot.setAttribute("data-mounted", "true");
    if (!needsTranslation(post)) { if (slot.parentNode) slot.parentNode.removeChild(slot); return; }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-small";
    btn.textContent = T("translate.button");
    btn.addEventListener("click", function () {
      var target = uiLang();
      var key = post.id + "|" + target;
      if (translateCache.has(key)) {
        if (!slot.querySelector(".zone")) slot.appendChild(translateBox(translateCache.get(key)));
        return;
      }
      btn.disabled = true;
      PodiumAI.translatePost(post.body, post.lang, target).then(function (text) {
        if (!text) {
          var note = document.createElement("p");
          note.className = "hint";
          note.textContent = T("translate.unavailable");
          slot.appendChild(note);
          return; /* button stays disabled: no retry loop */
        }
        translateCache.set(key, text);
        slot.appendChild(translateBox(text));
        btn.disabled = false;
      });
    });
    slot.appendChild(btn);
  }
  function translateSlotHtml(p) {
    return '<div class="translate-slot" data-post="' + esc(p.id) + '"></div>';
  }
  function mountTranslateSlots(root) {
    Array.prototype.forEach.call(root.querySelectorAll(".translate-slot"), function (slot) {
      var p = PodiumStore.postById(state, slot.getAttribute("data-post"));
      if (p) mountTranslateSlot(slot, p);
      else if (slot.parentNode) slot.parentNode.removeChild(slot);
    });
  }

  function postLi(p, linked) {
    var li = document.createElement("li");
    li.className = "post" + (linked ? " is-linked" : "");
    if (linked) li.id = "linkedPost";
    var author = PodiumStore.citizenById(state, p.authorId);
    var open = (p.cycleId === currentCycle());
    var voted = state.currentUserId ? PodiumStore.hasVoted(state, state.currentUserId, p.id) : false;
    var cycle = PodiumStore.cycleById(state, p.cycleId);
    var html = '<div class="post-meta"><span class="post-author">' + esc(author.name) +
      "</span>" + stateSuffix(p) + langSuffix(p) +
      '<span class="post-topic">' + esc(Ttopic(p.topic)) + "</span>" +
      '<span class="ref-code">' + esc(p.ref || "") + "</span>" +
      "<span>" + esc(dateShown(p)) + " \u00b7 " + esc(cycleLabel(cycle)) + "</span>" +
      statusChip(p.id) + "</div>" +
      '<p class="post-body">' + esc(p.body) + "</p>" + sealHtml(p) +
      '<div class="post-actions">';
    if (open) {
      html += '<button type="button" class="vote-btn" data-post="' + esc(p.id) + '" aria-pressed="' + (voted ? "true" : "false") + '">' +
        (voted ? T("vote.upvoted") : T("vote.up")) + "</button>";
    }
    html += '<button type="button" class="share-btn" data-share="' + esc(p.id) + '">' + esc(T("share.button")) + "</button>";
    html += '<span class="vote-count">' + votesLabel(p.votes) +
      (voted ? T("vote.yours") : "") +
      (open ? "" : T("vote.closed")) + "</span></div>";
    li.innerHTML = html;
    return li;
  }

  function attachCardButtons(list) {
    list.querySelectorAll(".vote-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!state.currentUserId) return;
        /* One vote per cycle, frozen pages: update the affected counts in
           place — no re-sort, no re-page, no snapshot rebuild. */
        var pid = btn.getAttribute("data-post");
        var prev = PodiumStore.userVoteInCycle(state, state.currentUserId, currentCycle());
        var vres = PodiumStore.castVote(state, state.currentUserId, pid);
        if (vres) { var vp = PodiumStore.postById(state, pid); audit("vote", vp ? (vp.ref || pid) : pid, vres); }
        refreshVoteButtons(prev);
        refreshVoteButtons(pid);
      });
    });
    list.querySelectorAll(".share-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = PodiumStore.postById(state, btn.getAttribute("data-share"));
        if (p) doShare(p, btn);
      });
    });
  }

  function firstSentence(body) {
    var m = /^(.+?[.!?])(\s|$)/.exec(body);
    return m ? m[1] : body.slice(0, 120);
  }
  function answerCode(post) { return (post.ref || "") + "-A"; }
  function updateCode(post, i) { return (post.ref || "") + "-U" + (i + 1); }
  /* Displayed committee answers lose the seeded "Sample committee response"
     data label at render time — plain ("Sample committee response: ...")
     and parenthetical ("Sample committee response (...): ...") forms —
     and the remainder's first letter is capitalized so the record reads
     finished. Stored text is never touched; Wonder drafts carry no prefix,
     so the strip is a no-op there. */
  function displayAnswer(a) {
    var s = String(a == null ? "" : a).replace(/^Sample committee response(\s*\([^)]*\))?:\s*/, "");
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  /* Post-integrity display (TY, Nov 3): recompute the stored hash at
     display time. Match gives the short fingerprint (first 12 hex chars).
     Mismatch (or a missing recorded hash) gives a tamper warning instead
     of a verified fingerprint. Display-only; never mutates the post. */
  function sealHtml(p) {
    if (!p) return "";
    var recomputed = PodiumStore.hashPost(state, p);
    if (p.hash && p.hash === recomputed) {
      return '<p class="hint">SHA-256 <span class="seal-code">' + esc(recomputed.slice(0, 12)) + "</span></p>";
    }
    return '<p class="gate-error">' + esc(T("sec.tamper")) + "</p>";
  }
  /* Audit logging (TY, Nov 3): every listed action appends a hash-chained
     entry via the store; the chain is verified at display on the Status
     tab. Log-only: a logging failure must never break the action. */
  function audit(ev, ref, detail) {
    try { PodiumStore.auditAppend(state, ev, ref || "", detail || "", etNow()); } catch (e) { /* log-only */ }
  }
  function adviceOutcomeLabel(o) { var k = "advice.outcome." + (o || ""); try { var s = T(k); return (s === k || !s) ? String(o || "") : s; } catch (e) { return String(o || ""); } }
  function auditEvLabel(ev) {
    var k = "audit.ev." + ev, s = T(k);
    return (s === k || !s) ? ev : s;
  }

  /* Thread view: the post plus its answer and updates, each with its code.
     Used for deep links and code search. highlight is null | "A" | "U<n>". */
  function renderThread(list, post, highlight) {
    var pli = postLi(post, true);
    list.appendChild(pli);
    var pbody = pli.querySelector(".post-body");
    if (pbody) {
      var tslot = document.createElement("div");
      tslot.className = "translate-slot";
      tslot.setAttribute("data-post", post.id);
      pbody.parentNode.insertBefore(tslot, pbody.nextSibling);
    }
    mountTranslateSlots(list);
    var b = PodiumStore.briefingItemFor(state, post.id);
    if (!b) return;
    var ans = document.createElement("li");
    ans.className = "card zone-answer" + (highlight === "A" ? " thread-hl" : "");
    if (highlight === "A") ans.id = "threadTarget";
    ans.innerHTML = '<span class="zone-label">' + esc(T("thread.answer")) + "</span>" +
      '<p><span class="ref-code">' + esc(answerCode(post)) + "</span></p>" +
      "<p>" + esc(displayAnswer(b.answer)) + "</p>";
    list.appendChild(ans);
    b.updates.forEach(function (u, i) {
      var hl = highlight === ("U" + (i + 1));
      var li = document.createElement("li");
      li.className = "card zone-answer" + (hl ? " thread-hl" : "");
      if (hl) li.id = "threadTarget";
      li.innerHTML = '<span class="zone-label">' + esc(T("thread.update")) + " U" + (i + 1) + "</span>" +
        '<p><span class="ref-code">' + esc(updateCode(post, i)) + "</span> <strong>" + esc(u.date) + "</strong></p>" +
        "<p>" + esc(u.text) + "</p>";
      list.appendChild(li);
    });
  }
  function scrollThreadTarget() {
    var t = $("threadTarget") || $("linkedPost");
    if (t && t.scrollIntoView) t.scrollIntoView();
  }

  function renderFeed() {
    var list = $("postList");
    list.innerHTML = "";
    if (linkedPostId) {
      var lp = PodiumStore.postById(state, linkedPostId);
      if (lp) {
        var noteEl = $("feedNote");
        var lpOpen = (lp.cycleId === currentCycle());
        noteEl.textContent = lpOpen ? T("feed.opened.open") : T("feed.opened.past");
        if (!lpOpen && PodiumStore.briefingItemFor(state, lp.id)) {
          noteEl.appendChild(fullRecordButton(lp.id));
          noteEl.appendChild(document.createTextNode(" "));
        }
        var back = document.createElement("button");
        back.type = "button";
        back.className = "btn btn-small";
        back.textContent = T("feed.showfull");
        back.addEventListener("click", clearDeepLink);
        noteEl.appendChild(back);
        renderThread(list, lp, linkedSuffix);
        attachCardButtons(list);
        scrollThreadTarget();
        return;
      }
      linkedPostId = null;
      linkedSuffix = null;
    }
    if (linkMissing) {
      var noteEl = $("feedNote");
      noteEl.textContent = T("feed.gone");
      var back = document.createElement("button");
      back.type = "button";
      back.className = "btn btn-small";
      back.textContent = T("feed.showfull");
      back.addEventListener("click", clearDeepLink);
      noteEl.appendChild(back);
      var liGone = document.createElement("li");
      liGone.className = "post";
      liGone.textContent = T("feed.gone.li");
      list.appendChild(liGone);
      return;
    }
    /* Live Feed = current cycle only: the posts citizens can vote on now.
       Reference-code search jumps to a thread (unpaginated, as before);
       every other list below is the frozen, paginated snapshot. */
    var raw = $("searchInput").value.trim();
    var cm = /^([A-Z])-(\d+)(?:-(A|U\d+))?$/i.exec(raw);
    if (cm) {
      var base = cm[1].toUpperCase() + "-" + (cm[2].length > 4 ? cm[2] : ("0000" + cm[2]).slice(-4));
      var suffix = cm[3] ? cm[3].toUpperCase() : null;
      if (suffix === "U0") suffix = null; /* updates start at U1 */
      var found = PodiumStore.postByRef(state, base);
      if (!found) {
        $("feedNote").textContent = Tf("feed.nocode", { code: raw.toUpperCase() });
        var liNone = document.createElement("li");
        liNone.className = "post";
        liNone.textContent = T("feed.nocode.li");
        list.appendChild(liNone);
        return;
      }
      $("feedNote").textContent = suffix
        ? Tf("feed.code.thread", { code: base + "-" + suffix })
        : Tf("feed.code.record", { code: base });
      renderThread(list, found, suffix);
      attachCardButtons(list);
      if (base + (suffix || "") !== lastCodeJump) {
        lastCodeJump = base + (suffix || "");
        scrollThreadTarget();
      }
      return;
    }
    lastCodeJump = null;
    var ids = ensureFeedList(false);
    var totalPages = Math.max(1, Math.ceil(ids.length / feedPageSize));
    if (feedPage > totalPages) { feedPage = totalPages; saveFeedState(); }
    if (feedPage < 1) feedPage = 1;
    var note = "";
    if (feedSort === "top") {
      note = T("feed.note.top");
    } else if (feedSort === "needs") {
      note = T("feed.note.needs");
    } else if (feedSort === "discover") {
      note = T("feed.note.discover");
    } else if (raw) {
      note = ids.length === 1 ? T("feed.note.results.one") : Tf("feed.note.results.many", { n: ids.length });
    } else {
      note = T("feed.note.recent");
    }
    if (feedTopic) note += Tf("feed.note.filtered", { topic: Ttopic(feedTopic), n: ids.length });
    $("feedNote").textContent = note;
    syncFeedControls();
    renderTopicList();
    renderPager(ids.length, totalPages);
    if (!ids.length) {
      var li0 = document.createElement("li");
      li0.className = "post";
      li0.textContent = T("feed.empty");
      list.appendChild(li0);
      return;
    }
    ids.slice((feedPage - 1) * feedPageSize, feedPage * feedPageSize).forEach(function (id) {
      var p = PodiumStore.postById(state, id);
      if (p) list.appendChild(postLi(p, false));
    });
    attachCardButtons(list);
  }

  /* ---------- composer ---------- */
  var composerText = $("composerText");
  var publishBtn = $("publishBtn");
  var gateState = { hard: [], soft: [], punctFix: null, clarityHold: false, overLimit: false };

  function updateOnePostNotice() {
    var box = $("onePostNotice");
    var existing = PodiumStore.userPostInCycle(state, state.currentUserId, currentCycle());
    if (existing) {
      box.hidden = false;
      box.innerHTML = T("notice.published.a") +
        esc(excerpt(existing.body, 90)) + T("notice.published.b");
      $("composerForm").style.display = "none";
    } else {
      box.hidden = true;
      $("composerForm").style.display = "";
    }
  }

  function renderComposerGate() {
    var text = composerText.value;
    /* A wholly replaced draft (new opening) is a new draft: guided answers
       given for the old opening must not leak into its help panel. */
    var headNow = text.slice(0, 24);
    if (promptHead !== null && headNow !== promptHead) promptAnswers = { what: "", want: "", who: "" };
    promptHead = headNow;
    var words = PodiumAI.countWords(text);

    gateState.overLimit = words > PodiumAI.WORD_LIMIT;
    var timer = $("readTimer");
    timer.textContent = timerShown(text);
    timer.classList.toggle("over", gateState.overLimit);

    var res = PodiumAI.checkText(text);
    if (liveGateCache && liveGateCache.text === text) {
      res = { hard: unionHard(res.hard, liveGateCache.hard), soft: unionSoft(res.soft, liveGateCache.soft), punctFix: res.punctFix };
    }
    gateState.hard = res.hard;
    gateState.soft = res.soft;
    gateState.punctFix = res.punctFix || null;
    /* Comprehensibility hold: local verdict stands; live may only add a hold,
       never lift one. Live proposal wins when verified, else the tidy. */
    var localClarity = PodiumAI.clarityOf(text);
    var clarity = localClarity;
    var proposal = null;
    scheduleClarityLive(text, res.hard.length > 0);
    if (liveClarityCache && liveClarityCache.text === text) {
      if (liveClarityCache.unclear && !localClarity.unclear) {
        clarity = { unclear: true, hasSentence: localClarity.hasSentence, topic: localClarity.topic, ask: localClarity.ask, words: localClarity.words };
      }
      if (clarity.unclear && liveClarityCache.proposal) proposal = verifyProposal(liveClarityCache.proposal, text, clarity);
    }
    /* Live-clear override for non-English posts: the local clarity check
       uses English-based topic/ask heuristics and systematically flags
       clean non-English drafts unclear. When the live gate has detected a
       non-English language for this exact text and live clarity judges it
       clear, the local unclear must not hold the post on its own.
       English, unknown ("und"), missing/stale language, a live unclear
       verdict, or no live verdict at all keep the current behavior. */
    var gateLang = (liveGateCache && liveGateCache.text === text && liveGateCache.lang) ? liveGateCache.lang : "und";
    var liveClearOverride = gateLang !== "und" && gateLang !== "en" && gateLang.indexOf("en-") !== 0 &&
      liveClarityCache && liveClarityCache.text === text && liveClarityCache.unclear === false;
    if (liveClearOverride) {
      clarity = { unclear: false, hasSentence: localClarity.hasSentence, topic: localClarity.topic, ask: localClarity.ask, words: localClarity.words };
      proposal = null;
    }
    if (!proposal && localClarity.unclear && !res.hard.length && !liveClearOverride) {
      proposal = verifyProposal(PodiumAI.tidyDraft(text), text, localClarity);
    }
    gateState.clarityHold = clarity.unclear;
    var gm = $("gateMessages");
    gm.innerHTML = "";
    var sf = $("softFlags");
    sf.innerHTML = "";

    scheduleLiveGate(text);
    if (!text.trim()) {
      publishBtn.disabled = true;
      clarityDismissedFor = null;
      renderVoiced(null);
      renderClarityPanel("", res, { unclear: false }, null);
      return;
    }
    if (gateState.overLimit) {
      var d0 = document.createElement("div");
      d0.className = "gate-error";
      d0.textContent = Tf("gate.overlimit", { n: words });
      gm.appendChild(d0);
    }
    if (res.hard.length) {
      var d1 = document.createElement("div");
      d1.className = "gate-error";
      d1.innerHTML = Tf("gate.hard", { spans: esc(res.hard.join(", ")) });
      gm.appendChild(d1);
    }
    if (!res.hard.length && res.soft.length) {
      var d2 = document.createElement("div");
      d2.className = "gate-hold";
      d2.innerHTML = Tf("gate.soft", { n: res.soft.length });
      gm.appendChild(d2);
      res.soft.forEach(function (f) {
        var chip = document.createElement("span");
        chip.className = "flag-chip";
        var label = "\u201c" + f.word + "\u201d \u2014 " + Tes(f.reason) + " ";
        chip.textContent = label;
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = f.suggestion ? Tf("chip.use", { sug: f.suggestion }) : T("chip.remove");
        b.setAttribute("aria-label", f.suggestion ? Tf("chip.aria.replace", { w: f.word, s: f.suggestion }) : Tf("chip.aria.remove", { w: f.word }));
        b.addEventListener("click", function () {
          var re = new RegExp("\\b" + f.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", f.caseSensitive ? "g" : "gi");
          composerText.value = composerText.value.replace(re, f.suggestion).replace(/ {2,}/g, " ");
          renderComposerGate();
          composerText.focus();
        });
        chip.appendChild(b);
        sf.appendChild(chip);
      });
    }
    if (!res.hard.length && res.punctFix) {
      var pf = document.createElement("div");
      pf.className = "gate-hold";
      pf.textContent = T("gate.punct");
      var fixBtn = document.createElement("button");
      fixBtn.type = "button";
      fixBtn.textContent = T("gate.punct.fix");
      fixBtn.addEventListener("click", function () {
        composerText.value = res.punctFix;
        renderComposerGate();
      });
      pf.appendChild(fixBtn);
      gm.appendChild(pf);
    }
    if (!res.hard.length && clarity.unclear) {
      var ch = document.createElement("div");
      ch.className = "gate-hold";
      ch.innerHTML = T("gate.unclear");
      gm.appendChild(ch);
    }
    renderClarityPanel(text, res, clarity, proposal);
    if (!res.hard.length && !res.soft.length && !gateState.overLimit && !res.punctFix && !clarity.unclear) {
      var d3 = document.createElement("div");
      d3.className = "gate-ok";
      d3.textContent = T("gate.ok");
      gm.appendChild(d3);
    }
    var blocked = res.hard.length > 0 || res.soft.length > 0 || res.punctFix || clarity.unclear || gateState.overLimit;
    publishBtn.disabled = blocked;

  }
  /* Live gate merge: local result (above) always stands; live may only add.
     The cache is keyed by exact draft text, so stale results never apply. */
  var liveGateCache = null;
  var liveGateTimer = null;
  function unionHard(a, b) {
    var out = (a || []).slice(), seen = {};
    out.forEach(function (x) { seen[x] = true; });
    (b || []).forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }
  /* First-wins: local's casing-correct suggestion keeps its slot when live
     flags the same word, so the chip text never flickers on merge. A live
     capitalised suggestion still upgrades a local lowercase one. */
  function unionSoft(a, b) {
    var out = [], seen = {};
    (a || []).forEach(function (f) {
      if (f && f.word && !seen[String(f.word).toLowerCase()]) {
        seen[String(f.word).toLowerCase()] = true;
        out.push({ word: f.word, suggestion: f.suggestion, reason: f.reason, caseSensitive: f.caseSensitive });
      }
    });
    (b || []).forEach(function (f) {
      if (f && f.word && !seen[String(f.word).toLowerCase()]) {
        seen[String(f.word).toLowerCase()] = true;
        out.push({ word: f.word, suggestion: f.suggestion, reason: f.reason || T("reason.live"), caseSensitive: f.caseSensitive });
      }
    });
    out.forEach(function (f) {
      var g = (b || []).filter(function (x) { return x && String(x.word).toLowerCase() === String(f.word).toLowerCase(); })[0];
      if (g && !/^[A-Z]/.test(String(f.suggestion || "")) && /^[A-Z]/.test(String(g.suggestion || "")) && String(f.suggestion).toLowerCase() === String(g.suggestion).toLowerCase()) {
        f.suggestion = g.suggestion;
      }
    });
    return out;
  }
  function scheduleLiveGate(text) {
    if (liveGateTimer) clearTimeout(liveGateTimer);
    liveGateTimer = null;
    if (!text.trim()) { liveGateCache = null; return; }
    if (liveGateCache && liveGateCache.text === text) return; /* cached; merges on render */
    var snapshot = text;
    liveGateTimer = setTimeout(function () {
      liveGateTimer = null;
      PodiumAI.checkTextLive(snapshot).then(function (live) {
        if (!live) return; /* fallback: local stands, cache untouched */
        liveGateCache = { text: snapshot, hard: live.hard || [], soft: live.soft || [], lang: live.lang || "und" };
        if (composerText.value !== snapshot) return; /* stale */
        renderComposerGate();
      });
    }, LIVE_DEBOUNCE_MS);
  }
  composerText.addEventListener("input", function () {
    renderComposerGate();
    scheduleVoiced();
    saveDraft();
  });

  /* ---------- comprehensibility hold + wording help ---------- */
  /* A held draft is never a published post: it lives only in the composer
     (persisted below), never in state.posts, so it cannot enter the draw
     pool or count toward one post per cycle. Nothing here publishes: the
     "Use this version" click loads the approved words and runs the normal
     publish path, which re-verifies everything. */
  var DRAFT_KEY = "podium1.v1.draft";
  var draftSaveTimer = null;
  function saveDraft() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(function () {
      draftSaveTimer = null;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: composerText.value, topic: $("composerTopic").value }));
      } catch (e) { /* private mode: the draft simply does not persist */ }
    }, 500);
  }
  function restoreDraft() {
    var raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (d && typeof d.text === "string" && d.text && !composerText.value) {
        composerText.value = d.text.slice(0, 9000);
        if (d.topic) $("composerTopic").value = d.topic;
      }
    } catch (e) { /* corrupt draft: start fresh */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  function canSpeak() { return ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window); }
  function speak(text) {
    if (!canSpeak()) return false;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      return true;
    } catch (e) { return false; }
  }
  function stopSpeak() { if (canSpeak()) { try { window.speechSynthesis.cancel(); } catch (e) {} } }

  /* A proposal is offerable only when hard-clean, clear, within the cap, and
     different from the draft. Topic must not drift when both detect one. */
  function verifyProposal(proposal, draftText, draftClarity) {
    if (typeof proposal !== "string") return null;
    var p = proposal.trim();
    if (!p || p === String(draftText).trim()) return null;
    if (PodiumAI.countWords(p) > PodiumAI.WORD_LIMIT) return null;
    if (PodiumAI.checkText(p).hard.length) return null;
    var c = PodiumAI.clarityOf(p);
    if (c.unclear) return null;
    if (draftClarity && draftClarity.ask && !c.ask) return null; /* an approved rewrite must keep the author's ask */
    if (draftClarity && draftClarity.topic && c.topic && c.topic !== draftClarity.topic) return null;
    return p;
  }

  var liveClarityCache = null;
  var liveClarityTimer = null;
  function scheduleClarityLive(text, skip) {
    if (liveClarityTimer) clearTimeout(liveClarityTimer);
    liveClarityTimer = null;
    if (!text.trim()) { liveClarityCache = null; return; }
    if (skip) return;
    if (liveClarityCache && liveClarityCache.text === text) return; /* cached; merges on render */
    var snapshot = text;
    liveClarityTimer = setTimeout(function () {
      liveClarityTimer = null;
      PodiumAI.checkClarityLive(snapshot).then(function (live) {
        if (!live) return; /* fallback: local stands, cache untouched */
        liveClarityCache = { text: snapshot, unclear: live.unclear, proposal: live.proposal || null };
        if (composerText.value !== snapshot) return; /* stale */
        renderComposerGate();
      });
    }, LIVE_DEBOUNCE_MS);
  }

  var clarityDismissedFor = null; /* snapshot whose rewrite offer was declined */
  var promptAnswers = { what: "", want: "", who: "" };
  var promptHead = null; /* opening snapshot the current prompt answers were given for */
  var builtOffer = null; /* { text, built } answer-composed proposal awaiting approval */
  var clarityRenderKey = null;
  function renderClarityPanel(text, res, clarity, proposal) {
    var panel = $("clarityPanel");
    if (builtOffer && builtOffer.text !== text) builtOffer = null;
    var showHelp = !res.hard.length && clarity.unclear && !!text.trim() && text !== clarityDismissedFor;
    var useBuilt = !!(showHelp && builtOffer && builtOffer.text === text);
    var effProposal = useBuilt ? builtOffer.built : (showHelp ? proposal : null);
    var key = showHelp ? ((useBuilt ? "B" : "C") + text + "\n" + (effProposal || "")) : "off";
    if (key === clarityRenderKey) return;
    clarityRenderKey = key;
    panel.innerHTML = "";
    if (!showHelp) { panel.hidden = true; return; }
    panel.hidden = false;
    if (effProposal) renderOffer(panel, text, effProposal, useBuilt);
    else renderPrompts(panel);
  }

  function renderOffer(panel, text, proposal, built) {
    var wrap = document.createElement("div");
    wrap.className = "gate-hold";
    var title = built ? T("offer.built") : T("offer.proposed");
    var t = document.createElement("div");
    t.innerHTML = "<strong>" + esc(title) + "</strong>" + esc(T("offer.until"));
    wrap.appendChild(t);
    var cols = document.createElement("div");
    cols.style.display = "flex";
    cols.style.flexWrap = "wrap";
    cols.style.gap = "8px";
    cols.style.margin = "8px 0";
    [[T("offer.yours"), String(text).trim()], [T("offer.version"), proposal]].forEach(function (pair) {
      var cell = document.createElement("div");
      cell.style.flex = "1 1 220px";
      var lab = document.createElement("div");
      lab.textContent = pair[0];
      var q = document.createElement("blockquote");
      q.textContent = pair[1];
      q.style.margin = "4px 0";
      cell.appendChild(lab);
      cell.appendChild(q);
      cols.appendChild(cell);
    });
    wrap.appendChild(cols);
    var row = document.createElement("div");
    var useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "btn btn-small";
    useBtn.textContent = T("offer.use");
    useBtn.addEventListener("click", function () { useProposal(proposal); });
    row.appendChild(useBtn);
    row.appendChild(document.createTextNode(" "));
    var keepBtn = document.createElement("button");
    keepBtn.type = "button";
    keepBtn.className = "btn btn-small";
    keepBtn.textContent = T("offer.keep");
    keepBtn.addEventListener("click", function () {
      clarityDismissedFor = composerText.value;
      builtOffer = null;
      promptAnswers = { what: "", want: "", who: "" };
      clarityRenderKey = null;
      renderComposerGate();
      composerText.focus();
    });
    row.appendChild(keepBtn);
    if (canSpeak()) {
      row.appendChild(document.createTextNode(" "));
      var hearBtn = document.createElement("button");
      hearBtn.type = "button";
      hearBtn.className = "btn btn-small";
      hearBtn.textContent = T("offer.hear");
      hearBtn.addEventListener("click", function () { speak(proposal); });
      row.appendChild(hearBtn);
    } else {
      var nn = document.createElement("div");
      nn.className = "hint";
      nn.textContent = T("offer.novoice");
      wrap.appendChild(nn);
    }
    wrap.appendChild(row);
    panel.appendChild(wrap);
  }

  function useProposal(proposal) {
    stopSpeak();
    var p = verifyProposal(proposal, composerText.value, PodiumAI.clarityOf(composerText.value));
    if (!p) { clarityRenderKey = null; renderComposerGate(); return; } /* stale offer: re-evaluate */
    composerText.value = p;
    builtOffer = null;
    clarityDismissedFor = null;
    renderComposerGate();
    if (!PodiumAI.getKey()) {
      /* Publishes only when fully clean; otherwise the approved words stay
         in the composer with the remaining holds shown for fixing. */
      tryPublish(true);
      return;
    }
    /* A key is set: Spark gets the last word on the approved text before it
       can publish. Any live detection stands; the author then fixes and
       publishes. A failed call falls back silently, as everywhere. */
    PodiumAI.checkTextLive(p).then(function (live) {
      if (composerText.value !== p) return; /* author moved on */
      if (live && ((live.hard && live.hard.length) || (live.soft && live.soft.length))) {
        liveGateCache = { text: p, hard: live.hard || [], soft: live.soft || [], lang: live.lang || "und" };
        renderComposerGate();
        return;
      }
      PodiumAI.checkClarityLive(p).then(function (cl) {
        if (composerText.value !== p) return;
        if (cl && cl.unclear) {
          liveClarityCache = { text: p, unclear: true, proposal: cl.proposal || null };
          clarityRenderKey = null;
          renderComposerGate();
          return;
        }
        tryPublish(true);
      });
    });
  }

  function renderPrompts(panel) {
    var wrap = document.createElement("div");
    wrap.className = "gate-hold";
    var t = document.createElement("div");
    t.innerHTML = "<strong>" + esc(T("prompts.title")) + "</strong>" + esc(T("prompts.nooffer"));
    wrap.appendChild(t);
    [["what", T("prompts.what")], ["want", T("prompts.want")], ["who", T("prompts.who")]].forEach(function (pair) {
      var fd = document.createElement("div");
      fd.className = "field";
      var lab = document.createElement("label");
      lab.textContent = pair[1];
      var inp = document.createElement("input");
      inp.type = "text";
      inp.value = promptAnswers[pair[0]];
      (function (key, el) {
        el.addEventListener("input", function () { promptAnswers[key] = el.value; });
      })(pair[0], inp);
      lab.appendChild(inp);
      fd.appendChild(lab);
      wrap.appendChild(fd);
    });
    var msg = document.createElement("div");
    msg.className = "hint";
    wrap.appendChild(msg);
    var buildBtn = document.createElement("button");
    buildBtn.type = "button";
    buildBtn.className = "btn btn-small";
    buildBtn.textContent = T("prompts.build");
    buildBtn.addEventListener("click", function () { buildFromAnswers(panel, msg); });
    wrap.appendChild(buildBtn);
    panel.appendChild(wrap);
  }

  /* Compose a draft from the author's answers only: each answer becomes one
     sentence (first letter capitalized, terminal period added). No other
     words are added, and the result still faces the hard screen and the
     clarity check before any approval can publish it. */
  function buildFromAnswers(panel, msg) {
    var sents = [];
    ["what", "want", "who"].forEach(function (k) {
      var a = promptAnswers[k].trim();
      if (!a) return;
      a = a.charAt(0).toUpperCase() + a.slice(1);
      if (!/[.!?]$/.test(a)) a += ".";
      sents.push(a);
    });
    if (!sents.length) { msg.textContent = T("prompts.needone"); return; }
    var built = sents.join(" ");
    if (PodiumAI.checkText(built).hard.length) {
      msg.textContent = T("prompts.badwords");
      return;
    }
    var bc = PodiumAI.clarityOf(built);
    if (bc.unclear) {
      /* Still unclear: show the composed words in the composer for fixing. */
      composerText.value = built;
      clarityRenderKey = null;
      renderComposerGate();
      composerText.focus();
      return;
    }
    builtOffer = { text: composerText.value, built: built };
    clarityRenderKey = null;
    renderComposerGate();
  }

  function wireHearUi() {
    var hb = $("hearDraftBtn");
    if (!hb) return;
    if (!canSpeak()) {
      var note = document.createElement("span");
      note.className = "hint";
      note.id = "hearNoVoice";
      note.textContent = T("hear.novoice");
      hb.parentNode.replaceChild(note, hb);
      return;
    }
    hb.addEventListener("click", function () {
      var text = composerText.value.trim();
      if (!text) { composerText.focus(); return; }
      speak(text);
    });
  }

  function pipelineLabel(postId) {
    var b = PodiumStore.briefingItemFor(state, postId);
    if (!b) return T("pipe.none");
    return (b.selection === "top" ? T("pipe.top") : T("pipe.random")) + ", " + pipeStage(displayPipeline(PodiumStore.cycleById(state, b.cycleId), b.pipeline));
  }

  var voicedTimer = null;
  var voicedShown = false;
  var voicedDismissed = false;
  var voicedForText = null; /* draft lineage the box state belongs to */
  /* Generic live-AI debounce: the live gate, live clarity, and Already-voiced
     checks all wait this long after typing stops before calling out. */
  var LIVE_DEBOUNCE_MS = 2500;

  /* The box appears only after the user STOPS typing for a few seconds, and
     only once per draft. It sits below the composer and never blocks input. */
  function scheduleVoiced() {
    if (voicedTimer) clearTimeout(voicedTimer);
    voicedTimer = null;
    if (!composerText.value.trim()) {
      voicedShown = false;
      voicedDismissed = false;
      voicedForText = null;
      renderVoiced(null);
      return;
    }
    /* A wholly replaced draft (new opening) is a new draft: the once-per-draft
       box may appear for it. Edits keeping the opening keep the manners. */
    var curHead = composerText.value.slice(0, 24);
    if (voicedForText !== null && curHead !== voicedForText.slice(0, 24)) {
      voicedShown = false;
      voicedDismissed = false;
    }
    if (voicedShown || voicedDismissed) return;
    voicedTimer = setTimeout(function () {
      voicedTimer = null;
      if (voicedShown || voicedDismissed) return;
      var snapshot = composerText.value;
      var scope = PodiumStore.postsForCycle(state, currentCycle());
      var local = PodiumAI.findTopSimilar(snapshot, scope);
      renderVoiced(local);
      PodiumAI.findTopSimilarLive(snapshot, scope).then(function (livePost) {
        if (!livePost) return; /* fallback: local stands */
        if (composerText.value !== snapshot || voicedDismissed) return; /* stale */
        var pool = [];
        if (local) pool.push(local);
        if (!local || livePost.id !== local.id) pool.push(livePost);
        pool.sort(function (a, b) { return b.votes - a.votes; });
        if (pool.length && (!local || pool[0].id !== local.id)) renderVoiced(pool[0]);
      });
    }, LIVE_DEBOUNCE_MS);
  }

  function renderVoiced(match) {
    var panel = $("voicedPanel");
    panel.innerHTML = "";
    if (!match) { panel.hidden = true; return; }
    voicedShown = true;
    voicedForText = composerText.value;
    panel.hidden = false;
    var head = document.createElement("div");
    head.className = "voiced-head";
    var h = document.createElement("h3");
    h.textContent = T("voiced.title");
    var x = document.createElement("button");
    x.type = "button";
    x.className = "voiced-close";
    x.textContent = T("voiced.dismiss");
    x.setAttribute("aria-label", T("voiced.dismiss.aria"));
    x.addEventListener("click", function () {
      voicedDismissed = true;
      voicedForText = composerText.value;
      panel.hidden = true;
    });
    head.appendChild(h);
    head.appendChild(x);
    panel.appendChild(head);
    var author = PodiumStore.citizenById(state, match.authorId);
    var mp = document.createElement("p");
    mp.innerHTML = "<strong>" + esc(author.name) + "</strong> (" + votesLabel(match.votes) +
      " \u00b7 " + esc(pipelineLabel(match.id)) + "): " +
      esc(excerpt(match.body, 220));
    panel.appendChild(mp);
    var rem = document.createElement("p");
    rem.className = "reminder";
    rem.textContent = T("voiced.reminder");
    panel.appendChild(rem);
    var exits = document.createElement("div");
    exits.className = "exits";
    var insteadBtn = document.createElement("button");
    insteadBtn.type = "button";
    insteadBtn.className = "btn btn-small";
    insteadBtn.textContent = (state.currentUserId && PodiumStore.hasVoted(state, state.currentUserId, match.id))
      ? T("vote.upvoted.check") : T("voiced.instead");
    insteadBtn.addEventListener("click", function () {
      if (!state.currentUserId) return;
      if (match.cycleId !== currentCycle()) {
        insteadBtn.textContent = T("vote.closedweek");
        insteadBtn.disabled = true;
        return;
      }
      if (!PodiumStore.hasVoted(state, state.currentUserId, match.id)) {
        var vresM = PodiumStore.castVote(state, state.currentUserId, match.id);         if (vresM) audit("vote", match.ref || match.id, vresM);
      }
      insteadBtn.textContent = T("vote.upvoted.check");
      renderFeed();
    });
    var bothBtn = document.createElement("button");
    bothBtn.type = "button";
    bothBtn.className = "btn btn-small";
    bothBtn.textContent = T("voiced.both");
    bothBtn.addEventListener("click", function () {
      if (!state.currentUserId) return;
      if (match.cycleId === currentCycle() && !PodiumStore.hasVoted(state, state.currentUserId, match.id)) {
        var vresB = PodiumStore.castVote(state, state.currentUserId, match.id);         if (vresB) audit("vote", match.ref || match.id, vresB);
      }
      renderFeed();
      publishBtn.focus();
    });
    var asisBtn = document.createElement("button");
    asisBtn.type = "button";
    asisBtn.className = "btn btn-small";
    asisBtn.textContent = T("voiced.asis");
    asisBtn.addEventListener("click", function () { publishBtn.focus(); });
    exits.appendChild(insteadBtn);
    exits.appendChild(bothBtn);
    exits.appendChild(asisBtn);
    panel.appendChild(exits);
  }

  /* Layer 1 anti-flood: exact copy of a current-cycle post. Hard gate with
     no post-anyway exit. The draft is kept; the citizen can upvote instead. */
  function showCopyRedirect(dup) {
    var gm = $("gateMessages");
    gm.innerHTML = "";
    var d = document.createElement("div");
    d.className = "gate-error";
    var msg = document.createElement("p");
    msg.textContent = T("copy.exists");
    d.appendChild(msg);
    var quote = document.createElement("p");
    quote.innerHTML = Tf("copy.existing", { quote: esc(excerpt(dup.body, 200)) });
    d.appendChild(quote);
    var vb = document.createElement("button");
    vb.type = "button";
    vb.className = "btn btn-small";
    vb.textContent = PodiumStore.hasVoted(state, state.currentUserId, dup.id) ? T("vote.upvoted.check") : T("vote.upvoteit");
    vb.addEventListener("click", function () {
      if (!PodiumStore.hasVoted(state, state.currentUserId, dup.id)) {
        var vresD = PodiumStore.castVote(state, state.currentUserId, dup.id);
        if (vresD) audit("vote", dup.ref || dup.id, vresD);
      }
      vb.textContent = T("vote.upvoted.check");
      renderFeed();
    });
    d.appendChild(vb);
    gm.appendChild(d);
    publishBtn.disabled = true;
  }

  function tryPublish(fromPreview) {
    if (!state.currentUserId) return;
    renderComposerGate();
    if (publishBtn.disabled && !fromPreview) return;
    var text = composerText.value.trim();
    if (!text) return;
    if (gateState.hard.length || gateState.soft.length || gateState.punctFix || gateState.clarityHold || gateState.overLimit) return;
    var dup = PodiumStore.findExactInCycle(state, currentCycle(), text);
    if (dup) { showCopyRedirect(dup); return; }
    /* The frozen language tag comes from the live gate's language verdict
       for this exact text; without one (offline, stub, stale) it is "und"
       and no label renders. Never edited after publishing. */
    var detectedLang = (liveGateCache && liveGateCache.text === text && liveGateCache.lang) ? liveGateCache.lang : "und";
    var post = PodiumStore.publishPost(state, state.currentUserId, currentCycle(), $("composerTopic").value, text, etNow(), detectedLang);
    if (!post) { updateOnePostNotice(); return; }
    audit("post", post.ref, post.id);
    composerText.value = "";
    clearDraft();
    stopSpeak();
    promptAnswers = { what: "", want: "", who: "" };
    builtOffer = null;
    clarityDismissedFor = null;
    clarityRenderKey = null;
    if (voicedTimer) clearTimeout(voicedTimer);
    voicedTimer = null;
    voicedShown = false;
    voicedDismissed = false;
    voicedForText = null;
    renderVoiced(null);
    closeModal($("previewModal"));
    renderComposerGate();
    updateOnePostNotice();
    feedSort = "recent";
    feedTopic = "";
    $("searchInput").value = "";
    feedPage = 1;
    feedList = null; /* rebuild so the new post leads page 1 */
    saveFeedState();
    showView("feed");
    renderFeed();
    $("feedNote").textContent = T("publish.done");
  }
  $("composerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    tryPublish(false);
  });

  /* ---------- preview ---------- */
  function showTopicSuggestion(sug) {
    var pt = $("previewTopic");
    pt.hidden = false;
    pt.innerHTML = T("preview.suggest.a") + esc(Ttopic(sug)) + T("preview.suggest.b");
    var useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "btn btn-small";
    useBtn.textContent = T("preview.usetopic");
    useBtn.addEventListener("click", function () {
      $("composerTopic").value = sug;
      pt.hidden = true;
      saveDraft();
    });
    pt.appendChild(useBtn);
  }
  $("previewBtn").addEventListener("click", function () {
    if (!state.currentUserId) return;
    var text = composerText.value.trim();
    if (!text) { composerText.focus(); return; }
    $("previewMeta").textContent = currentUser().name + " \u00b7 " + Ttopic($("composerTopic").value) + " \u00b7 " +
      PodiumAI.countWords(text) + " " + T("preview.words") + " \u00b7 " + timerShown(text) + " " + T("preview.readaloud");
    $("previewBody").textContent = text;
    var pt = $("previewTopic");
    var sug = PodiumAI.suggestTopic(text);
    if (sug && sug !== $("composerTopic").value) {
      showTopicSuggestion(sug);
    } else {
      pt.hidden = true;
      pt.innerHTML = "";
      var snapText = text, snapTopic = $("composerTopic").value;
      PodiumAI.suggestTopicLive(text).then(function (liveSug) {
        if (!liveSug) return; /* fallback: nothing to add */
        if ($("previewModal").hidden) return; /* stale */
        if (composerText.value.trim() !== snapText || $("composerTopic").value !== snapTopic) return;
        if (!$("previewTopic").hidden) return; /* first-shown wins */
        showTopicSuggestion(liveSug);
      });
    }
    openModal($("previewModal"));
  });
  $("previewClose").addEventListener("click", function () { closeModal($("previewModal")); });
  $("previewPublish").addEventListener("click", function () { tryPublish(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!$("previewModal").hidden) { closeModal($("previewModal")); return; }
      return;
    }
    if (e.key !== "Tab") return;
    var box = !$("previewModal").hidden ? $("previewModal") : null;
    if (!box) return;
    var f = modalFocusables(box);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });

  /* ---------- briefing ---------- */
  /* Pipeline stage is displayed from the clock, never from frozen seed flags:
     once the cycle's briefing datetime has passed the stage is "Briefed",
     otherwise the stored pipeline value stands. Stored values are untouched. */
  function displayPipeline(cycle, pipeline) {
    var bAt = cycle && cycleDateTimeFor(cycle, cycle.briefingAt);
    if (bAt && bAt <= etNow()) return "briefed";
    return pipeline;
  }
  function stageHtml(pipeline) {
    var steps = [["selected", T("stage.selected")], ["committee", T("stage.committee")], ["briefed", T("stage.briefed")]];
    var order = { selected: 0, committee: 1, briefed: 2 };
    var cur = order[pipeline] !== undefined ? order[pipeline] : 0;
    return '<div class="stage" role="img" aria-label="' + esc(Tf("stage.aria", { stage: steps[cur][1] })) + '">' + steps.map(function (s, i) {
      return (i > 0 ? '<span class="stage-arrow" aria-hidden="true">\u2192</span>' : "") +
        '<span class="stage-step' + (i <= cur ? " done" : "") + '">' + esc(s[1]) + "</span>";
    }).join("") + "</div>";
  }

  function selectionBadge(cycle, item, p) {
    var poolLen = cycle.poolSize;
    if (item.selection === "top") {
      return '<span class="badge-top">' + esc(T("selbadge.top")) + " \u00b7 " + esc(votesLabel(p.votes)) + "</span>";
    }
    return '<span class="badge-random">' + esc(T("selbadge.random")) + " \u00b7 " + esc(T("selbadge.position")) + " " + cycle.position + " " + esc(T("selbadge.of")) + " " + poolLen + "</span>";
  }
  /* Verbatim excerpt only: the author's exact words (first sentence, capped
     at ~200 chars). Never a paraphrase — the Verbatim Rule forbids editors. */
  function briefExcerpt(text) {
    var s = firstSentence(text);
    if (s.length <= 200) return s;
    return excerpt(text, 200);
  }
  /* One box's own expansion button, placed directly under that box.
     Expansion extends the EXISTING box in place: the toggle swaps that same
     box's blockquote between excerpt and full text, so the card never gains
     a second box. "Verbatim" belongs to the citizen post only — the
     answer's button says "answer", never "verbatim", so the two zones
     stay distinct. Labels and button texts stay as they are. */
  function zoneExpander(zoneClass, labelText, fullLabelText, excerptHtml, fullHtml, buttonLabel) {
    var wrap = document.createElement("div");
    var box = document.createElement("div");
    box.className = "zone " + zoneClass;
    box.innerHTML = '<span class="zone-label">' + labelText + "</span><blockquote>" + excerptHtml + "</blockquote>";
    wrap.appendChild(box);
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn btn-small";
    toggle.textContent = buttonLabel;
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      box.querySelector("blockquote").innerHTML = expanded ? excerptHtml : fullHtml;
      box.querySelector(".zone-label").textContent = expanded ? labelText : fullLabelText;
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? buttonLabel : T("zone.summary");
    });
    wrap.appendChild(toggle);
    return wrap;
  }
  function briefingSummaryCard(cycle, item) {
    var p = PodiumStore.postById(state, item.postId);
    var author = PodiumStore.citizenById(state, p.authorId);
    var li = document.createElement("li");
    li.className = "card";
    var head = document.createElement("div");
    head.innerHTML = "<p>" + selectionBadge(cycle, item, p) + "</p>" +
      '<p class="hint">' + esc(cycleLabel(cycle)) + "</p>" +
      stageHtml(displayPipeline(cycle, item.pipeline)) +
      '<p><span class="ref-code">' + esc(p.ref || "") + "</span> <strong>" + esc(author.name) + "</strong>" + stateSuffix(p) + langSuffix(p) + " \u00b7 " + esc(Ttopic(p.topic)) + " \u00b7 " + esc(votesLabel(p.votes)) + "</p>";
    li.appendChild(head);
    var postExpander = zoneExpander("zone-post", T("zone.post.excerpt"), T("zone.post.full"),
      esc(briefExcerpt(p.body)), esc(p.body), T("zone.post.read"));
    li.appendChild(postExpander);
    var postSeal = document.createElement("div");
    postSeal.innerHTML = sealHtml(p);
    li.appendChild(postSeal);
    var translateSlot = document.createElement("div");
    translateSlot.className = "translate-slot";
    translateSlot.setAttribute("data-post", p.id);
    li.appendChild(translateSlot);
    mountTranslateSlots(li);
    li.appendChild(zoneExpander("zone-answer", T("zone.answer.excerpt"), T("zone.answer.full"),
      esc(briefExcerpt(displayAnswer(item.answer))), esc(displayAnswer(item.answer)), T("zone.answer.read")));
    var apw = document.createElement("div");
    apw.innerHTML = approverHtml(item) + standingHtml(item.answer);
    wireApproverLinks(apw);
    while (apw.firstChild) li.appendChild(apw.firstChild);
    var citeDiv = document.createElement("div");
    citeDiv.innerHTML = citationsHtml(item, p);
    while (citeDiv.firstChild) li.appendChild(citeDiv.firstChild);
    var row = document.createElement("div");
    row.className = "btn-row";
    var record = document.createElement("button");
    record.type = "button";
    record.className = "btn btn-small";
    record.textContent = T("feed.fullrecord");
    record.addEventListener("click", function () {
      threadSelect($("priorSelect"), renderPriorCard).value = p.id;
      showView("prior");
    });
    row.appendChild(record);
    li.appendChild(row);
    return li;
  }
  function briefingWednesday(cycle) {
    var m = /^Wed ([A-Za-z]+ \d+)/.exec(cycle.briefingAt || "");
    return m ? ("Wednesday, " + m[1]) : cycle.briefingAt;
  }
  /* Next Week preview: selected posts awaiting answers. NEVER shows answer
     text — the committee is still formulating it. */
  function nextWeekItem(cycle, item) {
    var p = PodiumStore.postById(state, item.postId);
    var author = PodiumStore.citizenById(state, p.authorId);
    var li = document.createElement("li");
    li.className = "card next-item";
    li.innerHTML = "<p>" + selectionBadge(cycle, item, p) + "</p>" + stageHtml(displayPipeline(cycle, item.pipeline)) +
      '<p><span class="ref-code">' + esc(p.ref || "") + "</span> <strong>" + esc(author.name) + "</strong>" + stateSuffix(p) + langSuffix(p) + " \u00b7 " + esc(Ttopic(p.topic)) + "</p>" +
      '<div class="zone zone-post"><span class="zone-label">' + esc(T("zone.post.next")) + "</span>" +
      "<blockquote>" + esc(p.body) + "</blockquote>" +
      '<p class="hint">' + esc(Tf("next.selectedfor", { name: author.name })) + "</p></div>" + sealHtml(p) +
      '<p class="hint">' + esc(Tf("next.answercoming", { date: briefingWednesday(cycle) })) + "</p>" +
      translateSlotHtml(p);
    li.appendChild(buildWonderZone(p));
    mountTranslateSlots(li);
    return li;
  }

  /* Wonder answer drafts: session-only, never mutate any stored record.
     A draft displays separately until "Approve draft" is clicked; only
     then does the DISPLAYED text change (approved pill). The zone lives
     under Next Week posts: the committee drafts during committee week,
     before the briefing airs. */
  var wonderDrafts = {};   /* postId -> draft envelope { text, citations, noCommitments, agencyRequest } */
  var wonderApproved = {}; /* postId -> true once approved in this session */
  var wonderDeclined = {}; /* postId -> true once declined in this session (post reverts to shine light) */
  var wonderLiaisonAdvice = {}; /* postId -> [{liaison, claim, authority, date, outcome}] recorded in the draft zone, logged on approval, session-only */
  /* Draft-zone visibility: drafts are public and never edited — the committee votes on them as written; only the vote itself stays a committee action. */

  function buildWonderZone(p) {
    var wonderBox = document.createElement("div");
    wonderBox.className = "zone zone-answer";
    var draftBtn = document.createElement("button");
    draftBtn.type = "button";
    draftBtn.className = "btn btn-small";
    draftBtn.textContent = T("wonder.draft");
    var wonderStatus = document.createElement("p");
    wonderStatus.className = "hint";
    /* Decided items stay decided across reload: the draft button hides when the
       briefing item already carries approvedBy or a decline marker (persisted),
       not just the session flags. A never-decided item may still be re-drafted
       after a session loss (recovery, not a re-draft). */
    var decidedItem = PodiumStore.briefingItemFor(state, p.id);
    var decidedApproved = !!(wonderApproved[p.id] || (decidedItem && decidedItem.approvedBy));
    var decidedDeclined = !!(wonderDeclined[p.id] || (decidedItem && decidedItem.declined));
    if (!wonderDrafts[p.id] && !decidedApproved && !decidedDeclined) wonderBox.appendChild(draftBtn);
    wonderBox.appendChild(wonderStatus);
    /* Approval gate (TY): with no serving approver the block reason stays
       visible in the zone, so the empty-roster state needs no draft to see. */
    var rosterNote = document.createElement("p");
    rosterNote.className = "hint";
    var svZone = servingApprover();
    if (!svZone.member) rosterNote.textContent = T(svZone.reason === "empty" ? "approver.none" : "approver.notserving");
    wonderBox.appendChild(rosterNote);
    function draftLabel() {
      return T("wonder.pending");
    }
    function draftGate(d) { return !!(d && (d.noCommitments || (d.citations && d.citations.length))); }
    function showDraft() {
      var draft = wonderDrafts[p.id];
      if (!draft || decidedApproved || decidedDeclined) return;
      var reqCopyText = requestText(draft);
      /* Agency request (TY, Nov 4): Wonder supplies a ready-to-send request to
         the agency the answer asks something of, as part of the draft envelope.
         Read-only here — copied with the existing copy helper, never edited. */
      function requestText(d) {
        if (!d || !d.agencyRequest || !d.agencyRequest.agency || !d.agencyRequest.ask) return "";
        return Tf("wonder.request.body", { agency: d.agencyRequest.agency, ask: d.agencyRequest.ask, ref: p.ref });
      }
      var box = document.createElement("div");
      box.innerHTML = '<span class="zone-label">' + esc(draftLabel()) + "</span>" +
        "<p>" + esc(draft.text) + "</p>" +
        citationsHtml({ citations: draft.citations || [] }, p) +
        (draft.noCommitments ? '<p class="hint">' + esc(T("cite.nocommit")) + "</p>" : "") +
        (reqCopyText ? '<p><span class="zone-label">' + esc(T("wonder.request.label")) + "</span></p>" +
          '<p data-wonder-request>' + esc(reqCopyText) + "</p>" : "");
      var approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.className = "btn btn-small";
      approveBtn.textContent = T("wonder.approve");
      var svBtn = servingApprover();
      if (!svBtn.member) {
        approveBtn.disabled = true;
        wonderStatus.textContent = T(svBtn.reason === "empty" ? "approver.none" : "approver.notserving");
      }
      approveBtn.addEventListener("click", function () {
        if (!draftGate(draft)) { trackerMsg(box, "wonder.nocites"); return; }
        var res = approveAnswerFor(p);
        if (!res.ok) { wonderStatus.textContent = T(res.key); renderBriefing(); return; }
        var ra = PodiumStore.recordAnswer(state, p.id, draft.text, draft.agencyRequest || null);
        if (!ra.ok) { wonderStatus.textContent = T("wonder.unavailable"); return; }
        var rc = PodiumStore.recordCitations(state, p.id, draft.citations || [], !!draft.noCommitments);
        if (!rc.ok) { trackerMsg(box, "wonder.nocites"); return; }
        try { PodiumStore.save(state); } catch (e) { /* session-only fallback */ }
        audit("approve", p.ref + "-A", "");
        (wonderLiaisonAdvice[p.id] || []).forEach(function (a) {
          audit("liaisonAdvice", p.ref, JSON.stringify({ liaison: a.liaison, claim: a.claim, authority: a.authority, date: a.date, outcome: a.outcome }));
        });
        wonderApproved[p.id] = true;
        renderBriefing();
      });
      var declineBtn = document.createElement("button");
      declineBtn.type = "button";
      declineBtn.className = "btn btn-small";
      declineBtn.textContent = T("wonder.decline");
      if (!svBtn.member) {
        declineBtn.disabled = true;
      }
      declineBtn.addEventListener("click", function () {
        PodiumStore.recordDecline(state, p.id);
        try { PodiumStore.save(state); } catch (e) { /* session-only fallback */ }
        wonderDeclined[p.id] = true;
        audit("decline", p.ref + "-A", "");
        renderBriefing();
      });
      /* Liaison-advice record (TY, Nov 4): each piece of liaison advice that
         shapes the answer is recorded here with the authority cited and what
         the committee did with it. Session-only until approval, when the
         entries are written to the audit log. */
      var adviceSection = document.createElement("div");
      var ADVICE_OUTCOMES = ["followed", "second", "notfollowed"];
      function adviceVal(n) { var el = adviceSection.querySelector('[data-advice="' + n + '"]'); return el ? el.value : ""; }
      function renderAdvice() {
        var wasOpen = !!(adviceSection.querySelector("details") && adviceSection.querySelector("details").open);
        var list = wonderLiaisonAdvice[p.id] || [];
        var h = '<details><summary><span class="zone-label">' + esc(T("advice.legend")) + "</span></summary>";
        for (var j = 0; j < list.length; j++) {
          h += '<p class="hint">' + esc(list[j].liaison) + " \u2014 " + esc(list[j].claim) + " (" + esc(adviceOutcomeLabel(list[j].outcome)) + ")" +
            ' <button type="button" class="btn btn-small" data-advice-rm="' + j + '">' + esc(T("cite.remove")) + "</button></p>";
        }
        h += '<div class="field"><label>' + esc(T("advice.liaison")) + '</label><input type="text" data-advice="liaison" placeholder="' + esc(T("advice.liaison.ph")) + '"></div>' +
          '<div class="field"><label>' + esc(T("advice.claim")) + '</label><textarea data-advice="claim" rows="2" placeholder="' + esc(T("advice.claim.ph")) + '"></textarea></div>' +
          '<div class="field"><label>' + esc(T("advice.authority")) + '</label><textarea data-advice="authority" rows="2" placeholder="' + esc(T("advice.authority.ph")) + '"></textarea></div>' +
          '<div class="field"><label>' + esc(T("advice.date")) + '</label><input type="text" data-advice="date" placeholder="' + esc(T("advice.date.ph")) + '"></div>' +
          '<div class="field"><label>' + esc(T("advice.outcome")) + '</label><select data-advice="outcome">' +
          '<option value="followed">' + esc(T("advice.outcome.followed")) + "</option>" +
          '<option value="second">' + esc(T("advice.outcome.second")) + "</option>" +
          '<option value="notfollowed">' + esc(T("advice.outcome.notfollowed")) + "</option></select></div>" +
          '<div class="btn-row"><button type="button" class="btn btn-small" data-advice-add>' + esc(T("advice.add")) + "</button></div>" + "</details>";
        adviceSection.innerHTML = h;
        if (wasOpen) { var det = adviceSection.querySelector("details"); if (det) det.open = true; }
        var addBtn = adviceSection.querySelector("[data-advice-add]");
        if (addBtn) addBtn.addEventListener("click", function () {
          if (!adviceVal("liaison").trim() || !adviceVal("claim").trim() || !adviceVal("authority").trim() || !adviceVal("date").trim()) { trackerMsg(box, "form.required"); return; }
          if (ADVICE_OUTCOMES.indexOf(adviceVal("outcome")) < 0) { trackerMsg(box, "form.required"); return; }
          var l = wonderLiaisonAdvice[p.id] || (wonderLiaisonAdvice[p.id] = []);
          l.push({ liaison: adviceVal("liaison"), claim: adviceVal("claim"), authority: adviceVal("authority"), date: adviceVal("date"), outcome: adviceVal("outcome") });
          trackerMsg(box, null);
          renderAdvice();
        });
        Array.prototype.forEach.call(adviceSection.querySelectorAll("[data-advice-rm]"), function (btn) {
          btn.addEventListener("click", function () {
            var l = wonderLiaisonAdvice[p.id] || [];
            l.splice(Number(btn.getAttribute("data-advice-rm")), 1);
            renderAdvice();
          });
        });
      }
      renderAdvice();
      box.appendChild(adviceSection);
      box.appendChild(approveBtn);
      box.appendChild(document.createTextNode(" "));
      box.appendChild(declineBtn);
      /* Agency-request copy control: copies the exact request text with the
         existing copy helper (same copied/failed pattern as share links). */
      if (reqCopyText) {
        var reqCopyBtn = document.createElement("button");
        reqCopyBtn.type = "button";
        reqCopyBtn.className = "btn btn-small";
        reqCopyBtn.textContent = T("wonder.request.copy");
        reqCopyBtn.addEventListener("click", function () {
          copyText(reqCopyText, function (ok) {
            reqCopyBtn.textContent = ok ? T("wonder.request.copied") : T("share.failed");
            setTimeout(function () { reqCopyBtn.textContent = T("wonder.request.copy"); }, 2000);
          });
        });
        box.appendChild(document.createTextNode(" "));
        box.appendChild(reqCopyBtn);
      }
      if (!draftGate(draft)) {
        approveBtn.disabled = true;
        var gateHint = document.createElement("p");
        gateHint.className = "hint";
        gateHint.textContent = T("wonder.nocites");
        box.appendChild(gateHint);
      }
      wonderBox.appendChild(box);
    }
    draftBtn.addEventListener("click", function () {
      draftBtn.disabled = true;
      wonderStatus.textContent = Tf("wonder.drafting", { model: PodiumAI.WONDER_MODEL });
      PodiumAI.draftCommitteeAnswer(p).then(function (draft) {
        draftBtn.disabled = false;
        if (!draft) {
          wonderStatus.textContent = T("wonder.unavailable");
          return;
        }
        wonderDrafts[p.id] = draft;
        audit("draft", p.ref + "-A", "");
        delete wonderApproved[p.id];
        delete wonderLiaisonAdvice[p.id];
        wonderStatus.textContent = "";
        showDraft();
      });
    });
    if (decidedDeclined) {
      var dec = document.createElement("div");
      dec.innerHTML = '<p class="hint">' + esc(T("wonder.declined.note")) + "</p>";
      wonderBox.appendChild(dec);
    } else if ((wonderApproved[p.id] && wonderDrafts[p.id]) || decidedApproved) {
      var doneItem = PodiumStore.briefingItemFor(state, p.id) || {};
      var doneText = doneItem.answer || (wonderDrafts[p.id] && wonderDrafts[p.id].text) || "";
      var doneReq = (doneItem.agencyRequest && doneItem.agencyRequest.agency && doneItem.agencyRequest.ask) ? doneItem.agencyRequest : ((wonderDrafts[p.id] && wonderDrafts[p.id].agencyRequest) || null);
      var doneReqText = (doneReq && doneReq.agency && doneReq.ask) ? Tf("wonder.request.body", { agency: doneReq.agency, ask: doneReq.ask, ref: p.ref }) : "";
      var done = document.createElement("div");
      done.innerHTML = '<p><span class="status-pill">' + esc(T("wonder.approved")) + "</span></p>" +
        "<p>" + esc(displayAnswer(doneText)) + "</p>" +
        approverHtml(doneItem) + standingHtml(doneText) +
        citationsHtml(doneItem, p) +
        (doneReqText ? '<p><span class="zone-label">' + esc(T("wonder.request.label")) + "</span></p>" +
          '<p data-wonder-request>' + esc(doneReqText) + "</p>" : "");
      wireApproverLinks(done);
      if (doneReqText) {
        var doneCopyBtn = document.createElement("button");
        doneCopyBtn.type = "button";
        doneCopyBtn.className = "btn btn-small";
        doneCopyBtn.textContent = T("wonder.request.copy");
        doneCopyBtn.addEventListener("click", function () {
          copyText(doneReqText, function (ok) {
            doneCopyBtn.textContent = ok ? T("wonder.request.copied") : T("share.failed");
            setTimeout(function () { doneCopyBtn.textContent = T("wonder.request.copy"); }, 2000);
          });
        });
        done.appendChild(document.createTextNode(" "));
        done.appendChild(doneCopyBtn);
      }
      wonderBox.appendChild(done);
    } else if (wonderDrafts[p.id]) {
      showDraft();
    }
    return wonderBox;
  }

  /* Settled timing (TY, Oct 28): This Week = the most recently AIRED
     briefing, and only that — it flips only after the Wednesday 1:00 PM ET
     airing. Next Week = the selections for the next briefing, published
     from the Monday draw onward. Derived from briefing datetimes and the
     clock (America/New_York), never from seed statuses. */
  function etNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  }
  /* Derived current cycle, recomputed at every call so a tab left open
     across a week boundary rolls on re-render, not only on reload. */
  function currentCycle() { return PodiumStore.currentCycleId(state, etNow()); }
  /* Render-time "(voting now)" marker: the derived current cycle is the
     voting one; static labels carry no marker since the rollover. */
  function cycleLabel(c) { return c ? c.label + (c.id === currentCycle() ? " (" + T("cycle.voting") + ")" : "") : ""; }
  /* Single parsing implementation lives in PodiumStore (same flip as Replay).
     The year always comes from the cycle's own votingStart, never the clock. */
  function cycleDateTimeFor(c, str) {
    var y = PodiumStore.cycleYear(c);
    return PodiumStore.cycleDateTime(str, y === null ? etNow().getFullYear() : y);
  }
  function renderBriefing() {
    var nowEt = etNow();
    var thisWeek = null, next = null;
    state.cycles.forEach(function (c) {
      var bAt = cycleDateTimeFor(c, c.briefingAt);
      if (!bAt || !c.topPostId) return;
      if (bAt <= nowEt) thisWeek = c; /* cycles are chronological: last aired wins */
      var dAt = cycleDateTimeFor(c, c.drawAt);
      if (bAt > nowEt && (!dAt || dAt <= nowEt)) next = c; /* most recently drawn, unbriefed */
    });
    /* No stale-status fallback: before the first briefing airs, This Week is
       empty (the section renders nothing until a briefing datetime passes). */
    var pl = $("pipelineList");
    pl.innerHTML = "";
    if (thisWeek) {
      $("briefingTitle").textContent = Tf("briefing.title", { date: thisWeek.briefingAt });
      PodiumStore.itemsForCycle(state, thisWeek.id).forEach(function (item) {
        pl.appendChild(briefingSummaryCard(thisWeek, item));
      });
    } else {
      /* 1.0 ships no briefing records: name the empty state. */
      var be = document.createElement("li");
      be.className = "card";
      be.textContent = T("briefing.empty");
      pl.appendChild(be);
    }
    var nl = $("nextList");
    nl.innerHTML = "";
    $("nextSection").hidden = !next;
    if (next) {
      PodiumStore.itemsForCycle(state, next.id).forEach(function (item) {
        nl.appendChild(nextWeekItem(next, item));
      });
    }



    /* draw transparency: most recent completed draw */
    var drawn = next || thisWeek;
    var df = $("drawFacts");
    df.innerHTML = "";
    if (!drawn || !drawn.topPostId) {
      /* 1.0: no posts, no pool, no winner â€” the draw shows pending. */
      var pr = document.createElement("dt"); pr.textContent = T("draw.cycle");
      var pd = document.createElement("dd"); pd.textContent = T("draw.pending");
      df.appendChild(pr); df.appendChild(pd);
      $("excludedHeading").hidden = true;
      $("excludedList").hidden = true;
    } else {
      $("excludedHeading").hidden = false;
      $("excludedList").hidden = false;
      /* Historical record: stored values only, never a live recount — the
         cutoff removes unselected posts, so recounting would rewrite history. */
      var picked = PodiumStore.postById(state, drawn.randomPostId);
      var rows = [
        [T("draw.cycle"), cycleLabel(drawn) + " (" + drawn.range + ")"],
        [T("draw.frozen"), Tf("draw.frozen.val", { cutoff: drawn.cutoffAt, n: drawn.poolSize })],
        [T("draw.beacon"), Tf("draw.beacon.val", { time: drawn.beaconTime, hex: drawn.beaconHex, num: drawn.beaconNum })],
        [T("draw.computation"), Tf("draw.computation.val", { num: drawn.beaconNum, size: drawn.poolSize, r: drawn.position - 1, pos: drawn.position })],
        [T("draw.selected"), picked ? ("\u201c" + excerpt(picked.body, 80) + "\u201d") : "\u2014"]
      ];
      rows.forEach(function (r) {
        var dt = document.createElement("dt"); dt.textContent = r[0];
        var dd = document.createElement("dd"); dd.textContent = r[1];
        df.appendChild(dt); df.appendChild(dd);
      });
      var ex = $("excludedList");
      ex.innerHTML = "";
      var winner = PodiumStore.postById(state, drawn.topPostId);
      var winnerBody = winner.body.trim().toLowerCase();
      PodiumStore.postsForCycle(state, drawn.id)
        .filter(function (p) { return p.id === drawn.topPostId || p.body.trim().toLowerCase() === winnerBody; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; })
        .forEach(function (p) {
          var li = document.createElement("li");
          var isWinner = p.id === drawn.topPostId;
          var by = PodiumStore.citizenById(state, p.authorId);
          li.innerHTML = "<strong>" + esc(by.name) + "</strong>" + stateSuffix(p) + " " +
            '<span class="ref-code">' + esc(p.ref || "") + "</span> \u201c" + esc(excerpt(p.body, 120)) + "\u201d \u2014 " +
            (isWinner ? T("draw.winner") : T("draw.dupe")) + " ";
          var full = document.createElement("div");
          full.hidden = true;
          full.innerHTML = "<blockquote>" + esc(p.body) + "</blockquote>";
          li.appendChild(full);
          var toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "btn btn-small";
          toggle.textContent = T("draw.readfull");
          toggle.setAttribute("aria-expanded", "false");
          toggle.addEventListener("click", function () {
            full.hidden = !full.hidden;
            toggle.setAttribute("aria-expanded", String(!full.hidden));
            toggle.textContent = full.hidden ? T("draw.readfull") : T("draw.collapse");
          });
          li.appendChild(document.createTextNode(" "));
          li.appendChild(toggle);
          ex.appendChild(li);
        });
    }
  }

  /* ---------- prior posts & answers / status updates ---------- */
  /* Visibility gating (TY, Oct 28): Prior and Status list ONLY selections
     whose briefing has aired. Reuses the aired-cycle rule built for This
     Week / Replay (PodiumStore.replayCycles) — no second timing rule. */
  function airedCycleIds() {
    var ids = {};
    PodiumStore.replayCycles(state, etNow()).forEach(function (c) { ids[c.id] = true; });
    return ids;
  }
  function airedBriefingItems() {
    var ok = airedCycleIds();
    return state.briefingItems.filter(function (b) { return !!ok[b.cycleId]; });
  }
  function defaultAiredBriefing() {
    var items = airedBriefingItems();
    if (!items.length) return null;
    var cycles = PodiumStore.replayCycles(state, etNow()); /* newest first */
    for (var i = 0; i < cycles.length; i++) {
      var top = null, first = null;
      items.forEach(function (b) {
        if (b.cycleId === cycles[i].id) {
          if (!first) first = b;
          if (b.selection === "top") top = b;
        }
      });
      if (top || first) return top || first;
    }
    return items[0];
  }
  function fillThreadSelect(sel) {
    airedBriefingItems().forEach(function (b) {
      var c = PodiumStore.cycleById(state, b.cycleId);
      var p = PodiumStore.postById(state, b.postId);
      var o = document.createElement("option");
      o.value = b.postId;
      o.textContent = cycleLabel(c) + " \u00b7 " + (b.selection === "top" ? T("thread.top") : T("thread.random")) + " \u00b7 " + (p.ref || "") + " \u00b7 " + excerpt(p.body, 40);
      sel.appendChild(o);
    });
    var d = defaultAiredBriefing();
    if (d) sel.value = d.postId;
  }
  /* Dropdown options are rebuilt on every render (never filled once): after a
     briefing flip, new aired selections appear without a reload. The current
     selection is preserved when it still exists, else the default applies. */
  function threadSelect(sel, onChange) {
    var cur = sel.value;
    sel.innerHTML = "";
    fillThreadSelect(sel);
    var has = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === cur) { has = true; break; }
    }
    if (has && cur) sel.value = cur;
    if (!sel.dataset.bound) { sel.dataset.bound = "1"; sel.addEventListener("change", onChange); }
    return sel;
  }
  /* Aired-only: with no aired briefing the fallback is null (the empty
     state), never an un-aired record. Identical whenever an aired record
     exists — defaultAiredBriefing already prefers the most recent aired. */
  function selectedBriefing(selId) {
    var b = PodiumStore.briefingItemFor(state, $(selId).value);
    if (b && airedCycleIds()[b.cycleId]) return b;
    return defaultAiredBriefing();
  }
  function selectionTitle(b) {
    var c = PodiumStore.cycleById(state, b.cycleId);
    return esc(cycleLabel(c)) + " \u00b7 " + (b.selection === "top" ? T("seltitle.top") : T("seltitle.random"));
  }
  /* Tracker: "We can't do this" + "Why can't we do this?".
     Display + record only. Stored status stays "No Action"; Tstatus renders
     it as "We can't do this." in both languages. All mutations go through the
     PodiumStore validators and persist via save. */
  function todayShort() {
    try { return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }); }
    catch (e) { return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  }
  function isAuthor(p) { return !!(state.currentUserId && p && state.currentUserId === p.authorId); }
  function respondedBy(b, by, kind, id) {
    var rs = (b && b.responses) || [];
    for (var i = 0; i < rs.length; i++) {
      if (rs[i] && rs[i].by === by && rs[i].kind === kind && String(rs[i].id) === String(id)) return true;
    }
    return false;
  }
  function noActionHtml(b) {
    if (!b || b.trackerStatus !== "No Action") return "";
    return '<div class="zone zone-answer"><span class="zone-label">' + esc(T("noaction.label")) + "</span>" +
      "<p><strong>" + esc(T("noaction.authority")) + ":</strong> " + esc(b.citedAuthority || "") + "</p>" +
      "<p><strong>" + esc(T("noaction.change")) + ":</strong> " + esc(b.whatWouldChange || "") + "</p>" +
      "<p><strong>" + esc(T("noaction.redirect")) + ":</strong> " + esc(b.redirectTo || "") + "</p>" +
      (b.committeeVote ? '<p class="hint">' + esc(T("noaction.vote")) + "</p>" : "") + "</div>";
  }
  function appealsHtml(b, p) {
    var ap = (b && b.appeals) || [], out = "", i;
    for (i = 0; i < ap.length; i++) {
      var a = ap[i];
      out += '<div class="zone zone-answer"><span class="zone-label">' + esc(Tf("appeal.by", { name: a.name, date: a.date })) + "</span>";
      out += a.outcome
        ? "<p>" + esc(a.outcome.decision === "upheld" ? T("rereview.outcome.upheld") : T("rereview.outcome.rejected")) + (a.outcome.note ? " \u2014 " + esc(a.outcome.note) : "") + (a.outcome.date ? " (" + esc(a.outcome.date) + ")" : "") + "</p>"
        : '<p class="hint">' + esc(T("appeal.awaiting")) + "</p>" +
          '<div class="field"><label>' + esc(T("rereview.legend")) + "</label>" +
          '<textarea data-rr-note rows="2" placeholder="' + esc(T("rereview.note.ph")) + '"></textarea></div>' +
          '<div class="btn-row"><button type="button" class="btn btn-small" data-act="rereview-uphold">' + esc(T("rereview.uphold")) + "</button>" +
          '<button type="button" class="btn btn-small" data-act="rereview-reject">' + esc(T("rereview.reject")) + "</button></div>";
      out += "</div>";
    }
    if (b && b.trackerStatus === "No Action" && isAuthor(p) && !PodiumStore.appealFor(b, b.determinationId || 0)) {
      out += '<div class="btn-row"><button type="button" class="btn btn-small" data-act="appeal">' + esc(T("appeal.button")) + "</button></div>";
    }
    return out;
  }
  function responsesHtml(b, p, kind, id) {
    var rs = ((b && b.responses) || []).filter(function (r) { return r && r.kind === kind && String(r.id) === String(id); });
    var out = "";
    for (var i = 0; i < rs.length; i++) {
      out += '<p class="hint">' + esc(T("response.legend")) + " \u2014 " + esc(rs[i].name) + ", " + esc(rs[i].date) + ": " + esc(rs[i].text) + "</p>";
    }
    if (isAuthor(p)) {
      if (respondedBy(b, state.currentUserId, kind, id)) {
        out += '<p class="hint">' + esc(T("response.done")) + "</p>";
      } else {
        out += '<div class="field"><label>' + esc(T("response.legend")) + "</label>" +
          '<textarea data-field="response-text" data-kind="' + esc(kind) + '" data-id="' + esc(String(id)) + '" rows="2" placeholder="' + esc(T("response.ph")) + '"></textarea></div>' +
          '<div class="btn-row"><button type="button" class="btn btn-small" data-act="respond" data-kind="' + esc(kind) + '" data-id="' + esc(String(id)) + '">' + esc(T("response.submit")) + "</button></div>";
      }
    }
    return out;
  }
  function challengeHtml(b, p, ch) {
    var out = '<div class="zone zone-answer"><span class="zone-label">' + esc(T("challenge.name")) + "</span>" +
      "<p><strong>" + esc(T("challenge.solution.label")) + ":</strong> " + esc(ch.solution) + "</p>" +
      '<p class="hint">' + esc(Tf("challenge.by", { name: ch.raisedName, date: ch.date })) + "</p>";
    if (ch.status === "answered" && ch.answer) {
      out += '<p><span class="zone-label">' + esc(T("challenge.answer.legend")) + "</span></p>" +
        "<p>" + esc(ch.answer.text) + (ch.answer.date ? " (" + esc(ch.answer.date) + ")" : "") + "</p>" +
        "<p><strong>" + esc(T("noaction.authority")) + ":</strong> " + esc(ch.answer.citedAuthority || "") + "</p>" +
        "<p><strong>" + esc(T("noaction.change")) + ":</strong> " + esc(ch.answer.whatWouldChange || "") + "</p>" +
        "<p><strong>" + esc(T("noaction.redirect")) + ":</strong> " + esc(ch.answer.redirectTo || "") + "</p>";
    } else {
      out += '<p class="hint">' + esc(T("challenge.awaiting")) + "</p>" +
        '<div class="field"><label>' + esc(T("challenge.answer.legend")) + "</label>" +
        '<textarea data-ans="text" data-id="' + esc(ch.id) + '" rows="2" placeholder="' + esc(T("challenge.answer.ph")) + '"></textarea></div>' +
        '<div class="field"><label>' + esc(T("noaction.authority")) + "</label>" +
        '<textarea data-ans="citedAuthority" data-id="' + esc(ch.id) + '" rows="2"></textarea></div>' +
        '<div class="field"><label>' + esc(T("noaction.change")) + "</label>" +
        '<textarea data-ans="whatWouldChange" data-id="' + esc(ch.id) + '" rows="2"></textarea></div>' +
        '<div class="field"><label>' + esc(T("noaction.redirect")) + "</label>" +
        '<textarea data-ans="redirectTo" data-id="' + esc(ch.id) + '" rows="2"></textarea></div>' +
        '<div class="btn-row"><button type="button" class="btn btn-small" data-act="challenge-answer" data-id="' + esc(ch.id) + '">' + esc(T("challenge.answer.submit")) + "</button></div>";
    }
    out += responsesHtml(b, p, "challenge", ch.id) + "</div>";
    return out;
  }
  function challengesHtml(b, p) {
    var ch = (b && b.challenges) || [], out = "";
    out += '<p><span class="zone-label">' + esc(T("challenge.legend")) + "</span></p>";
    for (var i = 0; i < ch.length; i++) out += challengeHtml(b, p, ch[i]);
    out += '<div class="field"><label>' + esc(T("challenge.solution.label")) + "</label>" +
      '<textarea data-field="challenge-solution" rows="2" placeholder="' + esc(T("challenge.solution.ph")) + '"></textarea></div>' +
      '<div class="btn-row"><button type="button" class="btn btn-small" data-act="challenge-raise">' + esc(T("challenge.raise")) + "</button></div>";
    return out;
  }
  function trackerHtml(b, p) {
    if (!b || !p) return "";
    return noActionHtml(b) + appealsHtml(b, p) + challengesHtml(b, p) +
      responsesHtml(b, p, "record", "record");
  }
  function trackerMsg(root, key) {
    var m = root.querySelector(".tracker-msg");
    if (!m) {
      m = document.createElement("p");
      m.className = "hint tracker-msg";
      root.appendChild(m);
    }
    m.textContent = key ? T(key) : "";
  }
  function trackerVal(root, sel, idAttr, idVal) {
    var q = idVal == null ? sel : sel + '[' + idAttr + '="' + idVal + '"]';
    var el = root.querySelector(q);
    return el ? el.value : "";
  }
  function wireTracker(root, b, p, rerender) {
    if (!root || !b || !p) return;
    function fail(key) { trackerMsg(root, key); }
    function ok(rerun) {
      try { PodiumStore.save(state); } catch (e) { /* session-only fallback */ }
      trackerMsg(root, null);
      rerun();
    }
    var ap = root.querySelector('[data-act="appeal"]');
    if (ap) ap.addEventListener("click", function () {
      var me = PodiumStore.citizenById(state, state.currentUserId);
      var r = PodiumStore.fileAppeal(b, { by: state.currentUserId, name: me ? me.name : "", date: todayShort() });
      if (!r.ok) { fail("form.required"); return; }
      ok(rerender);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-act="rereview-uphold"], [data-act="rereview-reject"]'), function (btn) {
      btn.addEventListener("click", function () {
        var note = trackerVal(root, "[data-rr-note]");
        var r = PodiumStore.reviewAppeal(b, { decision: btn.getAttribute("data-act") === "rereview-uphold" ? "upheld" : "reinstated", note: note, date: todayShort() });
        if (!r.ok) { fail("form.required"); return; }
        ok(rerender);
      });
    });
    var raise = root.querySelector('[data-act="challenge-raise"]');
    if (raise) raise.addEventListener("click", function () {
      var me = PodiumStore.citizenById(state, state.currentUserId);
      var sol = trackerVal(root, '[data-field="challenge-solution"]');
      if (!sol.trim()) { fail("form.required"); return; }
      var r = PodiumStore.raiseChallenge(b, { by: state.currentUserId, name: me ? me.name : "", date: todayShort(), solution: sol });
      if (!r.ok) { fail("form.required"); return; }
      ok(rerender);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-act="challenge-answer"]'), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var f = {
          text: trackerVal(root, '[data-ans="text"]', "data-id", id),
          citedAuthority: trackerVal(root, '[data-ans="citedAuthority"]', "data-id", id),
          whatWouldChange: trackerVal(root, '[data-ans="whatWouldChange"]', "data-id", id),
          redirectTo: trackerVal(root, '[data-ans="redirectTo"]', "data-id", id),
          date: todayShort()
        };
        if (!f.citedAuthority.trim()) { fail("noaction.authority.required"); return; }
        if (!f.text.trim() || !f.whatWouldChange.trim() || !f.redirectTo.trim()) { fail("form.required"); return; }
        var r = PodiumStore.answerChallenge(b, id, f);
        if (!r.ok) { fail("form.required"); return; }
        ok(rerender);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-act="respond"]'), function (btn) {
      btn.addEventListener("click", function () {
        var me = PodiumStore.citizenById(state, state.currentUserId);
        var kind = btn.getAttribute("data-kind"), id = btn.getAttribute("data-id");
        var ta = root.querySelector('[data-field="response-text"][data-kind="' + kind + '"][data-id="' + id + '"]');
        var text = ta ? ta.value : "";
        if (!text.trim()) { fail("form.required"); return; }
        var r = PodiumStore.addResponse(b, { by: state.currentUserId, name: me ? me.name : "", date: todayShort(), text: text, kind: kind, id: id });
        if (!r.ok) { fail(r.reason === "already-responded" ? "response.done" : "form.required"); return; }
        ok(rerender);
      });
    });
  }

  function renderPrior() {
    threadSelect($("priorSelect"), renderPriorCard);
    renderPriorCard();
  }
  function renderPriorCard() {
    var b = selectedBriefing("priorSelect");
    var p = b && PodiumStore.postById(state, b.postId);
    if (!b || !p) { $("priorCard").textContent = T("prior.empty"); return; }
    var author = PodiumStore.citizenById(state, p.authorId);
    var card = $("priorCard");
    var html = "<h3>" + selectionTitle(b) + "</h3>" +
      stageHtml(displayPipeline(PodiumStore.cycleById(state, b.cycleId), b.pipeline)) +
      '<p><span class="ref-code">' + esc(p.ref || "") + "</span></p>" +
      '<div class="zone zone-post"><span class="zone-label">' + esc(T("zone.post.final")) + "</span>" +
      "<blockquote>" + esc(p.body) + "</blockquote>" +
      '<p class="hint">\u2014 ' + esc(author.name) + stateSuffix(p) + langSuffix(p) + " \u00b7 " + esc(Ttopic(p.topic)) + " \u00b7 " + votesLabel(p.votes) + "</p></div>" + sealHtml(p) +
      translateSlotHtml(p) +
      '<div class="zone zone-answer"><span class="zone-label">' + esc(T("thread.answer")) + "</span>" +
      '<p><span class="ref-code">' + esc(answerCode(p)) + "</span></p>" +
      "<p>" + esc(displayAnswer(b.answer)) + "</p>" + approverHtml(b) + standingHtml(b.answer) + citationsHtml(b, p) + "</div>";
    var last = b.updates[b.updates.length - 1];
    if (last) {
      html += '<div class="zone zone-answer"><span class="zone-label">' + esc(T("prior.updatelatest")) + "</span>" +
        '<p><span class="ref-code">' + esc(updateCode(p, b.updates.length - 1)) + "</span> <strong>" + esc(last.date) + "</strong></p>" +
        "<p>" + esc(last.text) + "</p>" +
        '<p>' + esc(T("prior.status")) + ' <span class="status-pill">' + esc(Tstatus(b.trackerStatus)) + "</span>" +
        (b.trackerStatus === "No Action" && b.officialReason ? " \u2014 " + esc(b.officialReason) : "") + "</p>" + responsesHtml(b, p, "update", b.updates.length - 1) + "</div>";
    }
    html += trackerHtml(b, p);
    card.innerHTML = html;
    wireTracker(card, b, p, renderPriorCard);
    wireApproverLinks(card);
    mountTranslateSlots(card);
    var link = document.createElement("button");
    link.type = "button";
    link.className = "btn btn-small";
    link.textContent = Tf("prior.tostatus", { ref: p.ref || T("thread.thispost") });
    link.addEventListener("click", function () {
      threadSelect($("statusSelect"), renderStatusCard).value = p.id;
      showView("status");
    });
    card.appendChild(link);
  }
  /* System issues (TY, Nov 4): tracked-category help requests listed on the
     Status Updates tab so the committee can follow through. How-to questions
     stay in the help box and never appear here. */
  function helpCatLabel(c) { var k = "help.cat." + (c || "other"); try { var s = T(k); return (s === k || !s) ? String(c || "") : s; } catch (e) { return String(c || ""); } }
  function renderSysIssues() {
    setText("sysIssuesHeading", T("help.issues"));
    var card = $("sysIssuesCard"), head = $("sysIssuesHeading");
    if (!card) return;
    var list = (state.sysIssues || []).slice().reverse();
    if (!list.length) { card.innerHTML = ""; card.hidden = true; if (head) head.hidden = true; return; }
    card.hidden = false; if (head) head.hidden = false;
    var html = '<ul class="updates">';
    list.forEach(function (it) {
      html += "<li><strong>" + esc(it.t || "") + "</strong> \u00b7 " + esc(helpCatLabel(it.category)) +
        "<br>" + esc(it.question || "") + "<br>" + esc(it.answer || "") + "</li>";
    });
    card.innerHTML = html + "</ul>";
  }
  function renderStatus() {
    threadSelect($("statusSelect"), renderStatusCard);
    renderStatusCard();
    renderSysIssues();
    renderAudit();
  }
  /* Audit-log section (TY, Nov 3): newest entries first, each with its
     timestamp, event, ref, and short hash, plus the chain-integrity line.
     Display-only; the chain itself lives in the saved state. */
  function renderAudit() {
    var card = $("auditCard");
    if (!card) return;
    setText("auditHeading", T("audit.heading"));
    var v = PodiumStore.verifyAudit(state.audit);
    var html = "<p>" + esc(T("audit.lede")) + "</p>" +
      '<p class="hint">' + esc(v.ok ? T("audit.intact") : Tf("audit.broken", { n: v.index })) + "</p>" +
      '<ul class="updates">';
    (state.audit || []).slice().reverse().forEach(function (e) {
      html += "<li><strong>" + esc(e.t) + "</strong> \u00b7 " + esc(auditEvLabel(e.ev)) +
        (e.ref ? ' \u00b7 <span class="ref-code">' + esc(e.ref) + "</span>" : "") +
        ' \u00b7 <span class="ref-code">' + esc(String(e.h || "").slice(0, 12)) + "</span>";
      if (e.ev === "liaisonAdvice") {
        var adv = null;
        try { adv = JSON.parse(e.d || ""); } catch (err) { adv = null; }
        if (adv) html += ' <span class="hint">' + esc(adv.liaison || "") + " \u2014 " + esc(adv.claim || "") + " (" + esc(adviceOutcomeLabel(adv.outcome)) + ")</span>";
      }
      html += "</li>";
    });
    html += "</ul>";
    card.innerHTML = html;
  }
  function renderStatusCard() {
    var b = selectedBriefing("statusSelect");
    var p = b && PodiumStore.postById(state, b.postId);
    if (!b || !p) { $("statusCard").textContent = T("status.empty"); return; }
    var author = PodiumStore.citizenById(state, p.authorId);
    var card = $("statusCard");
    var html = "<h3>" + selectionTitle(b) + "</h3>" +
      '<p><span class="ref-code">' + esc(p.ref || "") + "</span> " + esc(author.name) + stateSuffix(p) + langSuffix(p) + " \u00b7 " + esc(T("prior.status")) + ' <span class="status-pill">' + esc(Tstatus(b.trackerStatus)) + "</span>" +
      (b.trackerStatus === "No Action" && b.officialReason ? " \u2014 " + esc(b.officialReason) : "") + "</p>" + sealHtml(p) +
      approverHtml(b) + standingHtml(b.answer) + citationsHtml(b, p) +
      "<h4>" + esc(T("status.dated")) + "</h4>" + '<ul class="updates">' +
      b.updates.map(function (u, i) { return "<li><span class=\"ref-code\">" + esc(updateCode(p, i)) + "</span> <strong>" + esc(u.date) + ":</strong> " + esc(u.text) + responsesHtml(b, p, "update", i) + "</li>"; }).join("") +
      "</ul>" + trackerHtml(b, p);
    card.innerHTML = html;
    wireTracker(card, b, p, renderStatusCard);
    wireApproverLinks(card);
    var back = document.createElement("button");
    back.type = "button";
    back.className = "btn btn-small";
    back.textContent = Tf("status.toprior", { ref: p.ref || T("thread.thispost") });
    back.addEventListener("click", function () {
      threadSelect($("priorSelect"), renderPriorCard).value = p.id;
      showView("prior");
    });
    card.appendChild(back);
  }

  /* ---------- share + deep links ---------- */
  function postUrl(id) {
    return window.location.href.split("#")[0] + "#post/" + id;
  }
  function copyText(text, done) {
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        done(ok);
      } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }
  function doShare(p, btn) {
    var url = postUrl(p.id);
    if (navigator.share) {
      /* Some environments expose share without ever settling it; fall back
         to copy so the control always completes. A real dismiss stays
         a no-op. */
      var settled = false;
      var shareTimer = setTimeout(function () {
        if (!settled) { settled = true; copyShareLink(url, btn); }
      }, 5000);
      navigator.share({ title: "The Podium", text: excerpt(p.body, 140), url: url })
        .then(function () { settled = true; clearTimeout(shareTimer); },
          function (e) {
            settled = true; clearTimeout(shareTimer);
            /* Genuine user cancel stays a no-op; any other failure (not
               allowed, not supported) falls back to copy. */
            if (!e || e.name !== "AbortError") copyShareLink(url, btn);
          });
      return;
    }
    copyShareLink(url, btn);
  }
  function copyShareLink(url, btn) {
    copyText(url, function (ok) {
      btn.textContent = ok ? T("share.copied") : T("share.failed");
      setTimeout(function () { btn.textContent = T("share.button"); }, 2000);
    });
  }
  function clearDeepLink() {
    linkedPostId = null;
    linkedSuffix = null;
    linkMissing = false;
    lastCodeJump = null;
    try {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    } catch (e) { /* file:// may refuse: hash stays but view resets */ }
    renderFeed();
  }
  function handleDeepLink() {
    var m = /^#post\/([A-Za-z0-9-]+)/.exec(window.location.hash || "");
    if (!m) {
      if (linkedPostId || linkMissing) { linkedPostId = null; linkedSuffix = null; linkMissing = false; renderFeed(); }
      return;
    }
    var key = m[1];
    var post = PodiumStore.postById(state, key);
    var suffix = null;
    if (!post) {
      var cm = /^([A-Za-z])-(\d+)(?:-(A|U\d+))?$/.exec(key);
      if (cm) {
        var base = cm[1].toUpperCase() + "-" + (cm[2].length > 4 ? cm[2] : ("0000" + cm[2]).slice(-4));
        post = PodiumStore.postByRef(state, base);
        if (post && cm[3]) suffix = cm[3].toUpperCase();
        if (suffix === "U0") suffix = null; /* updates start at U1 */
      }
    }
    if (post) {
      linkedPostId = post.id;
      linkedSuffix = suffix;
      linkMissing = false;
      showView("feed");
      renderFeed();
    } else {
      linkedPostId = null;
      linkedSuffix = null;
      linkMissing = true;
      showView("feed");
      renderFeed();
    }
  }
  window.addEventListener("hashchange", handleDeepLink);

  /* ---------- watch live ---------- */

  var watchSticky = null; /* bar/tick marker for a library replay in flight */
  var watchShownState = null; /* state currently rendered, for clock transitions */
  var watchRAF = null;

  var LIVE_START_H = 13, LIVE_LEN_MIN = 30; /* Wed 1:00-1:30 PM ET */

  function etParts(when) {
    var parts = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York",
      weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
      month: "short", day: "numeric" })
      .formatToParts(when || new Date()).forEach(function (x) { parts[x.type] = x.value; });
    parts.hourNum = parseInt(parts.hour, 10) % 24;
    parts.minuteNum = parseInt(parts.minute, 10);
    return parts;
  }
  function clockIsLive(now) {
    var p = etParts(now);
    return p.weekday === "Wed" && p.hourNum === LIVE_START_H && p.minuteNum < LIVE_LEN_MIN;
  }
  function nextAiring() {
    var now = new Date();
    if (clockIsLive(now)) return { live: true, label: null };
    for (var i = 0; i < 8; i++) {
      var d = new Date(now.getTime() + i * 86400000);
      var p = etParts(d);
      if (p.weekday !== "Wed") continue;
      if (i === 0 && (p.hourNum > LIVE_START_H || (p.hourNum === LIVE_START_H && p.minuteNum >= LIVE_LEN_MIN))) continue;
      return { live: false, label: "Wednesday, " + p.month + " " + p.day };
    }
    /* Always returns: any 8 consecutive days contain a Wednesday, so the
       loop meets one by i === 7 at the latest and returns there. */
  }
  /* Watch agenda from datetimes, never frozen seed flags (TY, Oct 28):
     the briefing on air now is the latest briefing datetime at or before
     now (live window only, and only when that briefing is today); otherwise
     the bill is the next briefing datetime after now. Null when no future
     briefing exists — the view then says the agenda is to be announced.
     Seed statuses are ignored (kept in seed/saves only for compatibility). */
  function sameEtDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function agendaCycle() {
    var nowEt = etNow();
    var past = null, future = null;
    state.cycles.forEach(function (c) {
      var bAt = cycleDateTimeFor(c, c.briefingAt);
      if (!bAt) return;
      if (bAt <= nowEt) past = c; /* chronological: last aired-or-airing wins */
      else if (!future) future = c; /* chronological: first upcoming wins */
    });
    if (clockIsLive()) {
      if (!past) return null;
      var pAt = cycleDateTimeFor(past, past.briefingAt);
      return (pAt && sameEtDay(pAt, nowEt)) ? past : null;
    }
    return future;
  }
  function watchState() {
    return clockIsLive() ? "live" : "upcoming";
  }
  function fullRecordButton(postId, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-small";
    b.textContent = label || T("feed.fullrecord");
    b.addEventListener("click", function () {
      threadSelect($("priorSelect"), renderPriorCard).value = postId;
      showView("prior");
    });
    return b;
  }

  function renderWatch() {
    stopWatchPlayback();
    watchSticky = null;
    var st = watchState();
    watchShownState = st;
    var main = $("watchMain");
    main.innerHTML = "";
    main.hidden = (st === "replay");
    if (st === "upcoming") renderUpcoming(main);
    else if (st === "live") { renderLive(main, null); }
    renderLibrary();

  }
  function renderUpcoming(main) {
    var nx = nextAiring();
    var h = document.createElement("h3");
    h.textContent = nx.live ? T("watch.onair") : Tf("watch.next", { label: nx.label });
    main.appendChild(h);
    var cyc = agendaCycle();
    if (!cyc) {
      var none = document.createElement("p");
      none.textContent = T("watch.noagenda");
      main.appendChild(none);
    } else if (!PodiumStore.itemsForCycle(state, cyc.id).length) {
      /* Agenda known but nothing drawn yet (the static seed never draws
         future cycles): name the wait instead of an empty bill. The draw
         sentence appears only while the stored draw datetime is still in
         the future, so the note stays true after the date passes too. */
      var pend = document.createElement("p");
      var txt = T("watch.noselect");
      if (cyc.drawAt) {
        var dAt = cycleDateTimeFor(cyc, cyc.drawAt);
        if (dAt && dAt > etNow()) txt += " " + Tf("watch.draw", { date: cyc.drawAt });
      }
      pend.textContent = txt;
      main.appendChild(pend);
    } else {
      var sub = document.createElement("p");
      sub.textContent = Tf("watch.onbill", { cycle: cycleLabel(cyc) });
      main.appendChild(sub);
      var ul = document.createElement("ul");
      ul.className = "watch-library";
      PodiumStore.itemsForCycle(state, cyc.id).forEach(function (item) {
        var p = PodiumStore.postById(state, item.postId);
        var author = PodiumStore.citizenById(state, p.authorId);
        var li = document.createElement("li");
        li.className = "card";
        li.innerHTML = "<p>" + selectionBadge(cyc, item, p) + "</p>" +
          '<p><span class="ref-code">' + esc(p.ref || "") + "</span> <strong>" + esc(author.name) + "</strong> \u00b7 " + esc(Ttopic(p.topic)) + "</p>";
        li.appendChild(fullRecordButton(p.id, Tf("feed.fullrecord.ref", { ref: p.ref || "" })));
        ul.appendChild(li);
      });
      main.appendChild(ul);
    }
    var note = document.createElement("p");
    note.className = "hint";
    note.textContent = T("watch.hint");
    main.appendChild(note);
  }
  function liveItems(cyc) {
    return cyc ? PodiumStore.itemsForCycle(state, cyc.id) : [];
  }
  /* Real replay video: a cycle carrying replaySrc plays its video file in
     the player. 1.0 ships no replaySrc, so every library entry opens the
     screening view through the same player. */
  function replayBar(live) {
    var bar = document.createElement("div");
    bar.className = "player-bar";
    var badge = document.createElement("span");
    badge.className = "live-badge";
    badge.textContent = live ? T("watch.live.badge") : T("watch.replay.badge");
    bar.appendChild(badge);
    return bar;
  }
  function renderVideoReplay(player, rc) {
    var v = document.createElement("video");
    v.setAttribute("controls", "");
    v.preload = "metadata";
    v.src = rc.replaySrc;
    v.addEventListener("error", function () {
      if (v.dataset.stopped || !v.parentNode) return;
      /* Fallback: file missing or unloadable. Show the empty-library note, so the tab never breaks or blanks. */
      player.innerHTML = "";
      var fb = document.createElement("p");
      fb.textContent = T("watch.library.empty");
      player.appendChild(fb);
    });
    player.appendChild(v);
    player.appendChild(replayBar(false));
    return v;
  }
  function renderLive(main, replayId) {
    var items, live;
    var rc = replayId ? PodiumStore.cycleById(state, replayId) : null;
    if (replayId) {
      items = liveItems(rc);
      live = false;
    } else {
      items = liveItems(agendaCycle());
      live = true;
    }
    if (live && !items.length) {
      /* 1.0 ships no briefings, so there is nothing to air: standby only,
         no player at all. */
      var st = document.createElement("p");
      st.className = "standby";
      st.textContent = T("watch.standby");
      main.appendChild(st);
      return;
    }
    var player = document.createElement("div");
    player.className = "player";
    var videoEl = null;
    if (!live && rc && rc.replaySrc) {
      videoEl = renderVideoReplay(player, rc);
    } else {
      player.appendChild(replayBar(live));
    }
    main.appendChild(player);
    main.appendChild(buildNowReading(live, items));
    if (videoEl) {
      /* The open click is a user gesture: try to play; if the browser
         blocks it, controls remain so the user can press play manually. */
      try {
        var pr = videoEl.play();
        if (pr && pr.catch) pr.catch(function () {});
      } catch (e) {}
    }
  }
  /* One screening entry: selection badge, the Citizen Post block, the
     Committee Answer block (omitted when the item has no answer text),
     and that post's Full record button. Same blocks the single-item view
     used; the replay loop below just stacks one per item. */
  function screeningEntry(item) {
    var frag = document.createDocumentFragment();
    var p = PodiumStore.postById(state, item.postId);
    if (!p) return frag;
    var badge = document.createElement("p");
    badge.innerHTML = selectionBadge(PodiumStore.cycleById(state, p.cycleId), item, p);
    frag.appendChild(badge);
    var z = document.createElement("div");
    z.className = "zone zone-post";
    z.innerHTML = '<span class="zone-label">' + esc(T("zone.post.screening")) + "</span>" +
      '<p><span class="ref-code">' + esc(p.ref || "") + "</span>" + langSuffix(p) + "</p>" +
      "<blockquote>" + esc(p.body) + "</blockquote>";
    frag.appendChild(z);
    var zSeal = document.createElement("div");
    zSeal.innerHTML = sealHtml(p);
    frag.appendChild(zSeal);
    if (item.answer) {
      var za = document.createElement("div");
      za.className = "zone zone-answer";
      za.innerHTML = '<span class="zone-label">' + esc(T("zone.answer.screening")) + "</span>" +
        '<p><span class="ref-code">' + esc(answerCode(p)) + "</span></p>" +
        "<blockquote>" + esc(displayAnswer(item.answer)) + "</blockquote>";
      frag.appendChild(za);
    }
    frag.appendChild(fullRecordButton(p.id, Tf("feed.fullrecord.ref", { ref: p.ref || "" })));
    return frag;
  }
  function buildNowReading(live, items) {
    var nr = document.createElement("div");
    nr.className = "now-reading";
    nr.id = "nowReading";
    if (!live) {
      /* Replay "Screening" view: the FULL record — every item in order
         (top-voted first), each with its badge, post block, answer block,
         and Full record button. A replay is a record, not a timed
         broadcast, so stacking needs no new state or controls. The live
         "Now reading" path below is untouched. Shared by the video and
         slate replay paths. */
      nr.setAttribute("data-idx", 0);
      var h = document.createElement("h3");
      h.textContent = T("watch.screening");
      nr.appendChild(h);
      items.forEach(function (item) { nr.appendChild(screeningEntry(item)); });
      if (!items.length) nr.appendChild(document.createTextNode(T("watch.noitems")));
      return nr;
    }
    var idx = (items.length > 1 && etParts().minuteNum >= 15) ? 1 : 0;
    nr.setAttribute("data-idx", idx);
    var first = items[idx] ? PodiumStore.postById(state, items[idx].postId) : null;
    if (!first) {
      nr.textContent = T("watch.noitems");
      return nr;
    }
    var hl = document.createElement("h3");
    hl.textContent = Tf("watch.nowreading", { i: idx + 1, n: items.length });
    nr.appendChild(hl);
    var z = document.createElement("div");
    z.className = "zone zone-post";
    z.innerHTML = '<span class="zone-label">' + esc(T("zone.post.screening")) + "</span>" +
      '<p><span class="ref-code">' + esc(first.ref || "") + "</span></p>" +
      "<blockquote>" + esc(first.body) + "</blockquote>";
    nr.appendChild(z);
    var zSeal = document.createElement("div");
    zSeal.innerHTML = sealHtml(first);
    nr.appendChild(zSeal);
    nr.appendChild(fullRecordButton(first.id, Tf("feed.fullrecord.ref", { ref: first.ref || "" })));
    return nr;
  }
  function refreshNowReading(nrEl) {
    var items = liveItems(agendaCycle());
    var want = (items.length > 1 && etParts().minuteNum >= 15) ? 1 : 0;
    if (Number(nrEl.getAttribute("data-idx")) === want) return;
    nrEl.parentNode.replaceChild(buildNowReading(true, items), nrEl);
  }
  /* Replay timing (TY, Oct 28): the Replay library flips exactly like This
     Week — a cycle appears only once its briefing datetime has passed
     (newest briefing first), so the upcoming briefing never shows early.
     A briefed cycle with no replay video attached shows an honest
     "Replay processing, available soon" placeholder instead of silence
     and never an old replay mislabeled as the new one. Entries without a video show the honest placeholder instead. */
  function replayPlaceholder(c) {
    var p = document.createElement("p");
    p.className = "hint";
    p.textContent = Tf("watch.processing.full", { cycle: cycleLabel(c), date: c.briefingAt });
    return p;
  }
  function stopReplayButton(main) {
    var stop = document.createElement("button");
    stop.type = "button";
    stop.className = "btn btn-small";
    stop.textContent = T("watch.stop");
    stop.addEventListener("click", function () { renderWatch(); window.scrollTo(0, 0); });
    main.appendChild(stop);
  }
  function renderLibrary() {
    var ul = $("watchLibrary");
    ul.innerHTML = "";
    var past = PodiumStore.replayCycles(state, etNow());
    if (!past.length) {
      var li0 = document.createElement("li");
      li0.textContent = T("watch.library.empty");
      ul.appendChild(li0);
      return;
    }
    past.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "card";
      var names = PodiumStore.itemsForCycle(state, c.id).map(function (b) {
        var p = PodiumStore.postById(state, b.postId);
        return (b.selection === "top" ? T("lib.top") : T("lib.random")) + " " + (p.ref || "");
      }).join("; ");
      li.innerHTML = "<p><strong>" + esc(cycleLabel(c)) + "</strong> \u00b7 " + esc(T("watch.library.aired")) + " " + esc(c.briefingAt) + "</p>" +
        '<p class="hint">' + esc(names) + "</p>";
      if (!PodiumStore.replayReady(c)) {
        li.appendChild(replayPlaceholder(c));
      } else {
        var play = document.createElement("button");
        play.type = "button";
        play.className = "btn btn-small";
        play.textContent = T("watch.play.screening");
        play.addEventListener("click", function () { playReplay(c.id); });
        li.appendChild(play);
      }
      ul.appendChild(li);
    });
  }
  function playReplay(cycleId) {
    stopWatchPlayback();
    watchSticky = "replay";
    var main = $("watchMain");
    main.hidden = false;
    main.innerHTML = "";
    var cyc = PodiumStore.cycleById(state, cycleId);
    if (cyc && !PodiumStore.replayReady(cyc)) {
      main.appendChild(replayPlaceholder(cyc));
      stopReplayButton(main);
      window.scrollTo(0, 0);
      return;
    }
    renderLive(main, cycleId);
    stopReplayButton(main);
    window.scrollTo(0, 0);
  }


  function stopWatchPlayback() {
    if (watchRAF) { cancelAnimationFrame(watchRAF); watchRAF = null; }
    var wm = $("watchMain");
    if (wm) {
      Array.prototype.forEach.call(wm.querySelectorAll("video"), function (v) {
        try { v.dataset.stopped = "1"; v.pause(); v.removeAttribute("src"); } catch (e) {}
      });
    }
  }


  function tickWatch() {
    var live = clockIsLive();
    var badge = $("watchTabLive");
    if (badge) badge.hidden = !live;
    var tab = document.querySelector('.main-nav .tab[data-view="watch"]');
    if (tab) tab.setAttribute("aria-label", live ? T("tab.watchlive.airing") : T("tab.watch"));
    if (currentView !== "watch" || watchSticky) return;
    var desired = live ? "live" : "upcoming";
    if (watchShownState && watchShownState !== desired) { renderWatch(); return; }
    if (live) {
      var main = $("watchMain");
      if (main && !main.querySelector(".player, .standby")) { renderWatch(); return; }
      var nrEl = $("nowReading");
      if (nrEl) refreshNowReading(nrEl);
    }
  }

  $("gotoWatchBtn").addEventListener("click", function () { showView("watch"); });
  $("backToBriefingBtn").addEventListener("click", function () { showView("briefing"); });

  tickWatch();
  setInterval(tickWatch, 20000);

  /* Indicator stability (TY, Oct 28): overlapping live checks can flip the
     reported mode back and forth while typing. Display only: hold the last
     shown state until a new state persists — a change applies after it
     survives one quiet window, and a flip back inside the window cancels
     silently. Which engine runs, the fallback rule, and gate results are
     untouched; the settled display always matches the last settled check. */
  var aiModeShown = null; /* "live" | "stub" | null (not yet shown) */
  var aiModeTimer = null;
  var AI_MODE_QUIET_MS = 1000;
  function showAiMode(want) {
    aiModeShown = want;
    var el = $("aiMode");
    el.textContent = want === "live" ? T("ai.live") : T("ai.stub");
    el.classList.toggle("is-live", want === "live");
  }
  function renderAiMode() {
    var want = PodiumAI.isLive() ? "live" : "stub";
    if (aiModeShown === null) { showAiMode(want); return; }
    if (want === aiModeShown) {
      if (aiModeTimer) { clearTimeout(aiModeTimer); aiModeTimer = null; }
      return;
    }
    if (aiModeTimer) clearTimeout(aiModeTimer);
    aiModeTimer = setTimeout(function () {
      aiModeTimer = null;
      showAiMode(PodiumAI.isLive() ? "live" : "stub");
    }, AI_MODE_QUIET_MS);
  }
  function wireKeyUi() {
    $("apiKeySave").addEventListener("click", function () {
      PodiumAI.setKey($("apiKeyInput").value.trim());
      $("apiKeyInput").value = "";
      liveGateCache = null;
      liveClarityCache = null;
      renderAiMode();
    });
    $("apiKeyClear").addEventListener("click", function () {
      PodiumAI.clearKey();
      $("apiKeyInput").value = "";
      liveGateCache = null;
      liveClarityCache = null;
      renderAiMode();
    });
    PodiumAI.onModeChange = renderAiMode;
  }

  /* ---------- cross-tab sync ---------- */
  /* Another tab's save wins, as whole-state saves always have; this only
     makes it timely. The current view refreshes in place; a draft being
     actively typed here is never overwritten. */
  window.addEventListener("storage", function (e) {
    if (e.key === "podium1.v1") {
      state = PodiumStore.load(etNow());
      renderCitizen();
      updateOnePostNotice();
      if (currentView === "feed" && !linkedPostId && !linkMissing && !isCodeSearch()) {
        /* Another tab saved: refresh counts in place on the frozen list.
           Never auto-inject new posts into a view being read. */
        feedFreeze = true;
        renderFeed();
      } else if (currentView === "feed") renderFeed();
      else if (currentView === "briefing") renderBriefing();
      else if (currentView === "prior") renderPrior();
      else if (currentView === "status") renderStatus();
      else if (currentView === "watch") {
        /* A replay in flight (video) stays put: never yank what
           is playing. Library / Upcoming / Live states re-render with the
           fresh state. */
        var vw = $("watchMain");
        var vv = vw && vw.querySelector("video");
        if (!watchSticky && !(vv && !vv.paused)) renderWatch();
      }
      else if (currentView === "post") renderComposerGate();
    } else if (e.key === DRAFT_KEY && document.activeElement !== composerText) {
      restoreDraft();
      renderComposerGate();
    } else if (e.key === PS().LANG_KEY) {
      /* Another tab switched the interface language: re-render the chrome
         in place. Display-only; no post, vote, draw, or briefing data moves. */
      PS().sync();
      var sel = $("langSel");
      if (sel) sel.value = uiLang();
      applyStaticChrome();
      renderCurrentView();
    }
  });

  /* ---------- interface language ---------- */
  /* Switching languages re-renders the chrome immediately and changes no
     post, vote, draw, or briefing data — every string below is display-only.
     Static markup keeps its English text; this pass overwrites it from the
     table on boot and on every switch, so English stays pixel-identical
     (the table holds the verbatim current wording) and Spanish covers the
     whole chrome. */
  function refillTopicSelects() {
    var tf = $("topicFilter"), ct = $("composerTopic");
    var tfv = tf ? tf.value : "", ctv = ct ? ct.value : "";
    if (tf) fillTopics(tf, true);
    if (ct) fillTopics(ct, false);
    if (tf) tf.value = tfv;
    if (ct) ct.value = ctv;
  }
    /* Null-safe static setters: the committed test runner loads app.js
     against a partial DOM, so boot-time chrome application must never
     throw on a missing element. */
  function setText(id, v) { var el = $(id); if (el) el.textContent = v; }
  function setHtml(id, v) { var el = $(id); if (el) el.innerHTML = v; }
  function setAttr(id, a, v) { var el = $(id); if (el) el.setAttribute(a, v); }
  function setPh(id, v) { var el = $(id); if (el) el.setAttribute("placeholder", v); }
  function applyStaticChrome() {
    document.documentElement.lang = uiLang();
    document.title = T("doc.title");
    setText("skipLink", T("skip.main"));
    setText("govText", T("gov.text"));
    setText("govHow", T("gov.how"));
    setText("brandSub", T("brand.sub"));
    setAttr("mainNav", "aria-label", T("nav.primary"));
    document.querySelectorAll(".main-nav .tab").forEach(function (t) {
      var view = t.getAttribute("data-view");
      var badge = t.querySelector(".tab-live");
      t.textContent = T("tab." + view) + " ";
      if (badge) { badge.textContent = T("tab.watchlive.badge"); t.appendChild(badge); }
    });
    setAttr("ruleCard", "aria-label", T("rule.reminder"));
    setText("ruleHeading", T("rule.heading"));
    setHtml("ruleP1", T("rule.p1"));
    setText("ruleP2", T("rule.p2"));
    setText("ruleP3", T("rule.p3"));
    setText("ruleP4", T("rule.p4"));
    setText("readFullRule", T("rule.readfull"));
    setText("fineSummary", T("fine.summary"));
    setText("fineLede", T("fine.lede"));
    setText("statementsHeading", T("fine.statements"));
    setText("finePurpose", T("fine.purpose"));
    Array.prototype.forEach.call(document.querySelectorAll("#fineList li"), function (li, i) {
      li.textContent = (li.id === "fineLi21") ? T("fine.li21") : T("fine.li" + (i + 1));
    });
    setText("citizenStateLabel", T("citizen.state.label"));
    setAttr("citizenStateSel", "aria-label", T("citizen.state.aria"));
    setAttr("citizenStateSel", "title", T("citizen.state.title"));
    setText("langLabel", T("lang.label"));
    setAttr("langSel", "aria-label", T("lang.label"));
    setAttr("view-feed", "aria-label", T("feed.aria"));
    setText("feedHeading", T("tab.feed"));
    document.querySelectorAll(".subtabs .subtab").forEach(function (b) {
      b.textContent = T("feed." + b.getAttribute("data-feed"));
    });
    setText("topicFilterLabel", T("feed.topic"));
    setAttr("topicFilterWrap", "aria-label", T("feed.topicfilter.aria"));
    setText("searchLabel", T("feed.search"));
    setPh("searchInput", T("feed.search.ph"));
    setText("pageSizeLabel", T("feed.perpage"));
    setText("voteRule", T("feed.voterule"));
    setText("prevPage", T("feed.prev"));
    setText("nextPage", T("feed.next"));
    setAttr("view-post", "aria-label", T("post.aria"));
    setText("postHeading", T("tab.post"));
    setAttr("miniRule", "aria-label", T("rule.reminder"));
    setText("miniRuleStrong", T("post.rule.applies"));
    setText("miniRuleText", T("post.rule.text"));
    setText("composerTopicLabel", T("post.topic"));
    setText("composerTopicHint", T("post.topic.hint"));
    setText("timerHint", T("post.timer.hint"));
    setText("composerTextLabel", T("post.address"));
    setPh("composerText", T("post.text.ph"));
    if ($("aiMode")) { aiModeShown = null; renderAiMode(); }
    setText("publishNote", T("publish.note"));
    setText("previewBtn", T("preview.hear"));
    setAttr("orderList", "aria-label", T("feed.order.aria"));
    setAttr("topicList", "aria-label", T("feed.topicfilter.aria"));

    var hb = $("hearDraftBtn"), nv = $("hearNoVoice");
    if (hb) hb.textContent = T("hear.draft");
    if (nv) nv.textContent = T("hear.novoice");
    setAttr("view-briefing", "aria-label", T("briefing.aria"));
    setText("briefingLede1", T("briefing.lede1"));
    setHtml("briefingLede2", T("briefing.lede2"));
    setText("gotoWatchBtn", T("briefing.watch"));
    setText("gotoWatchHint", T("briefing.watch.hint"));
    setText("nextHeading", T("briefing.next"));
    setText("nextHint", T("briefing.next.hint"));
    setText("drawHeading", T("briefing.draw"));
    setHtml("drawLede", T("briefing.draw.lede"));
    setText("excludedHeading", T("briefing.draw.excluded"));
    setText("drawReadonly", T("briefing.draw.readonly"));
    setText("workedHeading", T("briefing.draw.worked"));
    setHtml("workedBody", T("briefing.draw.worked.body"));
    setText("committeeRule", T("briefing.draw.committee"));
    setAttr("view-watch", "aria-label", T("watch.aria"));
    setText("watchHeading", T("tab.watch"));
    setText("watchLede", T("watch.lede"));

    setText("watchLibraryHeading", T("watch.library"));
    setText("backToBriefingBtn", T("watch.back"));

    setAttr("view-prior", "aria-label", T("prior.aria"));
    setText("priorHeading", T("tab.prior"));
    setText("priorLede", T("prior.lede"));
    setText("priorSelectedLabel", T("thread.selected"));
    setAttr("view-status", "aria-label", T("status.aria"));
    setText("statusHeading", T("tab.status"));
    setText("statusLede", T("status.lede"));
    setText("statusSelectedLabel", T("thread.selected"));
    setText("footerAbout", T("footer.about"));
    setText("footerAboutText", T("brand.sub"));
    setText("footerProcess", T("footer.process"));
    setText("footerProcessChain", T("footer.process.chain"));
    setText("footerSecurity", T("footer.security"));
    setText("footerSecurityNote", T("footer.security.note"));
    setText("footerNotices", T("footer.notices"));
    setHtml("footerStarterNotice", T("footer.starternotice"));
    setText("apiKeyLabel", T("footer.key"));
    setText("apiKeyHint", T("footer.key.hint"));
    setPh("apiKeyInput", T("footer.key.ph"));
    setText("apiKeySave", T("footer.key.save"));
    setText("apiKeyClear", T("footer.key.clear"));
    setText("previewTitle", T("preview.title"));
    setText("previewClose", T("preview.close"));
    setText("previewPublish", T("preview.publish"));
    setText("publishBtn", T("preview.publish"));

  }
  /* Limited committee authority (TY, Nov 4): the committee judges whether an
     answer is real and tracks follow-through — it never implements, compels,
     funds, touches a post, or speaks for the government. Authority is an
     explicit record on the member, granted on join and stripped when the term
     ends; both are audit-logged. No second gate: servingApprover (below) is
     the single check used by Approve/Decline, the help box, and the
     committee view. */
  var DEMO_MEMBER_ID = "demo-committee-1";
  var FACE_KEY = "podium1.face.v1";
  function exitWeekOf(m) { return (m && m.exitWeek != null) ? m.exitWeek : 12; }
  /* Demo-only committee character (TY, Nov 4): a synthetic serving member so
     anyone can see the committee face. NOT a seeded citizen — the seed stays
     empty. Created lazily on first switch to the committee face, with the
     grant audit-logged once at creation, never on switch. */
  function ensureDemoCharacter() {
    var c = PodiumStore.loadCommittee();
    var members = (c && c.members) || [];
    for (var i = 0; i < members.length; i++) {
      if (members[i] && members[i].id === DEMO_MEMBER_ID) return members[i];
    }
    var stamped = "";
    try { stamped = etNow().toISOString(); } catch (e) { stamped = String(Date.now()); }
    var m = { id: DEMO_MEMBER_ID, name: "R. Alvarez", state: "New Mexico",
      termWeek: 3, exitWeek: 12, termStart: "Oct 13, 2026", cycleOutDate: "Jan 4, 2027",
      demo: true, authority: { granted: stamped }, draw: {} };
    members.push(m);
    try { c.members = members; PodiumStore.saveCommittee(c); } catch (e2) { /* private mode */ }
    audit("authorityGranted", m.id, "demo character created");
    return m;
  }
  function currentFace() { return (state.currentUserId === DEMO_MEMBER_ID) ? "committee" : "civilian"; }
  function setFace(face) {
    if (face === "committee") state.currentUserId = ensureDemoCharacter().id;
    else state.currentUserId = null;
    try { window.localStorage.setItem(FACE_KEY, face === "committee" ? "committee" : "civilian"); } catch (e) { /* private mode */ }
    try { PodiumStore.save(state); } catch (e2) { /* session-only fallback */ }
    renderCitizen();
    renderCurrentView();
  }
  function applySavedFace() {
    var f = null;
    try { f = window.localStorage.getItem(FACE_KEY); } catch (e) { /* private mode */ }
    if (f === "committee") {
      try {
        var members = PodiumStore.loadCommittee().members || [];
        for (var i = 0; i < members.length; i++) {
          if (members[i] && members[i].id === DEMO_MEMBER_ID && members[i].authority) { state.currentUserId = DEMO_MEMBER_ID; return; }
        }
      } catch (e2) { /* fall through to civilian */ }
    }
    if (state.currentUserId === DEMO_MEMBER_ID) state.currentUserId = null;
  }
  /* Minimal term-end check (TY, Nov 4): runs on load, before first render.
     A holder whose term week has reached 12 loses the authority in the same
     step (audit-logged); the account reverts to civilian. No draw, no
     rotation — those stay out of scope. */
  function checkAuthorityExpiry() {
    var c = null;
    try { c = PodiumStore.loadCommittee(); } catch (e) { return; }
    var members = (c && c.members) || [], changed = false, i, m;
    for (i = 0; i < members.length; i++) {
      m = members[i];
      if (m && m.authority && (m.termWeek || 0) >= 12) {
        delete m.authority;
        changed = true;
        audit("authorityRevoked", m.id || "", "term ended");
        if (state.currentUserId && m.id && state.currentUserId === m.id) state.currentUserId = null;
      }
    }
    if (!changed) return;
    try { PodiumStore.saveCommittee(c); } catch (e2) { /* private mode */ }
    try { PodiumStore.save(state); } catch (e3) { /* session-only fallback */ }
    try { window.localStorage.setItem(FACE_KEY, "civilian"); } catch (e4) { /* private mode */ }
  }
  /* Answer approver (TY): the serving committee member who approved an answer.
     The approver is the signed-in citizen when they serve on the roster;
     otherwise approval is blocked (never invented). The approvedBy snapshot
     is recorded on the briefing item via recordApproval and persists with
     the state save. Display only — answer text is untouched. */
  function servingApprover() {
    var roster = [];
    try { roster = PodiumStore.loadCommittee().members || []; } catch (e) { roster = []; }
    if (!roster.length) return { member: null, reason: "empty" };
    for (var i = 0; i < roster.length; i++) {
      if (roster[i] && roster[i].id === state.currentUserId && roster[i].authority) return { member: roster[i], reason: null };
    }
    return { member: null, reason: "not-serving" };
  }
  function approveAnswerFor(post) {
    var sv = servingApprover();
    if (!sv.member) return { ok: false, key: sv.reason === "empty" ? "approver.none" : "approver.notserving" };
    var res = PodiumStore.recordApproval(state, PodiumStore.loadCommittee(), post.id, sv.member.id);
    if (!res.ok) return { ok: false, key: res.reason === "not-serving" ? "approver.notserving" : "approver.none" };
    try { PodiumStore.save(state); } catch (e) { /* session-only fallback */ }
    return { ok: true, approvedBy: res.approvedBy };
  }
  function citationsFor(b, p) {
    return (b && b.citations) || [];
  }
  function citationsHtml(b, p) {
    var c = citationsFor(b, p), out = "";
    for (var i = 0; i < c.length; i++) {
      out += '<p class="hint">' + esc(T("cite.commitment")) + ": " + esc(c[i].commitment) + " \u2014 " + esc(T("cite.source")) + ": " + esc(c[i].source) + ", " + esc(c[i].date) + "." + (c[i].liaison ? " \u2014 " + esc(T("cite.via")) + " " + esc(c[i].liaison) : "") + "</p>";
    }
    return out;
  }
  /* Standing label (TY, Nov 4): every displayed answer carries it. Shown only
     when an answer text is present. */
  function standingHtml(a) {
    if (!String(a == null ? "" : a).trim()) return "";
    return '<p class="hint">' + esc(T("wonder.notapproval")) + "</p>";
  }
  function committeeLineHtml() {
    var full = T("approver.bycommittee"), name = T("approver.committee"), i = full.indexOf(name), html;
    if (i < 0) html = esc(full);
    else html = esc(full.slice(0, i)) + '<button type="button" class="btn btn-small approver-link">' + esc(name) + "</button>" + esc(full.slice(i + name.length));
    return '<p class="hint">' + html + "</p>";
  }
  function approverHtml(b) {
    var a = b && b.approvedBy;
    if (!a) return "";
    return committeeLineHtml();
  }
  function wireApproverLinks(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll("button.approver-link"), function (btn) {
      btn.addEventListener("click", function () { showView("committee"); });
    });
  }
  /* Committee roster (TY): empty-state tab plus stored-member list rendering.
     Structure only — the draw and rotation (Prompts 5-6) fill the data.
     Stored cycleOutDate is shown as-is (computed once when drawn). */
  var HELP_CATS = ["broken", "data", "howto", "other"];
  /* Committee help box (TY, Nov 4): a serving member describes what is broken
     (or what they need help with); Wonder answers in the box. Every request +
     response is audit-logged; broken / wrong-data / other reports are also
     listed as system issues on the Status tab. How-to stays in the box.
     Member text and Wonder text are rendered as text (never HTML). */
  function renderHelpBox(box) {
    box.innerHTML = "";
    var head = document.createElement("p");
    var headLabel = document.createElement("span");
    headLabel.className = "zone-label";
    headLabel.textContent = T("help.title");
    head.appendChild(headLabel);
    box.appendChild(head);
    var catWrap = document.createElement("div");
    catWrap.className = "field";
    var catLabel = document.createElement("label");
    catLabel.textContent = T("help.category.label");
    var catSel = document.createElement("select");
    catSel.setAttribute("data-help", "cat");
    HELP_CATS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = T("help.cat." + c);
      catSel.appendChild(o);
    });
    catLabel.appendChild(catSel);
    catWrap.appendChild(catLabel);
    box.appendChild(catWrap);
    var qWrap = document.createElement("div");
    qWrap.className = "field";
    var qArea = document.createElement("textarea");
    qArea.setAttribute("data-help", "q");
    qArea.rows = 3;
    qArea.placeholder = T("help.placeholder");
    qWrap.appendChild(qArea);
    box.appendChild(qWrap);
    var askBtn = document.createElement("button");
    askBtn.type = "button";
    askBtn.className = "btn btn-small";
    askBtn.textContent = T("help.submit");
    box.appendChild(askBtn);
    var statusP = document.createElement("p");
    statusP.className = "hint";
    box.appendChild(statusP);
    var respDiv = document.createElement("div");
    respDiv.hidden = true;
    var respLabel = document.createElement("p");
    var respSpan = document.createElement("span");
    respSpan.className = "zone-label";
    respSpan.textContent = T("help.response.label");
    respLabel.appendChild(respSpan);
    respDiv.appendChild(respLabel);
    var ansP = document.createElement("p");
    respDiv.appendChild(ansP);
    var confP = document.createElement("p");
    confP.className = "hint";
    respDiv.appendChild(confP);
    box.appendChild(respDiv);
    askBtn.addEventListener("click", function () {
      var q = qArea.value.trim();
      if (!q) return;
      var cat = catSel.value;
      askBtn.disabled = true;
      statusP.textContent = "";
      PodiumAI.askWonderHelp(q).then(function (ans) {
        askBtn.disabled = false;
        if (!ans) { statusP.textContent = T("help.unavailable"); return; }
        ansP.textContent = ans;
        respDiv.hidden = false;
        var tracked = (cat !== "howto");
        confP.textContent = tracked ? T("help.tracked") : T("help.answered");
        try {
          audit("help", "", JSON.stringify({ category: cat, question: q, answer: ans }));
          if (tracked) PodiumStore.recordSysIssue(state, cat, q, ans, etNow());
          PodiumStore.save(state);
        } catch (e) { /* session-only fallback */ }
      });
    });
  }
  function renderCommittee() {
    setAttr("view-committee", "aria-label", T("committee.aria"));
    setText("committeeHeading", T("tab.committee"));
    setText("committeeLede", T("committee.lede"));
    setText("committeeNote", T("committee.note"));
    setText("committeeRulesSummary", T("committee.rules.summary"));
    setText("committeeRulesSelectionH", T("committee.rules.selection.heading"));
    setText("committeeRulesSelectionB", T("committee.rules.selection.body"));
    setText("committeeRulesPayH", T("committee.rules.pay.heading"));
    setText("committeeRulesPayB", T("committee.rules.pay.body"));
    setText("committeeRulesStructureH", T("committee.rules.structure.heading"));
    setText("committeeRulesStructureB", T("committee.rules.structure.body"));
    setText("committeeRulesScheduleH", T("committee.rules.schedule.heading"));
    setText("committeeRulesScheduleB", T("committee.rules.schedule.body"));
    setText("committeeRulesStartupH", T("committee.rules.startup.heading"));
    setText("committeeRulesStartupP1", T("committee.rules.startup.p1"));
    setText("committeeRulesStartupP2", T("committee.rules.startup.p2"));
    setText("committeeRulesStartupP3", T("committee.rules.startup.p3"));
    setText("committeeRulesStartupP4", T("committee.rules.startup.p4"));
    setText("committeeRulesStartupP5", T("committee.rules.startup.p5"));
    setText("committeeRulesStartupP6", T("committee.rules.startup.p6"));
    /* Demo-only face switch (TY, Nov 4): civilian vs committee demo character.
       Always visible — it is how anyone reaches the committee face. */
    setText("faceSwitchLabel", T("switch.face.label"));
    setText("faceOptCivilian", T("switch.face.civilian"));
    setText("faceOptCommittee", T("switch.face.committee"));
    var faceSelEl = $("faceSel");
    if (faceSelEl) faceSelEl.value = currentFace();
    /* Committee help box (TY, Nov 4): Wonder-powered operational help, visible
       only to a serving committee member. Hidden (and emptied) for everyone
       else — no public trace of the box. */
    var termCard = $("termCard"), svTerm = servingApprover();
    if (termCard) {
      if (!svTerm.member) { termCard.hidden = true; termCard.innerHTML = ""; }
      else {
        termCard.hidden = false;
        termCard.innerHTML = '<p><span class="zone-label">' + esc(T("term.heading")) + "</span></p>" +
          "<p>" + esc(Tf("term.week", { n: svTerm.member.termWeek })) + " \u00b7 " + esc(Tf("term.exit", { n: exitWeekOf(svTerm.member) })) + "</p>" +
          '<p class="hint">' + esc(T("term.pay")) + "</p>";
      }
    }
    var helpBoxCard = $("helpCard");
    if (helpBoxCard) {
      if (!servingApprover().member) { helpBoxCard.hidden = true; helpBoxCard.innerHTML = ""; }
      else { helpBoxCard.hidden = false; renderHelpBox(helpBoxCard); }
    }
    var list = $("committeeList");
    if (!list) return;
    var members = (PodiumStore.loadCommittee().members || []).slice()
      .sort(function (a, b) { return (a.termWeek || 99) - (b.termWeek || 99); });
    var empty = $("committeeEmpty");
    if (!members.length) {
      list.innerHTML = "";
      if (empty) { empty.hidden = false; setText("committeeEmpty", T("committee.empty")); }
      return;
    }
    if (empty) empty.hidden = true;
    var html = "";
    var gateMember = servingApprover().member;
    members.forEach(function (c) {
      var detailed = !!gateMember;
      var dr = c.draw || {};
      var val = String(dr.beaconValue || "");
      var short = val.length > 12 ? val.slice(0, 12) + "\u2026" : val;
      var badge = "";
      var demoBadge = (c.demo && detailed) ? ' <span class="post-topic">' + esc(T("switch.face.demo")) + "</span>" : "";
      if (c.termWeek === 1) badge = ' <span class="post-topic">' + esc(T("committee.joined")) + "</span>";
      if (c.termWeek === 12) badge = ' <span class="post-topic">' + esc(T("committee.cycling")) + "</span>";
      html += '<li class="card"><p class="post-meta"><span class="post-author">' + esc(c.name || "") + "</span>" +
        (c.state ? "<span>" + esc(c.state) + "</span>" : "") + demoBadge + (detailed ? "" : "</p>");
      if (detailed) html += ' <span class="post-topic">' + esc(Tf("committee.week", { n: c.termWeek })) + "</span>" + badge +
        ' <span class="post-topic">' + esc(Tf("term.exit", { n: exitWeekOf(c) })) + "</span></p>" +
        "<p class=\"hint\">" + esc(Tf("committee.terms", { start: c.termStart || "", out: c.cycleOutDate || "" })) + "</p>" +
        '<p><span class="zone-label">' + esc(T("committee.draw")) + "</span></p>" +
        '<dl class="draw-facts">' +
        "<dt>" + esc(T("committee.draw.beacon")) + "</dt><dd>" + esc(dr.beaconTimestamp || "") + "</dd>" +
        "<dt>" + esc(T("committee.draw.value")) + '</dt><dd><span class="ref-code">' + esc(short) + "</span></dd>" +
        "<dt>" + esc(T("committee.draw.pool")) + "</dt><dd>" + esc(String(dr.poolSize == null ? "" : dr.poolSize)) + "</dd>" +
        "<dt>" + esc(T("committee.draw.pos")) + "</dt><dd>" + esc(String(dr.position == null ? "" : dr.position)) + "</dd>" +
        "</dl>";
      html += "</li>";
    });
    list.innerHTML = html;
  }
  function renderCurrentView() {
    renderCitizen();
    refillTopicSelects();
    if (currentView === "feed") renderFeed();
    else if (currentView === "briefing") renderBriefing();
    else if (currentView === "prior") renderPrior();
    else if (currentView === "status") renderStatus();
    else if (currentView === "watch") renderWatch();
    else if (currentView === "committee") renderCommittee();
    else if (currentView === "post") { updateOnePostNotice(); renderComposerGate(); }
  }
  function applyLanguage(l) {
    PS().set(l);
    document.documentElement.lang = uiLang();
    var sel = $("langSel");
    if (sel) sel.value = uiLang();
    applyStaticChrome();
    renderCurrentView();
  }

  /* ---------- init ---------- */
  checkAuthorityExpiry();
  applySavedFace();
  var langSelInit = $("langSel");
  if (langSelInit) {
    langSelInit.value = uiLang();
    langSelInit.addEventListener("change", function () { applyLanguage(langSelInit.value); });
  var faceSelInit = $("faceSel");
  if (faceSelInit && !faceSelInit.dataset.faceBound) { faceSelInit.dataset.faceBound = "1"; faceSelInit.addEventListener("change", function () { setFace(faceSelInit.value); }); }
  }
  applyStaticChrome();
  renderCitizen();
  updateOnePostNotice();
  restoreDraft();
  renderComposerGate();
  wireHearUi();
  wireKeyUi();
  renderAiMode();
  /* Weekly committee rotation (TY): on Mondays, alongside the post draw, cycle
     out completed terms and draw one replacement. Async beacon fetch; never
     blocks load. No-op off-Monday, on empty pools, on beacon failure, or when
     this Monday already rotated. */
  function maybeRotateCommittee() {
    try {
      var now = etNow();
      var et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      if (et.getDay() !== 1) return;
      if (typeof window.fetch !== "function") return;
      PodiumStore.fetchCommitteeBeacon().then(function (bc) {
        if (!bc || !bc.ok) { if (typeof console !== "undefined" && console.warn) console.warn("Podium: committee rotation skipped, beacon unavailable."); return; }
        var st = PodiumStore.loadCommittee();
        var res = PodiumStore.rotateCommittee({ store: st, citizens: state.citizens, posts: state.posts,
          cycleId: PodiumStore.currentCycleId(state, now), beacon: bc, monday: et });
        if (res && res.ran) PodiumStore.saveCommittee(res.store);
      });
    } catch (e) { /* rotation must never break load */ }
  }
  maybeRotateCommittee();
  restoreFeedState(); /* sort + topic + clamped page ride along when the feed is restored */
  /* Restore the saved tab synchronously during initial render (no flash of
     feed). A #post/... deep link governs instead and the saved tab is
     ignored for that load; with no saved tab, boot to Live Feed. The
     load-time scroll-to-top runs after this, so a reload settles at the
     top of the restored tab. */
  (function () {
    var start = savedView();
    if (/^#post\//.test(window.location.hash || "")) start = null;
    if (start && start !== "feed") showView(start);
    else renderFeed();
  })();
  handleDeepLink();
})();
