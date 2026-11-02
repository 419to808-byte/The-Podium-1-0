/* The Podium — AI adapter. ALL model calls go through PodiumAI.
   mode "stub": realistic canned on-device checks, runs end-to-end with no
   key. mode "live": Meta Model API (Muse Spark for the composer gate,
   Muse Wonder for committee-answer drafts) once a session key is pasted
   into the footer; a settled truthful indicator shows which engine ran.
   Callers never change. The AI corrects wording only: it never steers
   topic, position, or meaning, and never edits silently. */
var PodiumAI = (function () {
  "use strict";

  var WORD_LIMIT = 630;
  var WPM = 140; /* read-aloud pace: 630 words ~= 4.5 minutes */
  var MAX_SECONDS = Math.round(WORD_LIMIT * 60 / WPM); /* 270 = 4:30 */

  /* ---- Hard block: profanity, slurs, personal attacks. Post cannot submit. ---- */
  var HARD_WORDS = [
    "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "dickhead",
    "slut", "whore", "cunt", "nigger", "nigga", "faggot", "retard", "retarded",
    "dumbass"
  ];
  var HARD_PHRASES = [
    "you idiot", "you are an idiot", "youre an idiot", "you're an idiot", "you\u2019re an idiot", "you moron",
    "shut up", "stupid loser", "stupid losers", "kill yourself",
    "drop dead", "i hate you", "you suck", "you are stupid", "you're stupid", "you\u2019re stupid"
  ];

  /* Person-directed hate the stub CAN see. Pronouns are unambiguous people;
     civic titles cover official-directed attacks ("my mayor"). A possessive
     right after the title ("the mayor's policy") still passes — that is a
     complaint about a thing, not an attack on a person. "Representative" is
     deliberately absent (adjective use: "representative government"). Names
     and subtler forms need the model. */
  var HATE_PRONOUNS = ["him", "her", "them"];
  var HATE_TITLES = "mayor|president|governor|senator|congressman|congressmen|congresswoman|congresswomen|councilman|councilmen|councilwoman|councilwomen|councilor|councilors|councillor|councillors|commissioner|judge|sheriff|alderman|aldermen";
  /* Crude person-directed insults ("he bad", "they stupid", "he not good"):
     ridicule, which the rule says will not post. Grammatical English never
     puts a bare adjective directly after these pronouns — "he is bad" and
     "he is not good" pass; only the crude forms are caught. The "not"
     variant covers pejoratives plus good/fair/right; subtler negations
     ("not only bad") need the model. */
  var INSULT_ADJS = "bad|stupid|dumb|ugly|awful|terrible|horrible|worst|pathetic|useless|lame|gross";

  /* ---- Soft hold: slang / misspellings that would embarrass on air. ---- */
  /* word -> [suggestion, one-line reason] */
  var SOFT_MAP = {
    "gonna": ["going to", "Slang: say \u201cgoing to\u201d for a national audience."],
    "wanna": ["want to", "Slang: say \u201cwant to\u201d for a national audience."],
    "gotta": ["have to", "Slang: say \u201chave to\u201d for a national audience."],
    "kinda": ["kind of", "Slang: write \u201ckind of\u201d in full."],
    "sorta": ["sort of", "Slang: write \u201csort of\u201d in full."],
    "yeah": ["yes", "Slang: use \u201cyes\u201d in a formal address."],
    "yep": ["yes", "Slang: use \u201cyes\u201d in a formal address."],
    "nope": ["no", "Slang: use \u201cno\u201d in a formal address."],
    "lol": ["", "Slang: laughter markers do not belong in a formal address \u2014 remove it."],
    "lmao": ["", "Slang: laughter markers do not belong in a formal address \u2014 remove it."],
    "omg": ["", "Slang: exclamations like this will not read well aloud \u2014 remove it."],
    "btw": ["by the way", "Slang: write \u201cby the way\u201d in full."],
    "idk": ["I do not know", "Slang: write \u201cI do not know\u201d in full."],
    "tbh": ["frankly", "Slang: use \u201cfrankly\u201d in a formal address."],
    "imo": ["in my view", "Slang: write \u201cin my view\u201d in full."],
    "im": ["I\u2019m", "Spelling: write \u201cI\u2019m\u201d with an apostrophe."],
    "plz": ["please", "Slang: write \u201cplease\u201d in full."],
    "thx": ["thank you", "Slang: write \u201cthank you\u201d in full."],
    "recieve": ["receive", "Misspelling: \u201creceive\u201d follows i-before-e here."],
    "adress": ["address", "Misspelling: \u201caddress\u201d has two d\u2019s."],
    "goverment": ["government", "Misspelling: \u201cgovernment\u201d has an n before the m."],
    "definately": ["definitely", "Misspelling: it is \u201cdefinitely\u201d."],
    "seperate": ["separate", "Misspelling: it is \u201cseparate\u201d."],
    "neccessary": ["necessary", "Misspelling: \u201cnecessary\u201d has one c and two s\u2019s."],
    "occassion": ["occasion", "Misspelling: \u201coccasion\u201d has one s."],
    "publically": ["publicly", "Misspelling: it is \u201cpublicly\u201d."],
    "untill": ["until", "Misspelling: \u201cuntil\u201d has one l."],
    "wich": ["which", "Misspelling: it is \u201cwhich\u201d."],
    "seige": ["siege", "Misspelling: it is \u201csiege\u201d."],
    "cuz": ["because", "Slang: write \u201cbecause\u201d in full."],
    "lemme": ["let me", "Slang: write \u201clet me\u201d in full."],
    "dunno": ["do not know", "Slang: write \u201cdo not know\u201d in full."],
    "pls": ["please", "Slang: write \u201cplease\u201d in full."],
    "thnx": ["thank you", "Slang: write \u201cthank you\u201d in full."],
    "govt": ["government", "Slang: write \u201cgovernment\u201d in full."],
    "teh": ["the", "Misspelling: it is \u201cthe\u201d."],
    "occured": ["occurred", "Misspelling: \u201coccurred\u201d has two c\u2019s and two r\u2019s."],
    "enviroment": ["environment", "Misspelling: \u201cenvironment\u201d has an n before the m."],
    "accomodate": ["accommodate", "Misspelling: \u201caccommodate\u201d has two c\u2019s and two m\u2019s."],
    "existance": ["existence", "Misspelling: it is \u201cexistence\u201d."],
    "independant": ["independent", "Misspelling: it is \u201cindependent\u201d."],
    "tommorrow": ["tomorrow", "Misspelling: \u201ctomorrow\u201d has one m and two r\u2019s."],
    "citzen": ["citizen", "Misspelling: it is \u201ccitizen\u201d."],
    "dont": ["don\u2019t", "Spelling: write \u201cdon\u2019t\u201d with an apostrophe."],
    "cant": ["can\u2019t", "Spelling: write \u201ccan\u2019t\u201d with an apostrophe."],
    "wont": ["won\u2019t", "Spelling: write \u201cwon\u2019t\u201d with an apostrophe."],
    "isnt": ["isn\u2019t", "Spelling: write \u201cisn\u2019t\u201d with an apostrophe."],
    "didnt": ["didn\u2019t", "Spelling: write \u201cdidn\u2019t\u201d with an apostrophe."],
    "doesnt": ["doesn\u2019t", "Spelling: write \u201cdoesn\u2019t\u201d with an apostrophe."],
    "couldnt": ["couldn\u2019t", "Spelling: write \u201ccouldn\u2019t\u201d with an apostrophe."],
    "shouldnt": ["shouldn\u2019t", "Spelling: write \u201cshouldn\u2019t\u201d with an apostrophe."],
    "wouldnt": ["wouldn\u2019t", "Spelling: write \u201cwouldn\u2019t\u201d with an apostrophe."],
    "havent": ["haven\u2019t", "Spelling: write \u201chaven\u2019t\u201d with an apostrophe."],
    "hasnt": ["hasn\u2019t", "Spelling: write \u201chasn\u2019t\u201d with an apostrophe."]
  };

  var STOPWORDS = {};
  ["a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with",
   "is", "are", "was", "were", "be", "been", "it", "its", "this", "that",
   "these", "those", "i", "my", "we", "our", "you", "your", "they", "their",
   "as", "at", "by", "from", "not", "no", "so", "if", "then", "than", "too",
   "very", "can", "will", "would", "should", "could", "have", "has", "had",
   "do", "does", "did", "there", "here", "every", "all", "any", "each",
   "because", "while", "when", "who", "what", "which", "how", "about"
  ].forEach(function (w) { STOPWORDS[w] = true; });

  /* Ask-verbs: same topic AND same ask counts as already voiced. */
  var ASK_WORDS = {};
  ["propose", "proposes", "proposal", "ask", "request", "requests", "require",
   "requires", "requirement", "fund", "funds", "funding", "ban", "bans",
   "build", "establish", "create", "cap", "caps", "capping", "expand",
   "protect", "publish", "guarantee", "mandate", "lower", "raise", "end",
   "stop", "start", "cover", "extend", "shorten", "limit"
  ].forEach(function (w) { ASK_WORDS[w] = true; });

  /* Single topic source (TY, Oct 28 audit): PODIUM_SEED.topics is canonical —
     it drives the dropdowns and the ref letters (order matters there), so it
     is never derived from anything else. This keyword map mirrors that SET
     in its first elements; its ORDER is deliberately different and fixed:
     suggestTopic counts keyword hits per topic and the FIRST topic with the
     strictly-highest count wins, so list order breaks ties ("bus" hits both
     Education and Transportation; Education comes first and keeps it).
     The gate suite asserts set equality with the seed list, so drift fails
     loudly instead of silently changing suggestions or validation. */
  var TOPIC_KEYWORDS = [
    ["Healthcare", ["health", "doctor", "hospital", "clinic", "drug", "insulin", "medical", "mental", "counselor", "pharmacy", "patient", "cardiac", "surgery"]],
    ["Public Health", ["public health", "vaccine", "vaccination", "immunization", "outbreak", "epidemic", "pandemic", "quarantine", "sanitation", "disease", "smoking", "obesity"]],
    ["Education", ["school", "student", "teacher", "classroom", "textbook", "college", "lunch", "bus", "aid", "vocational", "trade"]],
    ["Infrastructure", ["bridge", "bridges", "dam", "water", "mains", "pipes", "lead", "broadband", "grid", "sewer"]],
    ["Transportation", ["bus", "train", "amtrak", "road", "roads", "pothole", "highway", "crossing", "fares", "transit"]],
    ["Public Safety", ["safety", "lighting", "crosswalk", "fire", "crash", "traffic", "signal", "street"]],
    ["Environment", ["recycling", "wetland", "air", "water", "dumping", "climate", "pollution", "smoke", "bin"]],
    ["Housing", ["rent", "housing", "landlord", "deposit", "apartment", "tenant", "shelter"]],
    ["Economy", ["loan", "loans", "business", "tip", "tips", "unemployment", "wages", "market", "benefits"]],
    ["Technology", ["robocall", "broadband", "data", "breach", "carrier", "maps", "tracking", "gps", "phones"]],
    ["Civic Process", ["vote", "voting", "ballot", "polling", "jury", "town", "hall", "summons", "hearing", "notice"]]
  ];

  function countWords(text) {
    var m = text.trim().match(/\S+/g);
    return m ? m.length : 0;
  }
  function readSeconds(text) {
    return Math.round(countWords(text) * 60 / WPM);
  }
  function formatTimer(text) {
    var s = readSeconds(text);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return "read-aloud time \u2248 " + m + ":" + (r < 10 ? "0" : "") + r + " of 4:30";
  }
  function firstSentenceComplete(text) {
    return /[.!?]["\u201d]?\s+\S/.test(text) || (text.trim().length > 60 && /[.!?]["\u201d]?\s*$/.test(text));
  }
  function contentWords(text) {
    var out = {};
    (text.toLowerCase().match(/[a-z']+/g) || []).forEach(function (w) {
      if (!STOPWORDS[w] && w.length > 2) out[w] = true;
    });
    return out;
  }
  function hasAsk(text) {
    var words = text.toLowerCase().match(/[a-z']+/g) || [];
    for (var i = 0; i < words.length; i++) {
      if (ASK_WORDS[words[i]]) return true;
    }
    return /i (propose|ask|request|propose that|ask that)/.test(text.toLowerCase());
  }

  function escapeReg(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* Deterministic punctuation fix (space collapse, space before punctuation,
     terminal period), or null when the draft is clean. Returned for the
     author's explicit one-click fix; never applied silently. */
  function punctFixOf(text) {
    var t = String(text).replace(/ {2,}/g, " ").replace(/(\S) +([.,!?])/g, "$1$2");
    var core = t.replace(/\s+$/, "");
    if (core && !/[.!?]["\u201d)]?$/.test(core)) {
      var qm = /(["\u201d)])$/.exec(core);
      core = qm ? core.slice(0, qm.index) + "." + qm[1] : core + ".";
    }
    return core === text ? null : core;
  }

  /* Comprehensibility hold (LOW, meaning-based bar): a draft is unclear when
     it has no complete sentence (the existing first-sentence logic, or simply
     ending with terminal punctuation) OR no discernible topic/ask (no topic
     keyword hit AND no ask verb). Dialect, simple words, and non-native
     phrasing PASS when the meaning is discernible. Unclear is a soft hold
     with help — never a refusal, never final. */
  function clarityOf(text) {
    var t = String(text);
    var hasSentence = firstSentenceComplete(t) || /[.!?]["\u201d]?\s*$/.test(t);
    var topic = suggestTopic(t);
    var ask = hasAsk(t);
    return { unclear: !hasSentence || (!topic && !ask), hasSentence: !!hasSentence, topic: topic, ask: !!ask, words: countWords(t) };
  }

  /* Deterministic same-content tidy: applies the gate's own soft fixes (global
     replacement per flag, up to three passes, like clicking each chip),
     collapses spacing, and applies the punctuation fix. The caller
     offers the result as a rewrite ONLY after verifying it is fully clear. */
  function tidyDraft(text) {
    var t = String(text);
    for (var pass = 0; pass < 3; pass++) {
      var flags = checkText(t).soft;
      if (!flags.length) break;
      flags.forEach(function (f) {
        var re = new RegExp("\\b" + escapeReg(f.word) + "\\b", f.caseSensitive ? "g" : "gi");
        t = t.replace(re, f.suggestion);
      });
      t = t.replace(/ {2,}/g, " ");
    }
    t = t.replace(/ {2,}/g, " ");
    var pf = punctFixOf(t);
    if (pf) t = pf;
    return t;
  }

  /* Returns { hard: [matched], soft: [{word, suggestion, reason}], punctFix }.
     Word-boundary matching only: substrings ("shiitake") and longer
     phrases ("i hate your policy") must not false-block. */
  function checkText(text) {
    var hard = [];
    HARD_WORDS.forEach(function (w) {
      var re = new RegExp("\\b" + escapeReg(w) + "\\b", "i");
      if (re.test(text)) hard.push(w);
    });
    HARD_PHRASES.forEach(function (p) {
      var re = new RegExp("\\b" + escapeReg(p) + "\\b", "i");
      if (re.test(text)) hard.push(p);
    });
    HATE_PRONOUNS.forEach(function (w) {
      var re = new RegExp("\\bi hate " + w + "\\b", "i");
      if (re.test(text)) hard.push("i hate " + w);
    });
    var titleRe = new RegExp("\\bi hate (?:my |the |our |this |that )?(" + HATE_TITLES + ")s?\\b(?!['\\u2019]s\\b)", "i");
    var titleHit = titleRe.exec(text);
    if (titleHit) hard.push(titleHit[0]);
    var insultRe = new RegExp("\\b(he|she|they|you) (" + INSULT_ADJS + ")\\b", "i");
    var insultHit = insultRe.exec(text);
    if (insultHit) hard.push(insultHit[0]);
    var notRe = new RegExp("\\b(he|she|they|you) not (" + INSULT_ADJS + "|good|fair|right)\\b", "i");
    var notHit = notRe.exec(text);
    if (notHit) hard.push(notHit[0]);
    var soft = [];
    var seen = {};
    Object.keys(SOFT_MAP).forEach(function (w) {
      var re = new RegExp("\\b" + escapeReg(w) + "\\b", "i");
      var m = re.exec(text);
      if (m && !seen[w]) {
        seen[w] = true;
        var sug = SOFT_MAP[w][0];
        if (/^[A-Z]/.test(m[0]) || /(^|[.!?]\s*)$/.test(text.slice(0, m.index))) {
          sug = sug.charAt(0).toUpperCase() + sug.slice(1);
        }
        soft.push({ word: w, suggestion: sug, reason: SOFT_MAP[w][1] });
      }
    });
    /* Lowercase-only slang (case-sensitive): the uppercase forms may be
       legitimate ("I", "UR" initials, "U-turn", "NGL"/"FR"/"RN" initials),
       so only the lowercase slang form flags. Shared seen set: one chip
       per word, because the chip fix targets the lowercase form only. */
    if (/\bi\b/.test(text) && !seen["i"]) {
      seen["i"] = true;
      soft.push({ word: "i", suggestion: "I", reason: "Capitalization: the word \u201cI\u201d is always capitalized.", caseSensitive: true });
    }
    if (/\bur\b/.test(text) && !seen["ur"]) {
      seen["ur"] = true;
      soft.push({ word: "ur", suggestion: "your", reason: "Slang: write \u201cyour\u201d in full.", caseSensitive: true });
    }
    if (/\bu\b/.test(text) && !seen["u"]) {
      seen["u"] = true;
      soft.push({ word: "u", suggestion: "you", reason: "Slang: write \u201cyou\u201d in full.", caseSensitive: true });
    }
    if (/\bngl\b/.test(text) && !seen["ngl"]) {
      seen["ngl"] = true;
      soft.push({ word: "ngl", suggestion: "frankly", reason: "Slang: use \u201cfrankly\u201d in a formal address.", caseSensitive: true });
    }
    if (/\bfr\b/.test(text) && !seen["fr"]) {
      seen["fr"] = true;
      soft.push({ word: "fr", suggestion: "really", reason: "Slang: use \u201creally\u201d in a formal address.", caseSensitive: true });
    }
    if (/\brn\b/.test(text) && !seen["rn"]) {
      seen["rn"] = true;
      soft.push({ word: "rn", suggestion: "right now", reason: "Slang: write \u201cright now\u201d in full.", caseSensitive: true });
    }
    /* First character must not be a lowercase letter. Skips camelCase brands
       ("iPhone"), bare "im" (the map entry's "I'm" fix beats "Im"), and words
       already flagged (the map or slang entry covers them). */
    var lead = /^\s*([a-z][a-zA-Z']*)/.exec(text);
    if (lead) {
      var firstWord = lead[1];
      if (!/[A-Z]/.test(firstWord) && firstWord !== "im" && !seen[firstWord]) {
        seen[firstWord] = true;
        soft.push({ word: firstWord, suggestion: firstWord.charAt(0).toUpperCase() + firstWord.slice(1), reason: "Capitalization: begin with a capital letter.", caseSensitive: true });
      }
    }
    /* Sentence-initial capitalization. Skips abbreviation periods ("e.g.",
       "U.S.", "Mr."), skips words already flagged, and skips a lowercase
       word occurring more than once, so the one-click fix can never
       capitalize the wrong occurrence. The abbreviation test includes the
       period and needs two dotted pairs, so "e.g." skips but "it." never
       does. */
    var sentRe = /([.!?]["\u201d'\u2018\u2019]?\s+)([a-z][a-zA-Z']*)/g;
    var sm;
    while ((sm = sentRe.exec(text))) {
      var pre = text.slice(0, sm.index + 1);
      if (/(?:[A-Za-z]\.){2,}$/.test(pre)) continue;
      if (/\b(?:Mr|Mrs|Ms|Dr|St|No|vs|etc)\.$/i.test(pre)) continue;
      var sw = sm[2], lk = sw.toLowerCase();
      if (seen[lk]) continue;
      if (text.split(new RegExp("\\b" + escapeReg(sw) + "\\b")).length - 1 !== 1) continue;
      seen[lk] = true;
      soft.push({ word: sw, suggestion: sw.charAt(0).toUpperCase() + sw.slice(1), reason: "Capitalization: begin the sentence with a capital letter.", caseSensitive: true });
    }
    return { hard: hard, soft: soft, punctFix: punctFixOf(text) };
  }

  /* Advisory similarity: same topic AND same ask. Relevance filters first,
     then votes pick exactly ONE post: the top-voted among the matches. */
  function findTopSimilar(draftText, posts) {
    if (!firstSentenceComplete(draftText)) return null;
    if (countWords(draftText) < 8) return null;
    var draftWords = contentWords(draftText);
    var draftHasAsk = hasAsk(draftText);
    var best = null;
    posts.forEach(function (p) {
      var pw = contentWords(p.body);
      var overlap = 0, total = 0;
      Object.keys(draftWords).forEach(function (w) {
        total++;
        if (pw[w]) overlap++;
      });
      if (total === 0) return;
      /* Same ask required: both carry an ask */
      var bothAsk = draftHasAsk && hasAsk(p.body);
      if (!bothAsk) return;
      var score = overlap / Math.sqrt(total);
      if (overlap < 3 || score < 0.8) return;
      if (!best || p.votes > best.post.votes ||
          (p.votes === best.post.votes && score > best.score)) {
        best = { post: p, score: score };
      }
    });
    return best ? best.post : null;
  }

  function suggestTopic(text) {
    var lower = text.toLowerCase();
    var best = null, bestHits = 0;
    TOPIC_KEYWORDS.forEach(function (pair) {
      var hits = 0;
      pair[1].forEach(function (kw) {
        if (lower.indexOf(kw) !== -1) hits++;
      });
      if (hits > bestHits) { bestHits = hits; best = pair[0]; }
    });
    return bestHits > 0 ? best : null;
  }

  /* ---------- live layer (Muse Spark via Meta Model API) ----------
     Key in sessionStorage only; mode flips to live on success, back to
     stub on any failure. Every live fn resolves null on any problem so
     callers always fall back to local logic. Local blocks always stand:
     live results may only ADD detections, never remove local ones. */
  var LIVE_TIMEOUT_MS = 9000;
  /* Transport per owner paste: convergent multi-source, NOT verbatim official
     docs — the first live call confirms it; fix from the API's actual
     error if the endpoint or model id is off. */
  var LIVE_TRANSPORT = {
    endpoint: "https://api.meta.ai/v1/chat/completions",
    model: "muse-spark-1.3",
    fallbackModel: "muse-spark-1.3-contributor"
  };
  var liveModelInUse = null; /* set when the fallback wins, for the session */
  /* Adapter-side view of the canonical topic list: the seed list when the
     seed loaded first (the app and the suites both load it first), else the
     keyword map's labels (same set, used only for membership validation). */
  function adapterTopics() {
    if (typeof PODIUM_SEED !== "undefined" && PODIUM_SEED && Array.isArray(PODIUM_SEED.topics)) return PODIUM_SEED.topics;
    return TOPIC_KEYWORDS.map(function (pair) { return pair[0]; });
  }
  var ADAPTER_TOPICS = adapterTopics();

  function getKey() {
    try { return window.sessionStorage.getItem("podium.modelKey") || ""; }
    catch (e) { return ""; }
  }
  function setKey(k) {
    try {
      if (k) window.sessionStorage.setItem("podium.modelKey", k);
      else window.sessionStorage.removeItem("podium.modelKey");
    } catch (e) { /* session-only */
    }
    liveModelInUse = null;
    setLiveMode(false);
  }
  function clearKey() { setKey(""); }
  function isLive() { return api.mode === "live"; }
  function setLiveMode(ok) {
    var next = (ok && !!getKey()) ? "live" : "stub";
    if (api.mode === next) return;
    api.mode = next;
    if (typeof api.onModeChange === "function") {
      try { api.onModeChange(next); } catch (e) {}
    }
  }
  /* Timeout with a real abort: makePromise receives an AbortSignal (or null
     where unsupported) to wire into its fetch, so a timed-out call stops its
     underlying request instead of lingering after resolve(null). */
  function withTimeout(makePromise, ms) {
    var ctrl = null;
    try { ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null; } catch (e) { ctrl = null; }
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; if (ctrl) { try { ctrl.abort(); } catch (e) {} } resolve(null); }
      }, ms);
      var p = null;
      try { p = makePromise(ctrl ? ctrl.signal : null); }
      catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } return; }
      p.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    });
  }
  function parseJsonReply(text) {
    var s = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function liveChat(systemText, userText, signal) {
    var t = LIVE_TRANSPORT;
    var key = getKey();
    if (!t.endpoint || !t.model || !key) return Promise.resolve(null);
    var content = systemText + "\n\n" + userText;
    function attempt(model) {
      var opts = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: content }] })
      };
      if (signal) opts.signal = signal;
      return fetch(t.endpoint, opts).then(function (resp) {
        if (!resp.ok) {
          /* Model rejection (bad key, unknown model, bad request): the one
             case that earns a fallback retry below. Tagged so network
             failures and timeout aborts (untagged) never stick the session
             to the fallback. */
          var err = new Error("model api " + resp.status);
          err.modelRejected = true;
          throw err;
        }
        return resp.json();
      }).then(function (data) {
        var msg = data && data.choices && data.choices[0] && data.choices[0].message;
        var text = msg && typeof msg.content === "string" ? msg.content : "";
        return text ? parseJsonReply(text) : null;
      });
    }
    var first = liveModelInUse || t.model;
    return attempt(first).then(function (parsed) {
      return parsed;
    }, function (err) {
      /* Primary rejected by the model: one retry with the contributor
         fallback, then give up to local fallback. A fallback win sticks
         for the session. Transient failures (network, timeout abort,
         unparseable) resolve null with nothing stuck. */
      if (err && err.modelRejected && first !== t.fallbackModel && t.fallbackModel) {
        return attempt(t.fallbackModel).then(function (parsed) {
          if (parsed) liveModelInUse = t.fallbackModel;
          return parsed;
        }, function () { return null; });
      }
      return null;
    });
  }
  var GATE_SYSTEM = "You are a pre-publication wording reviewer for a civic writing portal. " +
    "HARD fail ONLY: (1) these terms, whole words only: fuck, fucking, shit, bitch, bastard, asshole, dickhead, slut, whore, cunt, nigger, nigga, faggot, retard, retarded, dumbass; " +
    "you idiot, you are an idiot, youre an idiot, you're an idiot, you moron, shut up, stupid loser, stupid losers, kill yourself, drop dead, i hate you, i hate him, i hate her, i hate them, you suck, you are stupid, you're stupid; " +
    "(2) hatred directed at an identifiable official or person (hate my mayor fails); (3) crude person-directed ridicule (he bad, they stupid, he not good fail); " +
    "(4) other unambiguous profanity, slurs, or person-directed attacks in the same spirit. " +
    "MUST STILL PASS: substrings (shiitake), inflections (shits), thing-directed hatred (hate your policy, hate my commute, the mayor's policy), grammatical criticism (he is bad), and kill the bill (legislative language). " +
    "SOFT flag ONLY: slang (gonna, wanna, gotta, kinda, sorta, yeah, yep, nope, lol, lmao, omg, btw, idk, tbh, imo, im, plz, thx, ur, u, cuz, lemme, dunno, ngl, fr, rn, pls, thnx, govt), " +
    "misspellings (recieve, adress, goverment, definately, seperate, neccessary, occassion, publically, untill, wich, seige, teh, occured, enviroment, accomodate, existance, independant, tommorrow, citzen), " +
    "missing-apostrophe contractions (dont, cant, wont, isnt, didnt, doesnt, couldnt, shouldnt, wouldnt, havent, hasnt), standalone lowercase i, and lowercase sentence starts, " +
    "each with a suggested replacement; other clear slang, misspellings, or grammar errors in the same spirit. " +
    "Do NOT flag spacing or missing terminal punctuation (the client handles those deterministically). NEVER rewrite a sentence for style. " +
    "NEVER judge, steer, or mention the author's topic, position, or meaning. Coherent professional wording passes with empty lists. " +
    "Also identify the draft's language: return its BCP 47 code in lang (\"en\" for English, \"es\" for Spanish, etc.; \"und\" when the language cannot be determined). " +
    "Respond with ONLY this JSON, no other text: {\"hard\": [\"exact quoted span\", ...], \"soft\": [{\"word\": \"exact quoted word\", \"suggestion\": \"replacement\", \"reason\": \"one-line why\"}, ...], \"lang\": \"en\"}";
  /* Step 1 of the multilingual gate (Prompt 2): detect the draft's language
     first, then judge it IN that language. Detection is advisory and cheap:
     any failure (no key, timeout, malformed reply) means "und", and the
     judgment below falls back to English. Never a block. */
  var DETECT_SYSTEM = "Identify the language of this civic-post draft. " +
    "Respond with ONLY this JSON, no other text: {\"lang\": \"BCP 47 code\"}. " +
    "Use \"en\" for English, \"es\" for Spanish, and so on; use \"und\" when the language cannot be determined.";
  function validLangResult(o) {
    if (!o || typeof o.lang !== "string") return "und";
    var c = o.lang.toLowerCase();
    return /^[a-z]{2,3}(-[a-z0-9]+)?$/.test(c) ? c : "und";
  }
  function detectLangLive(text, signal) {
    return liveChat(DETECT_SYSTEM, "Draft:\n" + String(text).slice(0, 8000), signal).then(function (o) {
      return validLangResult(o);
    }, function () { return "und"; });
  }
  var langNamesEn = null;
  function langNameEn(code) {
    try {
      if (typeof Intl === "undefined" || !Intl.DisplayNames) return code;
      if (!langNamesEn) langNamesEn = new Intl.DisplayNames(["en"], { type: "language" });
      var n = langNamesEn.of(code);
      return (n && n !== code) ? n : code;
    } catch (e) { return code; }
  }
  function isEnglishCode(lang) {
    return lang === "en" || (typeof lang === "string" && lang.indexOf("en-") === 0);
  }
  /* The judgment instruction for a detected language. English keeps the base
     prompt byte-identical; any other language appends the judge-in-that-language
     sentence; undetermined appends the best-effort English fallback. The verdict
     rules never change — only the language of judgment and response. */
  function withLangInstruction(base, lang) {
    if (isEnglishCode(lang)) return base;
    if (lang && lang !== "und") {
      return base + " The post is written in " + langNameEn(lang) + " (" + lang + "). " +
        "Judge it in that language, and write all verdict explanations, hold messages, and rewrite suggestions in that language.";
    }
    return base + " The post's language could not be determined. " +
      "Judge it best-effort and write all verdict explanations, hold messages, and rewrite suggestions in English.";
  }
  function validGateResult(o) {
    if (!o || !Array.isArray(o.hard) || !Array.isArray(o.soft)) return null;
    var hard = o.hard.filter(function (x) { return typeof x === "string" && x; }).slice(0, 20);
    var soft = o.soft.filter(function (f) {
      return f && typeof f.word === "string" && typeof f.suggestion === "string" && typeof f.reason === "string";
    }).slice(0, 20);
    /* lang is advisory only: absent or malformed means undetermined, and it
       never affects the hard/soft verdict above. */
    var lang = (o && typeof o.lang === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)?$/.test(o.lang)) ? o.lang.toLowerCase() : "und";
    return { hard: hard, soft: soft, lang: lang };
  }
  function checkTextLive(text) {
    if (!getKey()) return Promise.resolve(null);
    return withTimeout(function (signal) {
      return detectLangLive(text, signal).then(function (lang) {
        return liveChat(withLangInstruction(GATE_SYSTEM, lang), "Draft:\n" + String(text).slice(0, 8000), signal).then(validGateResult);
      });
    }, LIVE_TIMEOUT_MS).then(function (r) {
      var ok = !!r;
      if (ok) {
        /* Spans must occur as whole words in the draft — the same
           word-boundary rule the local gate uses. A span that is only a
           substring of a longer word ("shit" in "shiitake") is a bounds
           hallucination: drop it so it can never block or hold. */
        r.hard = r.hard.filter(function (x) {
          return new RegExp("\\b" + escapeReg(x) + "\\b", "i").test(text);
        });
        r.soft = r.soft.filter(function (f) {
          var w = String(f.word).toLowerCase();
          if (/^(i|ur|u|ngl|fr|rn)$/.test(w)) return new RegExp("\\b" + escapeReg(w) + "\\b").test(text);
          return new RegExp("\\b" + escapeReg(String(f.word)) + "\\b", "i").test(text);
        });
        /* Case-only words keep their case-sensitivity when the draft carries
           the lowercase form, so the chip fix can never rewrite "UR"/"I". */
        r.soft = r.soft.map(function (f) {
          var w = String(f.word).toLowerCase();
          if (/^(i|ur|u|ngl|fr|rn)$/.test(w) && new RegExp("\\b" + escapeReg(w) + "\\b").test(text)) {
            return { word: f.word, suggestion: f.suggestion, reason: f.reason, caseSensitive: true };
          }
          return f;
        });
      }
      setLiveMode(ok);
      return r;
    });
  }
  var CLARITY_SYSTEM = "You are a pre-publication clarity reviewer for a civic writing portal. " +
    "The clarity bar is LOW and meaning-based: a draft is CLEAR when it has at least one complete sentence AND a discernible topic or ask. " +
    "Dialect, simple words, and non-native phrasing PASS when the meaning is discernible. Imperfect grammar, simple vocabulary, or non-standard dialect alone NEVER make a draft unclear. " +
    "A draft is UNCLEAR only when it has no complete sentence OR no discernible topic or ask. " +
    "If UNCLEAR but a position or ask IS discernible, propose a clearer version of the SAME content: same topic, same ask, same position, grammar and structure fixed only, the author's words kept wherever possible, formal clean wording under 630 words. " +
    "If NO position or ask is discernible, return proposal null (the portal asks the author guided questions instead) — NEVER invent a position, claim, ask, or topic. " +
    "NEVER add a claim, change the ask, soften or strengthen a position, or pick a topic. NEVER judge, steer, or mention the author's views beyond clarifying them. " +
    "Respond with ONLY this JSON, no other text: {\"unclear\": true|false, \"proposal\": \"clearer version\"|null}.";
  function validClarityResult(o) {
    if (!o || typeof o.unclear !== "boolean") return null;
    var p = (typeof o.proposal === "string" && o.proposal.trim()) ? o.proposal.trim().slice(0, 6000) : null;
    return { unclear: o.unclear, proposal: p };
  }
  function checkClarityLive(text) {
    if (!getKey()) return Promise.resolve(null);
    return withTimeout(function (signal) {
      return detectLangLive(text, signal).then(function (lang) {
        return liveChat(withLangInstruction(CLARITY_SYSTEM, lang), "Draft:\n" + String(text).slice(0, 8000), signal).then(validClarityResult);
      });
    }, LIVE_TIMEOUT_MS).then(function (r) {
      setLiveMode(!!r);
      return r;
    });
  }
  var VOICED_SYSTEM = "You match a draft civic post to already-published posts. CANDIDATES are numbered 1..N with ids. Return the number of the candidate with the SAME TOPIC *AND* the SAME ASK (same topic with a different ask does NOT match), or null if none matches. Respond with ONLY JSON: {\"match\": <number>|null}.";
  function findTopSimilarLive(draftText, posts) {
    if (!getKey()) return Promise.resolve(null);
    var cands = (posts || []).slice(0, 50); /* generous bound; local check covers all */
    if (!cands.length) return Promise.resolve(null);
    var user = "DRAFT:\n" + String(draftText).slice(0, 4000) + "\n\nCANDIDATES:\n" + cands.map(function (p, i) {
      return (i + 1) + ". [" + p.id + "] " + p.body;
    }).join("\n");
    return withTimeout(function (signal) {
      return liveChat(VOICED_SYSTEM, user, signal);
    }, LIVE_TIMEOUT_MS).then(function (o) {
      var post = null;
      if (o && typeof o.match === "number" && o.match >= 1 && o.match <= cands.length) {
        post = cands[o.match - 1];
      }
      setLiveMode(!!o);
      return post;
    });
  }
  var TOPIC_SYSTEM = "Map the draft civic post to EXACTLY ONE of these topics, replying with the exact string: " + ADAPTER_TOPICS.join(" | ") + ". Respond with ONLY JSON: {\"topic\": \"...\"}.";
  function suggestTopicLive(text) {
    if (!getKey()) return Promise.resolve(null);
    return withTimeout(function (signal) {
      return liveChat(TOPIC_SYSTEM, "Draft:\n" + String(text).slice(0, 4000), signal);
    }, LIVE_TIMEOUT_MS).then(function (o) {
      var topic = (o && typeof o.topic === "string") ? o.topic : null;
      if (topic && ADAPTER_TOPICS.indexOf(topic) === -1) topic = null;
      setLiveMode(!!o);
      return topic;
    });
  }

  /* ---------- committee answers (Muse Wonder via Meta Model API) ----------
     Model roles stay clean: Spark = composer gate (above), Wonder = answer
     drafting ONLY. Wonder never touches a citizen post. Drafts are for human
     committee review; nothing here delivers a final official answer.
     Model ID muse-wonder-1.0 per Meta Model API docs (dev.meta.ai), as
     corroborated across launch-day developer guides citing those docs.
     Same endpoint and same sessionStorage footer key as Spark — no second
     key. On ANY failure (no key, timeout, error, model rejected) resolve
     null so callers keep the seeded/sample answer. NEVER fall back to
     Spark for answers. */
  var WONDER_TRANSPORT = {
    endpoint: "https://api.meta.ai/v1/chat/completions",
    model: "muse-wonder-1.0"
  };
  var WONDER_TIMEOUT_MS = 30000; /* committee has a week; not real-time */
  var ANSWER_SYSTEM = "You draft committee answers for a civic portal's weekly briefing. " +
    "Draft an answer responsive to this post's SPECIFIC ask: specific and actionable (what will be done, by whom, by when, where applicable), " +
    "routed to the correct agency or branch of government, in an official tone. " +
    "Do NOT misrepresent the post: if you reference the citizen's words, quote them verbatim; never paraphrase the citizen's words as if they were the post. " +
    "Do NOT invent commitments beyond a plausible committee action (process steps only — transmit, report status — never promise enactment or outcomes). " +
    "Write ONLY the proposed answer itself. Do not include any sentence about the draft, its status, or whether it is final — no 'this draft...', 'this is a draft...', 'does not represent a final...' meta language of any kind. The interface labels the text as a draft pending committee review; the answer body must read as the proposed answer, nothing meta. " +
    "Never alter, reword, or comment on the post itself. Reply with ONLY the draft answer text, no prefix, no label, no quotation marks around the whole answer.";
  function wonderChat(systemText, userText) {
    var t = WONDER_TRANSPORT;
    var key = getKey();
    if (!t.endpoint || !t.model || !key) return Promise.resolve(null);
    var content = systemText + "\n\n" + userText;
    return withTimeout(function (signal) {
      var opts = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: t.model, messages: [{ role: "user", content: content }] })
      };
      if (signal) opts.signal = signal;
      return fetch(t.endpoint, opts).then(function (resp) {
        if (!resp.ok) throw new Error("model api " + resp.status);
        return resp.json();
      }).then(function (data) {
        var msg = data && data.choices && data.choices[0] && data.choices[0].message;
        var text = msg && typeof msg.content === "string" ? msg.content.trim() : "";
        return text || null;
      }, function () { return null; });
    }, WONDER_TIMEOUT_MS);
  }
  /* Draft a committee answer for a selected post. Input is the post object
     (verbatim body, topic, ref, frozen authorState). Resolves the clean
     draft text (no "Sample committee response:" prefix — the UI labels it
     as a draft), or null when Wonder is unavailable. */
  function draftCommitteeAnswer(post) {
    if (!post || !getKey()) return Promise.resolve(null);
    var user = "Reference code: " + (post.ref || "") + "\n" +
      "Topic: " + (post.topic || "") + "\n" +
      "Author state: " + (post.authorState || "not stated") + "\n" +
      "Citizen post (verbatim):\n" + String(post.body || "");
    return wonderChat(ANSWER_SYSTEM, user).then(function (text) {
      if (!text) return null;
      return text.replace(/^Sample committee response:\s*/i, "").trim() || null;
    });
  }
  /* ---------- on-demand post translation (multilingual slice, step 4) ----
     Reader aid only: the original post is ALWAYS the official record and is
     never altered, hidden, or replaced. Translation runs only when the reader
     clicks, into the reader's current UI language. Same endpoint and same
     sessionStorage footer key as the other transports -- no second key.
     Model muse-spark-1.3 per the translate-only system prompt below.
     On ANY failure (no key, timeout, error, model rejected) resolves null
     so the caller shows the unavailable note. NEVER retries, NEVER falls
     back to another model: one attempt, then the note. */
  var TRANSLATE_TRANSPORT = {
    endpoint: "https://api.meta.ai/v1/chat/completions",
    model: "muse-spark-1.3"
  };
  var TRANSLATE_TIMEOUT_MS = 30000; /* one attempt, same budget as drafts */
  function translateSystem(sourceCode, targetCode) {
    return "Translate the following text from " + langNameEn(sourceCode) +
      " to " + langNameEn(targetCode) +
      ". Translate only: do not correct, reword, summarize, or add anything. Return only the translation.";
  }
  function translateChat(systemText, userText) {
    var t = TRANSLATE_TRANSPORT;
    var key = getKey();
    if (!t.endpoint || !t.model || !key) return Promise.resolve(null);
    var content = systemText + "\n\n" + userText;
    return withTimeout(function (signal) {
      var opts = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: t.model, messages: [{ role: "user", content: content }] })
      };
      if (signal) opts.signal = signal;
      return fetch(t.endpoint, opts).then(function (resp) {
        if (!resp.ok) throw new Error("model api " + resp.status);
        return resp.json();
      }).then(function (data) {
        var msg = data && data.choices && data.choices[0] && data.choices[0].message;
        var text = msg && typeof msg.content === "string" ? msg.content.trim() : "";
        return text || null;
      }, function () { return null; });
    }, TRANSLATE_TIMEOUT_MS);
  }
  /* Translate a post body for display. Returns the translated text, or null
     when unavailable (caller shows the unavailable note; no retry). The
     stored post and every record keep the original. */
  function translatePost(text, sourceCode, targetCode) {
    if (!text || !sourceCode || !targetCode) return Promise.resolve(null);
    if (!getKey()) return Promise.resolve(null);
    return translateChat(translateSystem(sourceCode, targetCode), String(text));
  }


  var api = {
    mode: "stub",
    WORD_LIMIT: WORD_LIMIT,
    countWords: countWords,
    formatTimer: formatTimer,
    checkText: checkText,
    clarityOf: clarityOf,
    tidyDraft: tidyDraft,
    findTopSimilar: findTopSimilar,
    suggestTopic: suggestTopic,
    checkTextLive: checkTextLive,
    checkClarityLive: checkClarityLive,
    findTopSimilarLive: findTopSimilarLive,
    suggestTopicLive: suggestTopicLive,
    topicLabels: TOPIC_KEYWORDS.map(function (pair) { return pair[0]; }),
    draftCommitteeAnswer: draftCommitteeAnswer,
    translatePost: translatePost,
    WONDER_MODEL: WONDER_TRANSPORT.model,
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    isLive: isLive,
    onModeChange: null
  };
  return api;
})();
