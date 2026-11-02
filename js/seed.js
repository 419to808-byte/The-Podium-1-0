/* The Podium — empty starter seed (runs with zero network or install).
   Draw math is exact: position = beaconNum mod poolSize + 1 over the frozen
   pool (publication order, top-voted winner excluded). One post per citizen
   per cycle holds for every published post. */
var PODIUM_SEED = {
  version: 10,
  citizens: [
  ],
  topics: ["Infrastructure", "Healthcare", "Public Health", "Education", "Environment", "Economy", "Public Safety", "Transportation", "Housing", "Technology", "Civic Process"],
  cycles: [
    {
      id: "w1", label: "Week of Oct 5", range: "Mon Oct 5 \u2013 Sun Oct 11",
      votingStart: "2026-10-05", votingEnd: "2026-10-11",
      cutoffAt: "Sun Oct 11, 11:59 PM ET", drawAt: "Mon Oct 12, 12:00 PM ET",
      briefingAt: "Wed Oct 21, 1:00 PM ET", status: "briefed",
    },
    {
      id: "w2", label: "Week of Oct 12", range: "Mon Oct 12 \u2013 Sun Oct 18",
      votingStart: "2026-10-12", votingEnd: "2026-10-18",
      cutoffAt: "Sun Oct 18, 11:59 PM ET", drawAt: "Mon Oct 19, 12:00 PM ET",
      briefingAt: "Wed Oct 28, 1:00 PM ET", status: "tonight",
    },
    {
      id: "w3", label: "Week of Oct 19", range: "Mon Oct 19 \u2013 Sun Oct 25",
      votingStart: "2026-10-19", votingEnd: "2026-10-25",
      cutoffAt: "Sun Oct 25, 11:59 PM ET", drawAt: "Mon Oct 26, 12:00 PM ET",
      briefingAt: "Wed Nov 4, 1:00 PM ET", status: "committee",
    },
    {
      id: "w4", label: "Week of Oct 26", range: "Mon Oct 26 \u2013 Sun Nov 1",
      votingStart: "2026-10-26", votingEnd: "2026-11-01",
      cutoffAt: "Sun Nov 1, 11:59 PM ET", drawAt: "Mon Nov 2, 12:00 PM ET (pre-announced)",
      briefingAt: "Wed Nov 11, 1:00 PM ET", status: "voting",
    },
    {
      id: "w5", label: "Week of Nov 2", range: "Mon Nov 2 \u2013 Sun Nov 8",
      votingStart: "2026-11-02", votingEnd: "2026-11-08",
      cutoffAt: "Sun Nov 8, 11:59 PM ET", drawAt: "Mon Nov 9, 12:00 PM ET (pre-announced)",
      briefingAt: "Wed Nov 18, 1:00 PM ET", status: "scheduled",
    }
  ],
  posts: [
  ],
  briefingItems: [
  ]
};
