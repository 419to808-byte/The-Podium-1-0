/* The Podium — store. localStorage persistence; re-seeds deterministically.
   Collections: citizens, cycles, posts, votes ("voterId:postId"), briefingItems. */
var PodiumStore = (function () {
  "use strict";

  var KEY = "podium1.v1";

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
    return {
      version: s.version,
      citizens: s.citizens,
      topics: s.topics,
      cycles: s.cycles,
      posts: s.posts,
      briefingItems: s.briefingItems,
      votes: {}, /* "voterId:postId" -> true */
      currentUserId: null,
      userSeq: 0,
      refSeq: seq
    };
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

  function save(s) {
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: session-only */ }
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
  function castVote(s, voterId, postId) {
    var p = postById(s, postId);
    if (!p) return null;
    if (!s.votes) s.votes = {};
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
    s.posts.push(post);
    save(s);
    return post;
  }

  return {
    currentCycleId: currentCycleId,
    load: load,
    save: save,
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
    publishPost: publishPost
  };
})();
