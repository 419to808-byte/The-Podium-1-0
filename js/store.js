/* The Podium — store. localStorage persistence; re-seeds deterministically.
   Collections: citizens, cycles, posts, votes ("voterId:postId"), briefingItems. */
var PodiumStore = (function () {
  "use strict";

  var KEY = "podium1.v1";

  /* Civilian committee store (TY): members serving 12-week terms, drawn by
     random draw. Own key - never shares the demo keys or the main save.
     Missing or corrupt payloads yield an empty roster (corrupt bytes are
     preserved under a backup key); other stored data is never touched. */
  var COMMITTEE_KEY = "podium1.committee.v1";
  var COMMITTEE_MAX = 12, COMMITTEE_TERMS = 12;
  function blankCommittee() { return { members: [], maxSize: COMMITTEE_MAX, termWeeks: COMMITTEE_TERMS }; }
  function loadCommittee() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(COMMITTEE_KEY);
      if (!raw) return blankCommittee();
      var c = JSON.parse(raw);
      if (!c || !Array.isArray(c.members)) throw new Error("bad shape");
      c.members = c.members.slice(0, COMMITTEE_MAX);
      c.maxSize = COMMITTEE_MAX;
      c.termWeeks = COMMITTEE_TERMS;
      return c;
    } catch (e) {
      if (raw) { try { window.localStorage.setItem(COMMITTEE_KEY + ".bak", raw); } catch (e2) {} }
      return blankCommittee();
    }
  }
  function saveCommittee(c) {
    try { window.localStorage.setItem(COMMITTEE_KEY, JSON.stringify(c || blankCommittee())); } catch (e) { /* private mode */ }
  }

  /* Current voting cycle follows the calendar date (cycle rollover):
     the cycle whose voting window contains today's ET date (inclusive).
     Past all windows, the latest started cycle (the feed never empties);
     before all windows, the earliest cycle. Pure over state + clock, like
     replayCycles — callers pass the app's ET now (etNow). When no clock is
     available the legacy frozen cycle is used so behavior cannot regress. */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function etDay(nowEt) {
    return nowEt.getFullYear() + "-" + pad2(nowEt.getMonth() + 1) + "-" + pad2(nowEt.getDate());
  }
  var ET_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /* Naive ET wall-clock stamp ("YYYY-MM-DDTHH:MM:SS"), the seed's format, so
     plain string comparison orders user posts with seed posts correctly —
     including across the ET midnight boundary. */
  function etStamp(nowEt) {
    return etDay(nowEt) + "T" + pad2(nowEt.getHours()) + ":" + pad2(nowEt.getMinutes()) + ":" + pad2(nowEt.getSeconds());
  }
  /* Display date derived at render time so a user post ages after reload
     instead of reading "just now" forever. Seed posts carry frozen dates
     and render unchanged. */
  function displayDateFor(p, nowEt) {
    if (!p || (p.displayDate && p.displayDate !== "just now")) return p ? p.displayDate : "";
    var created = p.createdAt || "";
    var day = "", mon = 0, mday = 0;
    if (/Z$/.test(created)) {
      /* Legacy UTC stamps (pre-naive-format saves): convert the instant to ET wall time. */
      var d = new Date(new Date(created).toLocaleString("en-US", { timeZone: "America/New_York" }));
      if (isNaN(d.getTime())) return "just now";
      day = etDay(d); mon = d.getMonth(); mday = d.getDate();
    } else {
      var m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(created);
      if (!m) return "just now";
      day = m[1] + "-" + m[2] + "-" + m[3]; mon = Number(m[2]) - 1; mday = Number(m[3]);
    }
    if (!nowEt || day === etDay(nowEt)) return "just now";
    return ET_MONTHS[mon] + " " + mday;
  }
  function currentCycleId(s, nowEt) {
    var cycles = (s && s.cycles) || [];
    if (!nowEt || !cycles.length) {
      /* No clock (or no cycles): fall back to the latest-started cycle, so a
         clock-free caller still lands on the newest feed rather than a
         hardcoded id. */
      var latest = null, i;
      for (i = 0; i < cycles.length; i++) {
        if (cycles[i].votingStart && (!latest || cycles[i].votingStart > latest.votingStart)) latest = cycles[i];
      }
      return latest ? latest.id : (cycles.length ? cycles[0].id : null);
    }
    var today = etDay(nowEt), i, c;
    for (i = 0; i < cycles.length; i++) {
      c = cycles[i];
      if (c.votingStart && c.votingEnd && c.votingStart <= today && today <= c.votingEnd) return c.id;
    }
    var past = null;
    for (i = 0; i < cycles.length; i++) {
      c = cycles[i];
      if (c.votingStart && c.votingStart <= today) past = c.id;
    }
    if (past) return past;
    return cycles[0].id;
  }
  /* Post integrity (TY, Nov 3): real SHA-256, computed locally — no
     network, no dependency. Compact synchronous implementation so hashes
     are stamped at seed/publish and recomputed at display without async
     plumbing. Verified against the "abc" test vector (ba7816bf...15ad).
     Real-product hook: swap this primitive for the platform crypto module
     (SubtleCrypto now, a FIPS 140-3 validated module in the hosted
     product); the hash INPUT format below stays the same. */
  function utf8Bytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) { out.push(c); continue; }
      if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); continue; }
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) {
          var cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++; continue;
        }
      }
      out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return out;
  }
  function sha256Hex(str) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var b = utf8Bytes(str);
    var bitLen = b.length * 8;
    b.push(0x80);
    while ((b.length % 64) !== 56) b.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64), off, i;
    for (off = 0; off < b.length; off += 64) {
      for (i = 0; i < 16; i++) w[i] = (b[off + i * 4] << 24) | (b[off + i * 4 + 1] << 16) | (b[off + i * 4 + 2] << 8) | b[off + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], cc = H[2], dd = H[3], ee = H[4], ff = H[5], gg = H[6], hh = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rr(ee, 6) ^ rr(ee, 11) ^ rr(ee, 25);
        var ch = (ee & ff) ^ ((~ee) & gg);
        var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        var mj = (a & bb) ^ (a & cc) ^ (bb & cc);
        var t2 = (S0 + mj) | 0;
        hh = gg; gg = ff; ff = ee; ee = (dd + t1) | 0; dd = cc; cc = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + dd) | 0;
      H[4] = (H[4] + ee) | 0; H[5] = (H[5] + ff) | 0; H[6] = (H[6] + gg) | 0; H[7] = (H[7] + hh) | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) out += ("00000000" + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
  }
  /* Hash input, exactly: body + "|" + authorName + "|" + authorState +
     "|" + createdAt + "|" + ref. authorName is the citizen display name
     (authorId lookup) or the inline author when a record carries one
     instead of an authorId. Stored as post.hash at seed/publish time;
     recomputed at display; a mismatch is tampering. */
  function postAuthorName(s, p) {
    if (p.authorId) {
      var c = citizenById(s, p.authorId);
      if (c && c.name && c.name !== "Unknown citizen") return c.name;
    }
    return p.author || "Unknown citizen";
  }
  function hashPost(s, p) {
    return sha256Hex([(p && p.body) || "", postAuthorName(s, p), (p && p.authorState) || "", (p && p.createdAt) || "", (p && p.ref) || ""].join("|"));
  }
  /* Hash-chained audit log (TY, Nov 3): every listed action appends an
     entry {t, ev, ref, d, prev, h} where
       h = sha256(prev + "|" + t + "|" + ev + "|" + ref + "|" + d)
     and prev is the previous entry's h (64 zeros for genesis).
     Recomputing the chain detects any edit, reorder, or deletion.
     Entries live in the saved state (state.audit) beside votes and posts;
     verifyAudit re-checks the chain at display. */
  var GENESIS_PREV = "0000000000000000000000000000000000000000000000000000000000000000";
  function auditHash(prev, t, ev, ref, d) {
    return sha256Hex([prev, t, ev, ref, d].join("|"));
  }
  function chainPush(log, t, ev, ref, d) {
    var prev = log.length ? log[log.length - 1].h : GENESIS_PREV;
    var e = { t: t, ev: ev, ref: ref || "", d: d || "", prev: prev };
    e.h = auditHash(e.prev, e.t, e.ev, e.ref, e.d);
    log.push(e);
    return e;
  }
  function auditAppend(s, ev, ref, d, nowEt) {
    if (!s.audit) s.audit = [];
    var e = chainPush(s.audit, etStamp(nowEt || new Date()), ev, ref, d);
    save(s);
    return e;
  }
  /* Seeded history: genesis first, then one "post" entry per post
     (t = createdAt), one "draw" entry per drawn cycle (t = drawAt),
     one "approve" entry per briefing item with an answer
     (t = briefingAt, ref = post ref + "-A"), and one "update" entry per
     seeded status update (t = cycle year + update date, ref + "-Un").
     Deterministic order: posts in state order, then cycles, then items. */
  function buildAudit(posts, cycles, items) {
    var log = [];
    chainPush(log, "genesis", "genesis", "podium", "audit log genesis");
    (posts || []).forEach(function (p) {
      if (!p || !p.id) return;
      chainPush(log, p.createdAt || "undated", "post", p.ref || p.id, p.id);
    });
    var refByPostId = {};
    (posts || []).forEach(function (p) { if (p && p.id) refByPostId[p.id] = p.ref || p.id; });
    var cycById = {};
    (cycles || []).forEach(function (c) { if (c && c.id) cycById[c.id] = c; });
    function yearOf(cycleId) {
      var c = cycById[cycleId];
      var m = c && /^(\d{4})-\d{2}-\d{2}$/.exec(c.votingStart || "");
      return m ? m[1] : "2026";
    }
    (cycles || []).forEach(function (c) {
      if (!c || !c.id || !(c.poolSize > 0)) return;
      chainPush(log, c.drawAt || "undrawn", "draw", c.id, "pool " + c.poolSize + " position " + c.position);
    });
    (items || []).forEach(function (b) {
      if (!b || !b.postId) return;
      var ref = refByPostId[b.postId] || b.postId;
      var c = cycById[b.cycleId];
      var bat = (c && c.briefingAt) || "unbriefed";
      if (b.answer) chainPush(log, bat, "approve", ref + "-A", b.trackerStatus || "");
      (b.updates || []).forEach(function (u, i) {
        if (!u) return;
        chainPush(log, yearOf(b.cycleId) + " " + (u.date || "undated"), "update", ref + "-U" + (i + 1), u.status || "");
      });
    });
    return log;
  }
  function verifyAudit(audit) {
    var prev = GENESIS_PREV;
    for (var i = 0; i < (audit || []).length; i++) {
      var e = audit[i];
      if (!e || e.prev !== prev) return { ok: false, index: i + 1 };
      if (e.h !== auditHash(e.prev, e.t, e.ev, e.ref, e.d)) return { ok: false, index: i + 1 };
      prev = e.h;
    }
    return { ok: true, index: 0 };
  }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function pad4(n) {
    var s = String(n);
    while (s.length < 4) s = "0" + s;
    return s;
  }
  /* Topic letter from the topics-list order (A, B, C, ...). Frozen per post
     at publish time and stored on the post; never recomputed afterward. */
  function refLetter(topics, topic) {
    var i = topics.indexOf(topic);
    if (i < 0 || i > 25) return "Z";
    return String.fromCharCode(65 + i);
  }

  function refNumber(ref) {
    var m = /^[A-Z]-(\d+)$/.exec(ref || "");
    return m ? parseInt(m[1], 10) : 0;
  }

  function seedState() {
    var s = deepCopy(PODIUM_SEED);
    /* Reference codes are permanent: seed posts carry their frozen codes, so
       retained posts keep the same code on a fresh load as in migrated
       state. Only posts without a code are numbered, continuing the
       platform-wide counter past the highest frozen number. */
    var ordered = s.posts.slice().sort(function (a, b) {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return a.id < b.id ? -1 : 1;
    });
    var seq = 0;
    ordered.forEach(function (p) {
      seq = Math.max(seq, refNumber(p.ref));
    });
    ordered.forEach(function (p) {
      if (!p.ref) {
        seq += 1;
        p.ref = refLetter(s.topics, p.topic) + "-" + pad4(seq);
      }
    });
    var out = {
      version: s.version,
      citizens: s.citizens,
      topics: s.topics,
      cycles: s.cycles,
      posts: s.posts,
      briefingItems: s.briefingItems,
      votes: {}, /* "voterId:postId" -> true */
      currentUserId: null,
      userSeq: 0,
      refSeq: seq,
      audit: [],
      sysIssues: [], /* committee help-box system issues (tracked categories), oldest first */
    };
    /* Post-integrity stamps + seeded audit history, so a fresh profile is
       verifiable and non-empty on first load. */
    out.posts.forEach(function (p) { if (p && !p.hash) p.hash = hashPost(out, p); });
    out.audit = buildAudit(out.posts, out.cycles, out.briefingItems);
    return out;
  }

  /* Defensive backfill for partially-written same-version state: fill only
     fields that are entirely missing, never overwrite present data. Keeps a
     truncated save from crashing later derefs (citizens, votes, refSeq). */
  function normalizeState(s) {
    /* The seed copy (all 217 posts, sorted for numbering) is built lazily:
       each branch below pre-scans for work first, so a complete save never
       pays for the copy. needSeed memoizes — at most one copy per call. */
    var seed = null;
    function needSeed() { if (!seed) seed = seedState(); return seed; }
    var filled = false;
    if (!s.citizens) { s.citizens = needSeed().citizens; filled = true; }
    if (!s.topics) { s.topics = needSeed().topics; filled = true; }
    if (!s.briefingItems) { s.briefingItems = needSeed().briefingItems; filled = true; }
    if (!s.sysIssues) { s.sysIssues = []; filled = true; }
    /* Seed-answer migration (TY, Oct 28): Ana's w1 answer changed from
       "will fund" to "will ask for funds … allocate the funds …". Saved
       states pin the old string, so refresh it — but only where it is
       still byte-identical to the old seed wording (w1 Ana only); anything
       a session may have altered is left alone. Drafts and approvals live
       outside saved state, so this cannot clobber committee work. */
    var OLD_W1_ANA = "Sample committee response: the committee will fund a two-year pilot of quarterly mobile cardiac screening in twelve rural counties, with schedules published one year ahead, routed through the Department of Health and Human Services and state health departments.";
    var needsAna = (s.briefingItems || []).some(function (b) { return b && b.postId === "p-w1-05" && b.answer === OLD_W1_ANA; });
    if (needsAna) {
      var seedAna = null;
      needSeed().briefingItems.forEach(function (b) { if (b.postId === "p-w1-05") seedAna = b; });
      if (seedAna) {
        (s.briefingItems || []).forEach(function (b) {
          if (b && b.postId === "p-w1-05" && b.answer === OLD_W1_ANA) { b.answer = seedAna.answer; filled = true; }
        });
      }
    }
    /* Same pattern for the Week 3 finals (TY, Oct 28, F1): saved states
       pin the old "(in preparation; briefing Nov 4)" placeholders, so
       refresh each — but only where still byte-identical to its old seed
       wording; a diverged (user-edited) answer is left alone. */
    var OLD_W3 = {
      "p-w3-01": "Sample committee response (in preparation; briefing Nov 4): the committee is formulating a three-year phase-in plan for the twenty-five-student classroom maximum, routed through the Department of Education and state education agencies.",
      "p-w3-09": "Sample committee response (in preparation; briefing Nov 4): the committee is drafting the plain-language juror guide for mailing with every summons, routed through the Administrative Office of the Courts and state court administrators."
    };
    var needsW3 = (s.briefingItems || []).some(function (b) { return b && OLD_W3[b.postId] && b.answer === OLD_W3[b.postId]; });
    if (needsW3) {
      var seedW3 = {};
      needSeed().briefingItems.forEach(function (b) { if (OLD_W3[b.postId]) seedW3[b.postId] = b; });
      (s.briefingItems || []).forEach(function (b) {
        if (b && OLD_W3[b.postId] && b.answer === OLD_W3[b.postId] && seedW3[b.postId]) { b.answer = seedW3[b.postId].answer; filled = true; }
      });
    }
    /* Backfill voting windows onto saved cycles (the rollover needs them).
       Seed values only, never overwritten where present. */
    var needsWindows = (s.cycles || []).some(function (c) { return !c.votingStart || !c.votingEnd; });
    if (needsWindows) {
      var seedCyc = {};
      needSeed().cycles.forEach(function (c) { seedCyc[c.id] = c; });
      (s.cycles || []).forEach(function (c) {
        var sc = seedCyc[c.id];
        if (sc) {
          if (!c.votingStart && sc.votingStart) { c.votingStart = sc.votingStart; filled = true; }
          if (!c.votingEnd && sc.votingEnd) { c.votingEnd = sc.votingEnd; filled = true; }
        }
      });
    }
    /* Backfill missing states by id, only where blank: new seed assignments
       reach old saves with no reseed and no data loss. User-chosen states
       and frozen post states are preserved. */
    var needsStates = (s.citizens || []).some(function (c) { return !c.state; }) ||
      (s.posts || []).some(function (p) { return !p.authorState; });
    if (needsStates) {
      var seedCit = {};
      needSeed().citizens.forEach(function (c) { seedCit[c.id] = c; });
      (s.citizens || []).forEach(function (c) {
        if (!c.state && seedCit[c.id] && seedCit[c.id].state) { c.state = seedCit[c.id].state; filled = true; }
      });
      var seedPost = {};
      needSeed().posts.forEach(function (p) { seedPost[p.id] = p; });
      (s.posts || []).forEach(function (p) {
        if (!p.authorState && seedPost[p.id] && seedPost[p.id].authorState) { p.authorState = seedPost[p.id].authorState; filled = true; }
      });
    }
    /* Language-tag backfill (multilingual step 1): old saves predate the
       frozen lang tag, and all old content is English. Never overwritten
       where present. */
    (s.posts || []).forEach(function (p) {
      if (p && !p.lang) { p.lang = "en"; filled = true; }
    });
    /* Post-integrity backfill for pre-feature saves: stamp hashes computed
       from the current bytes (missing only; a stored hash is never
       recomputed here, so a later mismatch at display still flags
       tampering). */
    (s.posts || []).forEach(function (p) {
      if (p && !p.hash) { p.hash = hashPost(s, p); filled = true; }
    });
    /* Audit-log backfill for pre-feature saves: build the seeded history
       from the merged state (includes the visitor own posts). Saves that
       already carry a log keep their chain untouched. */
    if (!s.audit) { s.audit = buildAudit(s.posts, s.cycles, s.briefingItems); filled = true; }
    /* One-time stamp migration: user posts saved with ISO-UTC createdAt
       predate the naive ET-wall format. Convert in place so string ordering
       matches seed posts; the instant is preserved. */
    s.posts.forEach(function (p) {
      if (p && typeof p.id === "string" && p.id.indexOf("u-") === 0 && typeof p.createdAt === "string" && /Z$/.test(p.createdAt)) {
        var inst = new Date(p.createdAt);
        if (!isNaN(inst.getTime())) {
          p.createdAt = etStamp(new Date(inst.toLocaleString("en-US", { timeZone: "America/New_York" })));
          filled = true;
        }
      }
    });
    if (!s.votes) { s.votes = {}; filled = true; }
    if (typeof s.refSeq !== "number" || !(s.refSeq >= 0)) {
      filled = true;
      var maxRef = needSeed().refSeq;
      s.posts.forEach(function (p) {
        var m = /-(\d+)$/.exec(p.ref || "");
        if (m && Number(m[1]) > maxRef) maxRef = Number(m[1]);
      });
      s.refSeq = maxRef;
    }
    return { state: s, filled: filled };
  }

  var BACKUP_KEY = KEY + ".bak";
  /* Salvage path for saves the current version cannot load (old version or
     shape drift): carry user posts (u- ids), their votes, and the user id
     into a fresh seed. Seed-shaped content always comes from the seed.
     Returns a state object, or null when nothing is salvageable. */
  function migrateLegacy(raw) {
    var old = null;
    try { old = JSON.parse(raw); } catch (e) { return null; }
    if (!old || typeof old !== "object") return null;
    var fresh = seedState();
    var have = false;
    var seen = {};
    fresh.posts.forEach(function (p) { seen[p.id] = true; });
    (Array.isArray(old.posts) ? old.posts : []).forEach(function (p) {
      if (!p || typeof p.id !== "string" || seen[p.id]) return;
      if (p.id.indexOf("u-") !== 0) return;
      fresh.posts.push(p); seen[p.id] = true; have = true;
    });
    /* Salvaged user posts predate the audit log: record their publication
       from their own timestamps so the chain covers them too. */
    fresh.posts.forEach(function (p) {
      if (p && p.id && p.id.indexOf("u-") === 0) {
        if (!p.hash) p.hash = hashPost(fresh, p);
        chainPush(fresh.audit, p.createdAt || "undated", "post", p.ref || p.id, p.id);
      }
    });
    var keepIds = {};
    fresh.posts.forEach(function (p) { keepIds[p.id] = true; });
    fresh.votes = {};
    if (old.votes && typeof old.votes === "object") {
      Object.keys(old.votes).forEach(function (k) {
        var pid = k.slice(k.indexOf(":") + 1);
        if (keepIds[pid]) { fresh.votes[k] = old.votes[k]; have = true; }
      });
    }
    if (old.currentUserId && citizenById(fresh, old.currentUserId)) {
      fresh.currentUserId = old.currentUserId; have = true;
    }
    if (typeof old.userSeq === "number" && old.userSeq > fresh.userSeq) fresh.userSeq = old.userSeq;
    var maxRef = fresh.refSeq;
    fresh.posts.forEach(function (p) {
      var m = /-(\d+)$/.exec(p.ref || "");
      if (m && Number(m[1]) > maxRef) maxRef = Number(m[1]);
    });
    fresh.refSeq = maxRef;
    return have ? fresh : null;
  }
  function load(nowEt) {
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.version === PODIUM_SEED.version && s.posts && s.cycles) {
          var norm = normalizeState(s);
          var out = cleanupClosedCycles(norm.state, nowEt);
          collapseExtraVotes(out, nowEt); /* one vote per citizen per cycle */
          if (norm.filled) save(out); /* persist the migration exactly once */
          return out;
        }
        /* Version mismatch or shape drift: never silently wipe the user's
           posts and votes. Preserve the exact old payload under a backup
           key, then migrate what can be migrated into a fresh seed. */
        try { window.localStorage.setItem(BACKUP_KEY, raw); } catch (e) {}
        var migrated = migrateLegacy(raw);
        if (migrated) {
          if (typeof console !== "undefined" && console.warn) console.warn("Podium: saved state version mismatch; user posts/votes migrated, original preserved under " + BACKUP_KEY + ".");
          var mnorm = normalizeState(migrated);
          var mout = cleanupClosedCycles(mnorm.state, nowEt);
          collapseExtraVotes(mout, nowEt);
          save(mout);
          return mout;
        }
        if (typeof console !== "undefined" && console.warn) console.warn("Podium: saved state unreadable or empty; starting fresh, original preserved under " + BACKUP_KEY + ".");
      }
    } catch (e) { /* corrupted or unavailable: back up, then reseed below */ }
    if (raw) {
      /* Unparseable payload: preserve the exact bytes under the backup key
         before reseeding, so nothing is ever silently destroyed. */
      try { window.localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* backup-only */ }
      if (typeof console !== "undefined" && console.warn) console.warn("Podium: saved state unparseable; starting fresh, original preserved under " + BACKUP_KEY + ".");
    }
    var fresh = seedState();
    save(fresh);
    return fresh;
  }

  /* Real-product hook: encrypted off-site backups replicate the payload
     written below (envelope-encrypted with a KMS/HSM data key, FedRAMP-
     authorized object store, WORM retention) - never plaintext copies. */
  function save(s) {
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: session-only */ }
  }

  /* ---- Civilian committee draw + weekly rotation (TY) ----
   Beacon rule (same as the post draw): position = beaconNum mod poolSize + 1
   over the ordered eligible pool. Deterministic: the same beacon value over
   the same ordered pool always selects the same citizen - anyone can replay
   it from the recorded beaconValue, poolSize, and declines list.
   There is deliberately NO Math.random anywhere in this file: if the NIST
   beacon is unavailable the draw is recorded as failed/pending and no
   member is added. */
  var NIST_BEACON_URL = "https://beacon.nist.gov/beacon/2.0/pulse/last";
  var BEACON_TIMEOUT_MS = 10000;
  var WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function isoDay(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function fmtDay(d) { return WD_SHORT[d.getDay()] + " " + ET_MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); }
  function addDaysISO(iso, n) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return ""; var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); d.setDate(d.getDate() + n); return isoDay(d); }
  function addYearsISO(iso, n) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return ""; var d = new Date(Number(m[1]) + n, Number(m[2]) - 1, Number(m[3])); return isoDay(d); }
  function mondayOfWeek(d) { var m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }
  /* Fetch the latest NIST beacon pulse. Resolves {ok:true, beaconTimestamp
     (the pulse's own ISO timestamp), beaconValue (full hex outputValue),
     beaconNum (numeric excerpt: last 12 hex chars, safely below 2^53)} or
     {ok:false, reason}. Never throws, never falls back to local randomness. */
  function fetchCommitteeBeacon(url, timeoutMs) {
    var u = url || NIST_BEACON_URL;
    var ms = (typeof timeoutMs === "number" && timeoutMs > 0) ? timeoutMs : BEACON_TIMEOUT_MS;
    function fail(reason) { return { ok: false, reason: reason }; }
    try {
      if (typeof window.fetch !== "function") return Promise.resolve(fail("no-fetch"));
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } }, ms);
      var opts = ctrl ? { signal: ctrl.signal } : {};
      return window.fetch(u, opts).then(function (r) {
        clearTimeout(timer);
        if (!r || !r.ok) return fail("bad-status");
        return r.json().then(function (j) {
          var p = (j && (j.pulse || j)) || {};
          var hex = String(p.outputValue || "");
          if (!/^[0-9a-fA-F]+$/.test(hex)) return fail("bad-value");
          var num = parseInt(hex.slice(-12), 16);
          if (isNaN(num)) return fail("bad-value");
          return { ok: true, beaconTimestamp: String(p.timeStamp || ""), beaconValue: hex.toLowerCase(), beaconNum: num };
        }, function () { return fail("bad-json"); });
      }, function () { clearTimeout(timer); return fail("fetch-failed"); });
    } catch (e) { return Promise.resolve(fail("fetch-error")); }
  }
  /* Eligibility for the committee draw. Citizen flags (set when a citizen agrees
     to serve): verified, agreedToServe, declined (declines the drawn seat when
     true - the draw skips past them), govEmployee, isFelon, felonySentenceEndISO, age.
     Unknown age / employee status, and unknown felon status (isFelon not true),
     pass here; agreement-time verification owns those gates. Felons are excluded
     while incarcerated or on parole/probation, and become eligible again 5
     calendar years after the sentence fully ends, per felonySentenceEndISO
     ("YYYY-MM-DD", recorded at agreement-time verification). A felon with no
     recorded completion date fails closed (ineligible).
     ctx: {cycleId, posts, members, pastMembers, mondayISO}. */
  function committeeEligible(c, ctx) {
    if (!c) return false;
    if (c.verified !== true) return false;
    if (c.agreedToServe !== true) return false;
    if (typeof c.age === "number" && c.age < 18) return false;
    if (c.govEmployee === true) return false;
    if (c.isFelon === true) {
      var endISO = c.felonySentenceEndISO, monISO = ctx && ctx.mondayISO;
      if (typeof endISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endISO)) return false;
      if (typeof monISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(monISO)) return false;
      if (endISO > addYearsISO(monISO, -5)) return false;
    }
    var i, members = (ctx && ctx.members) || [], posts = (ctx && ctx.posts) || [];
    for (i = 0; i < members.length; i++) { if (members[i] && members[i].id === c.id) return false; }
    for (i = 0; i < posts.length; i++) {
      if (posts[i] && posts[i].authorId === c.id && posts[i].cycleId === (ctx && ctx.cycleId)) return false;
    }
    var past = (ctx && ctx.pastMembers) || [], cutoff = ctx && ctx.mondayISO;
    if (cutoff) {
      for (i = 0; i < past.length; i++) {
        var e = past[i];
        if (e && e.id === c.id && e.termEndISO && e.termEndISO > addDaysISO(cutoff, -84)) return false;
      }
    }
    return true;
  }
  /* One draw from the ordered eligible pool. Returns {ok:true, member, declines,
     draw:{beaconTimestamp, beaconValue, poolSize (eligible pool at draw time),
     position (1-based index into the pool after removing earlier declines)}}.
     Replay rule: sort the eligible pool by id, drop the recorded declines in
     order, then position = beaconNum mod remaining + 1. Empty pool or missing
     beacon resolves failed with no member - nothing is invented. */
  function drawCommitteeMember(pool, beacon) {
    if (!beacon || beacon.ok !== true || typeof beacon.beaconNum !== "number" || isNaN(beacon.beaconNum)) {
      return { ok: false, reason: "beacon-unavailable", member: null };
    }
    var ordered = (pool || []).slice().sort(function (a, b) {
      return String(a && a.id || "") < String(b && b.id || "") ? -1 : 1;
    });
    if (!ordered.length) return { ok: false, reason: "no-eligible", member: null };
    var declines = [], remaining = ordered.slice();
    while (remaining.length) {
      var pos = (beacon.beaconNum % remaining.length) + 1;
      var pick = remaining[pos - 1];
      if (pick && pick.declined === true) { declines.push(pick.id); remaining.splice(pos - 1, 1); continue; }
      return { ok: true, member: pick, declines: declines,
        draw: { beaconTimestamp: beacon.beaconTimestamp || "", beaconValue: beacon.beaconValue || "",
          poolSize: ordered.length, position: pos } };
    }
    return { ok: false, reason: "no-eligible", member: null, declines: declines };
  }
  /* Answer approval record (TY): stamp which serving committee member approved
     an answer. Validates memberId against the CURRENT roster (never invents a
     person); drafts and items without a record are untouched. The approvedBy
     snapshot {memberId, name, state, termWeek} lives on the briefing item, so
     it persists with the answer via the normal state save. Answer text is
     never modified here. */
  function recordApproval(state, committee, postId, memberId) {
    var roster = (committee && committee.members) || [];
    if (!roster.length) return { ok: false, reason: "empty-roster" };
    var m = null, i;
    for (i = 0; i < roster.length; i++) { if (roster[i] && roster[i].id === memberId) { m = roster[i]; break; } }
    if (!m) return { ok: false, reason: "not-serving" };
    var items = (state && state.briefingItems) || [], item = null;
    for (i = 0; i < items.length; i++) { if (items[i] && items[i].postId === postId) { item = items[i]; break; } }
    if (!item) return { ok: false, reason: "no-item" };
    item.approvedBy = { memberId: m.id, name: m.name, state: m.state, termWeek: m.termWeek };
    return { ok: true, approvedBy: item.approvedBy };
  }
  /* Citation record (TY): stamp the commitments' cited sources onto the
     briefing item at approval. Each entry is free text {commitment, source,
     date} filled in by the committee; no picker, no database. noCommit records
     an explicit "no commitments" mark. Lives on the item, so it persists
     with the answer via the normal state save. Answer text is never modified. */
  function recordCitations(state, postId, list, noCommit) {
    var items = (state && state.briefingItems) || [], item = null, i;
    for (i = 0; i < items.length; i++) { if (items[i] && items[i].postId === postId) { item = items[i]; break; } }
    if (!item) return { ok: false, reason: "no-item" };
    if (!noCommit) {
      if (!list || !list.length) return { ok: false, reason: "need-citations" };
      for (i = 0; i < list.length; i++) {
        if (!list[i] || !String(list[i].commitment || "").trim() || !String(list[i].source || "").trim() || !String(list[i].date || "").trim()) return { ok: false, reason: "need-citations" };
      }
    }
    item.citations = (list || []).map(function (c) { var o = { commitment: String(c.commitment), source: String(c.source), date: String(c.date) }; if (c.liaison !== undefined && c.liaison !== null && String(c.liaison).trim() !== "") o.liaison = String(c.liaison); return o; });
    item.noCommitments = !!noCommit;
    return { ok: true, citations: item.citations };
  }
  /* Answer record (TY, Nov 4): stamp the approved draft's text and agency
     request onto the briefing item at approval, so the answer (and the
     Saturday send's request text) survives reload. Session drafts are
     ephemeral; the item is the record. A missing agency request is not a
     failure — the request was never part of the Approve gate. */
  function recordAnswer(state, postId, text, agencyReq) {
    var items = (state && state.briefingItems) || [], item = null, i;
    for (i = 0; i < items.length; i++) { if (items[i] && items[i].postId === postId) { item = items[i]; break; } }
    if (!item) return { ok: false, reason: "no-item" };
    if (!String(text || "").trim()) return { ok: false, reason: "need-answer" };
    item.answer = String(text);
    if (typeof agencyReq === "string" && agencyReq.trim()) item.agencyRequest = agencyReq;
    return { ok: true };
  }
  /* Decline record (TY, Nov 4): stamp a decline marker plus the committee's
     required reason onto the briefing item at decline, so a decided post
     stays decided across reload (a declined draft is never re-drafted; the
     post reverts to shine light, reason shown on the tracker). */
  function recordDecline(state, postId, reason) {
    var items = (state && state.briefingItems) || [], item = null, i;
    for (i = 0; i < items.length; i++) { if (items[i] && items[i].postId === postId) { item = items[i]; break; } }
    if (!item) return { ok: false, reason: "no-item" };
    if (!String(reason || "").trim()) return { ok: false, reason: "need-reason" };
    item.declined = true;
    item.declineReason = String(reason).trim();
    return { ok: true };
  }
  /* System issue record (TY, Nov 4): a tracked-category help request and
     Wonder's answer, listed on the Status Updates tab so the committee can
     follow through. How-to questions are answered in the box only. */
  function recordSysIssue(state, category, question, answer, nowEt) {
    var items = (state && state.sysIssues) || null;
    if (!items) return { ok: false, reason: "no-store" };
    if (!question || !String(question).trim()) return { ok: false, reason: "need-question" };
    var issue = { t: etStamp(nowEt || new Date()), category: String(category || "other"), question: String(question), answer: String(answer || "") };
    items.push(issue);
    return { ok: true, issue: issue };
  }
  /* Weekly rotation (runs on the Monday draw). Cycles out every termWeek >= 12
     member into pastMembers (kept, never deleted), draws ONE replacement from
     the eligible pool, adds them as term week 1 dated this Monday (+84d cycle-out),
     and increments the rest. Guard: lastRotation stamps the Monday already
     handled, so reloads never double-rotate. Beacon failure mutates nothing
     (retry on a later load); an empty pool still records the week but adds none.
     opts: {store, citizens, posts, cycleId, beacon, monday (ET-wall Date)}. */
  function rotateCommittee(opts) {
    var o = opts || {};
    var st = o.store || blankCommittee();
    if (!Array.isArray(st.members)) st.members = [];
    if (!Array.isArray(st.pastMembers)) st.pastMembers = [];
    var monday = (o.monday instanceof Date && !isNaN(o.monday.getTime())) ? o.monday : null;
    var monISO = monday ? isoDay(monday) : "";
    if (!monday || !monISO) return { ran: false, reason: "bad-monday", store: st };
    if (st.lastRotation === monISO) return { ran: false, reason: "already-rotated", store: st };
    var beacon = o.beacon;
    if (!beacon || beacon.ok !== true) return { ran: false, reason: "beacon-unavailable", store: st };
    var kept = [], out = [], i, m;
    for (i = 0; i < st.members.length; i++) {
      m = st.members[i];
      if (m && (m.termWeek || 0) >= 12) {
        out.push(m);
        st.pastMembers.push({ id: m.id, name: m.name, state: m.state, termStart: m.termStart || "", termEnd: m.cycleOutDate || "", termEndISO: m.cycleOutISO || monISO });
      } else if (m) { kept.push(m); }
    }
    st.members = kept;
    if (st.members.length >= COMMITTEE_MAX && !out.length) return { ran: false, reason: "roster-full", store: st };
    var ctx = { cycleId: o.cycleId, posts: o.posts || [], members: st.members, pastMembers: st.pastMembers, mondayISO: monISO };
    var pool = ((o.citizens) || []).filter(function (c) { return committeeEligible(c, ctx); });
    var added = null;
    var sel = drawCommitteeMember(pool, beacon);
    if (sel.ok && sel.member) {
      var c = sel.member;
      var startD = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
      var outD = new Date(startD.getTime()); outD.setDate(outD.getDate() + 84);
      added = { id: c.id, name: c.name, state: c.state, termStart: fmtDay(startD), termStartISO: isoDay(startD),
        termWeek: 1, cycleOutDate: fmtDay(outD), cycleOutISO: isoDay(outD),
        draw: sel.draw, verified: true, committeeMember: true };
      st.members.push(added);
    }
    for (i = 0; i < st.members.length; i++) {
      if (added && st.members[i] === added) continue;
      st.members[i].termWeek = (st.members[i].termWeek || 0) + 1;
    }
    st.lastRotation = monISO;
    return { ran: true, reason: sel.ok ? "rotated" : sel.reason, store: st, added: added, cycledOut: out };
  }
  /* Sunday 11:59 PM ET cutoff (TY, Nov 4): a past-votingEnd cycle is closed.
     Callers pass the app ET now; a missing clock fails open. Mirrors the demo. */
  function cycleVotingOpen(s, cycleId, nowEt) {
    var c = cycleById(s, cycleId);
    if (!c || !c.votingEnd || !nowEt) return true;
    return !(c.votingEnd < etDay(nowEt));
  }

  /* Standing cutoff rule: a post from a past cycle survives only if it was
     selected for a briefing (the top-voted winner or the random draw pick)
     or is a flagged retained copy. Posts from cycles that are
     not fully processed yet (voting still open, or briefing not yet aired)
     are never touched — so the rollover itself never deletes: the incoming
     cycle is current, and the outgoing cycle is still unbriefed. Votes on
     deleted posts are dropped with them. Runs on every load; this IS the
     cutoff job. */
  function isRetained(s, p, nowEt) {
    if (p.retainedCopy) return true; /* retained copies are exempt */
    if (p.cycleId === currentCycleId(s, nowEt)) return true;
    var c = cycleById(s, p.cycleId);
    if (!c) return true; /* unknown cycle: keep, never delete blindly */
    if (p.id === c.topPostId || p.id === c.randomPostId) return true;
    if (!nowEt) return true; /* no clock: keep, never delete blindly */
    if (!c.votingEnd || !(c.votingEnd < etDay(nowEt))) return true;
    var cy = cycleYear(c);
    var bAt = cycleDateTime(c.briefingAt, cy === null ? nowEt.getFullYear() : cy);
    if (!bAt || !(bAt <= nowEt)) return true;
    return false;
  }
  function cleanupClosedCycles(s, nowEt) {
    var keep = {};
    s.posts.forEach(function (p) { if (isRetained(s, p, nowEt)) keep[p.id] = true; });
    if (s.posts.every(function (p) { return keep[p.id]; })) return s;
    s.posts = s.posts.filter(function (p) { return keep[p.id]; });
    if (!s.votes) s.votes = {};
    Object.keys(s.votes).forEach(function (k) {
      var pid = k.slice(k.indexOf(":") + 1);
      if (!keep[pid]) delete s.votes[k];
    });
    save(s);
    return s;
  }

  /* ---- queries (pure over state) ---- */
  function citizenById(s, id) {
    for (var i = 0; i < s.citizens.length; i++) {
      if (s.citizens[i].id === id) return s.citizens[i];
    }
    return { id: id, name: "Unknown citizen" };
  }
  function postById(s, id) {
    for (var i = 0; i < s.posts.length; i++) {
      if (s.posts[i].id === id) return s.posts[i];
    }
    return null;
  }
  function postByRef(s, ref) {
    var want = String(ref).toUpperCase();
    for (var i = 0; i < s.posts.length; i++) {
      if (s.posts[i].ref && s.posts[i].ref.toUpperCase() === want) return s.posts[i];
    }
    return null;
  }
  function cycleById(s, id) {
    for (var i = 0; i < s.cycles.length; i++) {
      if (s.cycles[i].id === id) return s.cycles[i];
    }
    return null;
  }
  function briefingItemFor(s, postId) {
    for (var i = 0; i < s.briefingItems.length; i++) {
      if (s.briefingItems[i].postId === postId) return s.briefingItems[i];
    }
    return null;
  }
  function itemsForCycle(s, cycleId) {
    return s.briefingItems.filter(function (b) { return b.cycleId === cycleId; });
  }
  function postsForCycle(s, cycleId) {
    return s.posts.filter(function (p) { return p.cycleId === cycleId; });
  }
  /* Exact-text lookup within one cycle. Leading/trailing whitespace ignored,
     comparison is case-insensitive. */
  function findExactInCycle(s, cycleId, body) {
    var want = body.trim().toLowerCase();
    var found = null;
    postsForCycle(s, cycleId).forEach(function (p) {
      if (!found && p.body.trim().toLowerCase() === want) found = p;
    });
    return found;
  }
  function userPostInCycle(s, userId, cycleId) {
    for (var i = 0; i < s.posts.length; i++) {
      if (s.posts[i].authorId === userId && s.posts[i].cycleId === cycleId) return s.posts[i];
    }
    return null;
  }
  function hasVoted(s, voterId, postId) {
    return !!s.votes[voterId + ":" + postId];
  }

  /* ---- replay timing (TY, Oct 28; pure over state + clock) ----
     A cycle's replay becomes available at the same post-briefing flip as
     This Week and its briefing record: once its briefing datetime has
     passed on the America/New_York clock, never before. Derived from
     briefing datetimes and the clock, never from seed statuses. */
  var REPLAY_MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  /* Year anchor (TY, Oct 28): briefing/draw strings carry no year, so every
     caller anchors the year to the cycle's own votingStart (full year),
     never to the current clock year — otherwise old briefings vanish or
     "air" again in January. Null when the window is missing; callers then
     fall back to the clock year (previous behavior). */
  function cycleYear(c) {
    var m = /^(\d{4})-\d{2}-\d{2}$/.exec((c && c.votingStart) || "");
    return m ? Number(m[1]) : null;
  }
  function cycleDateTime(str, year) {
    var m = /([A-Z][a-z]{2}) (\d+), (\d+):(\d+) (AM|PM)/.exec(str || "");
    if (!m || REPLAY_MONTHS[m[1]] === undefined) return null;
    var hour = (Number(m[3]) % 12) + (m[5] === "PM" ? 12 : 0);
    return new Date(year, REPLAY_MONTHS[m[1]], Number(m[2]), hour, Number(m[4]));
  }
  function replayCycles(s, nowEt) {
    var clockYear = nowEt.getFullYear();
    var bat = function (c) {
      var y = cycleYear(c);
      return cycleDateTime(c.briefingAt, y === null ? clockYear : y);
    };
    var out = s.cycles.filter(function (c) {
      if (!c.topPostId) return false;
      var bAt = bat(c);
      return !!bAt && bAt <= nowEt;
    });
    /* Newest briefing first. */
    out.sort(function (a, b) {
      return bat(b) - bat(a);
    });
    return out;
  }
  /* Real-product video attachment. A cycle carrying replaySrc plays its video file; without one a briefed cycle still lists while its recording is prepared. Only an explicit opt-out marks a briefed cycle as still processing (replayReady === false or replaySrc === null), which renders the "Replay processing, available soon" placeholder. */
  function replayReady(c) {
    return !(c && (c.replayReady === false || c.replaySrc === null));
  }

  /* ---- mutations (save after each) ---- */
  /* One vote per citizen per weekly cycle (TY, Oct 28): a citizen holds at
     most one vote per cycle. Voting a different post in the same cycle
     MOVES the vote immediately (old post -1, new post +1); clicking the
     voted post again removes it. Upvote-only; no downvotes. */
  function userVoteInCycle(s, voterId, cycleId) {
    var prefix = voterId + ":";
    var found = null;
    Object.keys(s.votes || {}).forEach(function (k) {
      if (k.slice(0, prefix.length) !== prefix) return;
      var p = postById(s, k.slice(prefix.length));
      if (p && p.cycleId === cycleId) found = p.id; /* last cast wins */
    });
    return found;
  }
  function castVote(s, voterId, postId, nowEt) {
    var p = postById(s, postId);
    if (!p) return null;
    if (!s.votes) s.votes = {};
    /* Sunday 11:59 PM ET cutoff (TY, Nov 4): a past-votingEnd cycle is closed - the vote is rejected and nothing is recorded. Callers pass the app ET now; a missing clock fails open. Mirrors the demo. */
    if (!cycleVotingOpen(s, p.cycleId, nowEt || null)) return "closed";
    var key = voterId + ":" + postId;
    if (s.votes[key]) {
      delete s.votes[key];
      p.votes = Math.max(0, p.votes - 1);
      save(s);
      return "removed";
    }
    var moved = false;
    var prefix = voterId + ":";
    Object.keys(s.votes).forEach(function (k) {
      if (k.slice(0, prefix.length) !== prefix) return;
      var q = postById(s, k.slice(prefix.length));
      if (q && q.cycleId === p.cycleId) {
        delete s.votes[k];
        q.votes = Math.max(0, q.votes - 1);
        moved = true;
      }
    });
    s.votes[key] = true; /* delete + set refreshes cast order */
    p.votes += 1;
    save(s);
    return moved ? "moved" : "voted";
  }
  /* Migration for pre-change saves: if a citizen holds multiple votes in
     the current cycle, keep only the most recently cast one (vote keys are
     inserted in cast order, so the last key wins; ties are impossible to
     order and any single one is kept) and decrement each removed post by
     1 so displayed totals stay consistent. Runs on every load. */
  function collapseExtraVotes(s, nowEt) {
    if (!s.votes) return false;
    var current = currentCycleId(s, nowEt);
    var byUser = {};
    Object.keys(s.votes).forEach(function (k) {
      var i = k.indexOf(":");
      var q = postById(s, k.slice(i + 1));
      if (q && q.cycleId === current) {
        (byUser[k.slice(0, i)] = byUser[k.slice(0, i)] || []).push(k);
      }
    });
    var changed = false;
    Object.keys(byUser).forEach(function (u) {
      var keys = byUser[u];
      for (var i = 0; i < keys.length - 1; i++) {
        var q = postById(s, keys[i].slice(keys[i].indexOf(":") + 1));
        if (q) q.votes = Math.max(0, q.votes - 1);
        delete s.votes[keys[i]];
        changed = true;
      }
    });
    if (changed) save(s);
    return changed;
  }

  function publishPost(s, userId, cycleId, topic, body, nowEt, lang) {
    if (userPostInCycle(s, userId, cycleId)) return null;
    s.userSeq += 1;
    s.refSeq += 1;
    var now = new Date();
    var post = {
      id: "u-" + now.getTime().toString(36) + "-" + s.userSeq,
      ref: refLetter(s.topics, topic) + "-" + pad4(s.refSeq),
      cycleId: cycleId,
      authorId: userId,
      topic: topic,
      body: body,
      lang: (typeof lang === "string" && lang) ? lang : "und",
      authorState: (citizenById(s, userId).state || ""),
      votes: 0,
      createdAt: etStamp(nowEt || now),
      displayDate: "just now"
    };
    post.hash = hashPost(s, post);
    s.posts.push(post);
    save(s);
    return post;
  }

  /* "We can't do this" determinations and "Why can't we do this?" challenges.
     All records live on the briefing item and persist with the normal state
     save. No post or answer text is ever modified here. Every mutator returns
     {ok:true,...} or {ok:false,reason:...} and leaves the item untouched on
     failure. A determination is identified by determinationId, bumped each
     time a "We can't do this" verdict is newly recorded. */
  function setNoAction(item, f) {
    f = f || {};
    if (!item) return { ok: false, reason: "no-item" };
    if (!String(f.citedAuthority || "").trim()) return { ok: false, reason: "need-authority" };
    if (!String(f.whatWouldChange || "").trim()) return { ok: false, reason: "need-path" };
    if (!String(f.redirectTo || "").trim()) return { ok: false, reason: "need-redirect" };
    if (f.committeeVote !== true) return { ok: false, reason: "need-vote" };
    item.trackerStatus = "No Action";
    item.citedAuthority = String(f.citedAuthority);
    item.whatWouldChange = String(f.whatWouldChange);
    item.redirectTo = String(f.redirectTo);
    item.committeeVote = true;
    item.determinationId = (item.determinationId || 0) + 1;
    return { ok: true, determinationId: item.determinationId };
  }
  function raiseChallenge(item, f) {
    if (!item) return { ok: false, reason: "no-item" };
    if (!f || !f.by) return { ok: false, reason: "need-citizen" };
    if (!String(f.solution || "").trim()) return { ok: false, reason: "need-solution" };
    if (!String(f.dueDate || "").trim()) return { ok: false, reason: "need-duedate" };
    /* Template fields: agency + ask parsed from the briefing item's stored
       agency request ("To:" / "Ask:" lines, same shape the copy control
       renders verbatim); the due date comes from the raise form (required)
       because no structured date exists on the record. */
    var ag = "", ak = "";
    String(item.agencyRequest || "").split("\n").forEach(function (ln) {
      var m1 = /^\s*To\s*:\s*(.+?)\s*$/.exec(ln), m2 = /^\s*Ask\s*:\s*(.+?)\s*$/.exec(ln);
      if (m1 && !ag) ag = m1[1];
      if (m2 && !ak) ak = m2[1];
    });
    if (!ag || !ak) return { ok: false, reason: "need-request" };
    var ch = item.challenges || (item.challenges = []);
    var c = { id: "ch" + (ch.length + 1), raisedBy: f.by, raisedName: f.name || "", date: f.date || "",
      solution: String(f.solution), agency: ag, ask: ak, dueDate: String(f.dueDate).trim(), status: "open", answer: null };
    ch.push(c);
    return { ok: true, challenge: c };
  }
  function answerChallenge(item, challengeId, f) {
    if (!item) return { ok: false, reason: "no-item" };
    var ch = item.challenges || [], c = null, i;
    for (i = 0; i < ch.length; i++) { if (ch[i] && ch[i].id === challengeId) { c = ch[i]; break; } }
    if (!c) return { ok: false, reason: "no-challenge" };
    if (c.status !== "open") return { ok: false, reason: "already-answered" };
    if (!String(f.text || "").trim()) return { ok: false, reason: "need-answer" };
    if (!String(f.citedAuthority || "").trim()) return { ok: false, reason: "need-authority" };
    if (!String(f.whatWouldChange || "").trim()) return { ok: false, reason: "need-path" };
    if (!String(f.redirectTo || "").trim()) return { ok: false, reason: "need-redirect" };
    c.answer = { text: String(f.text), citedAuthority: String(f.citedAuthority),
      whatWouldChange: String(f.whatWouldChange), redirectTo: String(f.redirectTo), date: f.date || "" };
    c.status = "answered";
    return { ok: true, challenge: c };
  }
  function addResponse(item, f) {
    if (!item) return { ok: false, reason: "no-item" };
    if (!f || !f.by) return { ok: false, reason: "need-citizen" };
    if (!String(f.text || "").trim()) return { ok: false, reason: "need-text" };
    if (["record", "challenge", "update"].indexOf(f.kind) < 0) return { ok: false, reason: "need-target" };
    var rs = item.responses || (item.responses = []);
    for (var i = 0; i < rs.length; i++) {
      if (rs[i] && rs[i].by === f.by && rs[i].kind === f.kind && String(rs[i].id) === String(f.id)) {
        return { ok: false, reason: "already-responded" };
      }
    }
    var r = { by: f.by, name: f.name || "", date: f.date || "", text: String(f.text), kind: f.kind, id: String(f.id) };
    rs.push(r);
    return { ok: true, response: r };
  }

  return {
    currentCycleId: currentCycleId,
    cycleVotingOpen: cycleVotingOpen,
    load: load,
    save: save,
    loadCommittee: loadCommittee,
    saveCommittee: saveCommittee,
    fetchCommitteeBeacon: fetchCommitteeBeacon,
    committeeEligible: committeeEligible,
    drawCommitteeMember: drawCommitteeMember,
    recordApproval: recordApproval,
    recordCitations: recordCitations,
    recordAnswer: recordAnswer,
    recordDecline: recordDecline,
    recordSysIssue: recordSysIssue,
    rotateCommittee: rotateCommittee,
    citizenById: citizenById,
    postById: postById,
    postByRef: postByRef,
    cycleById: cycleById,
    briefingItemFor: briefingItemFor,
    itemsForCycle: itemsForCycle,
    postsForCycle: postsForCycle,
    findExactInCycle: findExactInCycle,
    userPostInCycle: userPostInCycle,
    hasVoted: hasVoted,
    userVoteInCycle: userVoteInCycle,
    castVote: castVote,
    cycleDateTime: cycleDateTime,
    cycleYear: cycleYear,
    displayDateFor: displayDateFor,
    replayCycles: replayCycles,
    replayReady: replayReady,
    publishPost: publishPost,
    sha256: sha256Hex,
    hashPost: hashPost,
    auditAppend: auditAppend,
    setNoAction: setNoAction,
    raiseChallenge: raiseChallenge,
    answerChallenge: answerChallenge,
    addResponse: addResponse,
    verifyAudit: verifyAudit
  };
})();
