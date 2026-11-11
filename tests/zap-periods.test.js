import test from "node:test";
import assert from "node:assert/strict";
import { verifiedTotals, zapPeriodWindow } from "../src/zaps.js";
import { sign, keys, invoice } from "./zap-fixtures.js";
const ts = (s) => Date.parse(s) / 1000;
const post = sign({ created_at: ts("2026-01-01T00:00:00Z") });
const authority = {
  issuer: sign({}, keys.issuer).pubkey,
  recipient: sign({}, keys.recipient).pubkey,
};
function receipt(
  time,
  sats = 21,
  paymentHash = "12".repeat(32),
  target = post,
) {
  const request = sign(
    {
      kind: 9734,
      created_at: time - 10,
      tags: [
        ["e", target.id],
        ["p", authority.recipient],
        ["amount", String(sats * 1000)],
      ],
    },
    keys.sender,
  );
  const description = JSON.stringify(request);
  return sign(
    {
      kind: 9735,
      created_at: time,
      tags: [
        ["e", target.id],
        ["p", authority.recipient],
        ["description", description],
        [
          "bolt11",
          invoice(description, {
            time: time - 5,
            msats: BigInt(sats) * 1000n,
            paymentHash,
          }),
        ],
      ],
    },
    keys.issuer,
  );
}
test("This week counts receipt time from Vancouver Monday midnight, not post age", () => {
  const now = ts("2026-11-11T20:00:00Z");
  const before = receipt(ts("2026-11-09T06:59:59Z"), 50, "13".repeat(32));
  const start = receipt(ts("2026-11-09T07:00:00Z"));
  assert.equal(
    verifiedTotals([before, start], [post], authority, now, "week").get(
      post.id,
    ),
    21000n,
  );
  assert.equal(
    verifiedTotals([before, start], [post], authority, now).get(post.id),
    71000n,
  );
});
test("calendar windows include exact start, exclude exact end and keep historical DST transitions", () => {
  for (const [period, now, start, end] of [
    [
      "week",
      "2025-03-09T20:00:00Z",
      "2025-03-03T08:00:00Z",
      "2025-03-10T07:00:00Z",
    ],
    [
      "week",
      "2025-11-02T20:00:00Z",
      "2025-10-27T07:00:00Z",
      "2025-11-03T08:00:00Z",
    ],
    [
      "month",
      "2026-03-11T20:00:00Z",
      "2026-03-01T08:00:00Z",
      "2026-04-01T07:00:00Z",
    ],
    [
      "month",
      "2026-11-11T20:00:00Z",
      "2026-11-01T07:00:00Z",
      "2026-12-01T07:00:00Z",
    ],
    [
      "week",
      "2027-01-01T03:00:00Z",
      "2026-12-28T07:00:00Z",
      "2027-01-04T07:00:00Z",
    ],
    [
      "month",
      "2028-02-29T20:00:00Z",
      "2028-02-01T07:00:00Z",
      "2028-03-01T07:00:00Z",
    ],
  ])
    assert.deepEqual(zapPeriodWindow(period, ts(now)), {
      start: ts(start),
      end: ts(end),
    });
  const end = ts("2026-12-01T07:00:00Z");
  assert.deepEqual(zapPeriodWindow("month", end), {
    start: end,
    end: ts("2027-01-01T07:00:00Z"),
  });
  assert.equal(zapPeriodWindow("all", end), null);
  assert.throws(() => zapPeriodWindow("rolling30", end));
});
test("month receipts use inclusive civil start, exclude future/end, and preserve default all-time", () => {
  const now = ts("2026-11-11T20:00:00Z");
  const start = zapPeriodWindow("month", now).start;
  const receipts = [
    receipt(start - 1, 50, "20".repeat(32)),
    receipt(start, 21, "21".repeat(32)),
    receipt(now, 7, "22".repeat(32)),
    receipt(now + 1, 99, "23".repeat(32)),
    receipt(zapPeriodWindow("month", now).end, 999, "24".repeat(32)),
  ];
  assert.equal(
    verifiedTotals(receipts, [post], authority, now, "month").get(post.id),
    28000n,
  );
  assert.deepEqual(
    verifiedTotals(receipts, [post], authority, now, "all"),
    verifiedTotals(receipts, [post], authority, now),
  );
  assert.equal(
    verifiedTotals(receipts, [post], authority, now).get(post.id),
    78000n,
  );
  const nextMonth = zapPeriodWindow("month", now).end;
  assert.equal(
    verifiedTotals(
      [receipt(nextMonth - 1, 21)],
      [post],
      authority,
      nextMonth,
      "month",
    ).size,
    0,
  );
});
test("payment deduplication and cross-window conflicts happen before period filtering, independent of order", () => {
  const now = ts("2026-11-11T20:00:00Z"),
    boundary = zapPeriodWindow("week", now).start;
  const outside = receipt(boundary - 1);
  const samePayment = sign(
    { ...outside, created_at: boundary + 1 },
    keys.issuer,
  );
  const conflict = receipt(boundary + 1, 21);
  for (const events of [
    [outside, samePayment],
    [samePayment, outside],
  ]) {
    assert.equal(
      verifiedTotals(events, [post], authority, now, "week").size,
      0,
    );
    assert.equal(
      verifiedTotals(events, [post], authority, now).get(post.id),
      21000n,
    );
  }
  for (const events of [
    [outside, conflict],
    [conflict, outside],
  ]) {
    assert.equal(
      verifiedTotals(events, [post], authority, now, "week").size,
      0,
    );
    assert.equal(verifiedTotals(events, [post], authority, now).size, 0);
  }
  const other = sign({ created_at: post.created_at, content: "other" });
  const reused = receipt(boundary + 1, 21, "12".repeat(32), other);
  assert.equal(
    verifiedTotals([outside, reused], [post, other], authority, now, "week")
      .size,
    0,
  );
  const inside = receipt(boundary + 1, 21, "34".repeat(32));
  assert.equal(
    verifiedTotals([inside, inside], [post], authority, now, "week").get(
      post.id,
    ),
    21000n,
  );
  assert.equal(
    verifiedTotals([inside], [], authority, now, "week").size,
    0,
    "Deleted/missing target cannot be revived",
  );
});
test("empty weeks/months remain empty; unverified receipt claims never become window totals", () => {
  const now = ts("2026-11-11T20:00:00Z");
  const old = receipt(ts("2026-10-01T07:00:00Z"));
  for (const period of ["week", "month"]) {
    assert.equal(verifiedTotals([old], [post], authority, now, period).size, 0);
    const forged = { ...receipt(now), sig: "0".repeat(128) };
    assert.equal(
      verifiedTotals([forged], [post], authority, now, period).size,
      0,
    );
  }
});
