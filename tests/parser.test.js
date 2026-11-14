import test from "node:test";
import assert from "node:assert/strict";
import * as media from "../src/media.js";

test("mixed tag discovery classifies before preview and includes a fifth video", () => {
  const urls = [
    "https://cdn.example/a.mp4",
    "https://cdn.example/b.webm",
    "https://cdn.example/c.mov",
    "https://cdn.example/d.m4v",
    "https://cdn.example/e.m3u8",
    "https://cdn.example/photo.avif",
  ];
  const result = parse(
    event(
      `${urls[5]}\n${urls[0]}`,
      urls.map((url) => ["imeta", `url ${url}`]),
    ),
  );
  assert.deepEqual(
    result.attachments.map(({ type, url }) => ({ type, url })),
    urls.map((url, i) => ({ type: i === 5 ? "image" : "video", url })),
  );
  assert.equal(result.text, "");
});

test("imeta MIME classifies extensionless media and rejects conflicts without body fallback", () => {
  const tags = [
    ["imeta", "url https://cdn.example/clip", "m video/mp4", "alt A walk"],
    ["imeta", "url https://cdn.example/photo", "m image/jpeg"],
    ["imeta", "url https://cdn.example/wrong.jpg", "m video/mp4"],
    ["imeta", "url https://cdn.example/wrong.mp4", "m image/png"],
    ["imeta", "url https://cdn.example/doc.jpg", "m application/pdf"],
    ["imeta", "url https://cdn.example/a.jpg", "url https://cdn.example/b.jpg"],
    [
      "imeta",
      "url https://cdn.example/double.jpg",
      "m image/jpeg",
      "m video/mp4",
    ],
  ];
  const result = parse(event("https://cdn.example/wrong.jpg", tags));
  assert.deepEqual(result.attachments, [
    {
      type: "video",
      url: "https://cdn.example/clip",
      label: "A walk",
      mime: "video/mp4",
    },
    {
      type: "image",
      url: "https://cdn.example/photo",
      label: "Photo attached to this community update",
      mime: "image/jpeg",
    },
  ]);
  assert.equal(result.text, "https://cdn.example/wrong.jpg");
});

test("MIME conflicts include same-family mismatches; known external source pages never embed", () => {
  for (const [url, mime] of [
    ["https://cdn.example/a.jpg", "image/png"],
    ["https://cdn.example/a.mp4", "video/webm"],
    ["https://cdn.example/a.svg", "image/svg+xml"],
    ["https://cdn.example/a", "video/not-real"],
    ["https://facebook.com/video/123", "video/mp4"],
    ["https://www.instagram.com/p/123", "image/jpeg"],
  ])
    assert.deepEqual(
      parse(event(url, [["imeta", `url ${url}`, `m ${mime}`]])).attachments,
      [],
      url,
    );
});

test("untyped image and JSON prefixes cannot mask conflicting per-URL MIME evidence in any order", () => {
  const url = "https://cdn.example/blob?sig=Keep%2f";
  const untyped = ["image", url];
  const jpeg = ["imeta", `url ${url}`, "m image/jpeg"];
  const png = ["imeta", `url ${url}`, "m image/png"];
  const permutations = (xs) => xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(rest => [x, ...rest])) : [[]];
  for (const tags of permutations([untyped, jpeg, png])) {
    for (const content of [url, JSON.stringify({ images: [url], body: url })]) {
      const result = parse(event(content, tags));
      assert.deepEqual(result.attachments, [], JSON.stringify({ content, tags }));
      assert.equal(result.text, url, "rejected URL remains a body fallback");
    }
  }
  const compatible = parse(event(url, [untyped, jpeg, jpeg]));
  assert.equal(compatible.attachments.length, 1);
  assert.equal(compatible.attachments[0].mime, "image/jpeg");
});

test("JSON escaped declarations retain explicit field order ahead of tags and text", () => {
  const photo = "https://cdn.example/blob?sig=A%2fb&x=,)";
  const clip = "https://cdn.example/clip.m4v";
  const payload = {
    title: "Village news",
    body: "Read https://facebook.com/story/1\nhttps://cdn.example/text.png",
    videos: [clip],
    images: [photo, "https://cdn.example/text.png", photo],
  };
  const result = parse(
    event(JSON.stringify(payload).replaceAll("/", "\\/"), [
      ["image", "https://cdn.example/tag"],
    ]),
  );
  assert.equal(result.title, "Village news");
  assert.equal(result.text, "Read https://facebook.com/story/1");
  assert.deepEqual(
    result.attachments.map((a) => a.url),
    [clip, photo, "https://cdn.example/text.png", "https://cdn.example/tag"],
  );
  assert.deepEqual(
    result.attachments.map((a) => a.type),
    ["video", "image", "image", "image"],
  );
});

test("JSON text uses body then content then description; declarations accept strings not coercions", () => {
  for (const field of ["body", "content", "description"]) {
    const result = parse(
      event(
        JSON.stringify({
          [field]: "Community story",
          images: "https://cdn.example/photo",
          videos: "https://cdn.example/movie.webm",
        }),
      ),
    );
    assert.equal(result.text, "Community story");
    assert.equal(result.attachments.length, 2);
  }
  const result = parse(
    event(
      JSON.stringify({
        body: {},
        content: "Fallback",
        title: { name: "no" },
        images: [null, {}, 3, ["https://cdn.example/a.jpg"]],
        videos: "https://cdn.example/extensionless",
      }),
    ),
  );
  assert.equal(result.text, "Fallback");
  assert.equal(result.title, "");
  assert.deepEqual(result.attachments, []);
});

test("wrapped and punctuated URLs recognize uppercase HTTPS without changing signed bytes", () => {
  const signed = "HTTPS://CDN.example/Photo.JPG?token=Ab%2fC&punct=,)#Keep%2F";
  const result = parse(
    event(
      `See (https://cdn.example/first.jpg), <https://cdn.example/second.png>.\n[https://cdn.example/third.webp]\n(${signed})\nhttps://cdn.example/end.gif!`,
    ),
  );
  assert.deepEqual(
    result.attachments.map((a) => a.url),
    [
      "https://cdn.example/first.jpg",
      "https://cdn.example/second.png",
      "https://cdn.example/third.webp",
      signed,
      "https://cdn.example/end.gif",
    ],
  );
  assert.equal(
    result.text,
    "See (https://cdn.example/first.jpg), <https://cdn.example/second.png>.",
  );
  const exact = "https://cdn.example/a.mp4?punct=,)!;:#X%2f";
  assert.equal(parse(event(exact)).attachments[0].url, exact);
  assert.deepEqual(
    media.bodyURLs(`(${signed})`).map((a) => a.raw),
    [signed],
  );
});

test("unsafe declared and inferred inputs never become attachments or trigger coercion", () => {
  for (const url of [
    "http://cdn.example/a.jpg",
    "https://user:pass@cdn.example/a.jpg",
    "https://cdn.example:443/a.jpg",
    "https://cdn.example:444/a.jpg",
    "https://localhost/a.jpg",
    "https://a.local/a.jpg",
    "https://cdn.example./a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://2130706433/a.jpg",
    "https://[::1]/a.jpg",
    "https://cdn.example/a\\\\b.jpg",
    "https://cdn.example/a\u0000.jpg",
    "javascript:alert(1)",
    "data:image/png,hello",
  ]) {
    assert.deepEqual(
      parse(
        event(url, [
          ["image", url],
          ["imeta", `url ${url}`, "m image/jpeg"],
        ]),
      ).attachments,
      [],
      url,
    );
    assert.deepEqual(
      parse(event(JSON.stringify({ images: [url] }))).attachments,
      [],
      url,
    );
  }
  const hostile = {
    toString() {
      throw new Error("No object coercion");
    },
  };
  for (const bad of [null, {}, event(hostile), event("", [["image", hostile]])])
    assert.deepEqual(parse(bad), { text: "", title: "", attachments: [] });
});

test("event admission size limits bound discovery rather than attachment count", () => {
  assert.deepEqual(parse(event("x".repeat(100001))), {
    text: "",
    title: "",
    attachments: [],
  });
  assert.equal(parse(event("x".repeat(100000))).text.length, 100000);
  const tags = Array.from({ length: 2000 }, (_, i) => [
    "image",
    `https://cdn.example/${i}.jpg`,
  ]);
  assert.equal(parse(event("", tags)).attachments.length, 2000);
  assert.deepEqual(
    parse(event("", [...tags, ["image", "https://cdn.example/extra.jpg"]])),
    { text: "", title: "", attachments: [] },
  );
});

test("labels and title are bounded strings; metadata never changes the event", () => {
  const input = event(
    JSON.stringify({ title: "T".repeat(500), body: "A story" }),
    [["imeta", "url https://cdn.example/a.mp4", "alt " + "L".repeat(500)]],
  );
  const before = JSON.stringify(input);
  const result = parse(input);
  assert.equal(result.title.length, 200);
  assert.equal(result.attachments[0].label.length, 200);
  assert.equal(JSON.stringify(input), before);
});

test("conflicting extensionless duplicate metadata is rejected regardless of discovery order", () => {
  const url = "https://cdn.example/blob";
  const tags = [
    ["imeta", `url ${url}`, "m image/jpeg"],
    ["imeta", `url ${url}`, "m video/mp4"],
  ];
  for (const order of [tags, [...tags].reverse()])
    assert.deepEqual(parse(event(url, order)).attachments, []);
  assert.deepEqual(
    parse(
      event("https://cdn.example/a.jpg", [
        ["imeta", "url https://cdn.example/a.jpg", "m "],
      ]),
    ).attachments,
    [],
  );
});

test("valid declared video MIME includes extensionless Ogg and MPEG, not just filename formats", () => {
  for (const mime of [
    "video/ogg",
    "video/mpeg",
    "video/mp2t",
    "video/3gpp",
    "video/av1",
    "video/x-matroska",
  ]) {
    const result = parse(
      event("", [["imeta", "url https://cdn.example/blob", `m ${mime}`]]),
    );
    assert.equal(result.attachments[0]?.type, "video", mime);
    assert.equal(result.attachments[0]?.mime, mime);
  }
});

test("unwrapped signed query apostrophes remain byte-exact", () => {
  const url = "https://cdn.example/a.jpg?sig=One'Two%2F&x=,)";
  assert.equal(parse(event(url)).attachments[0]?.url, url);
  assert.equal(media.bodyURLs(url)[0]?.raw, url);
});

test("quoted wrappers and punctuation outside a signed URL do not become URL bytes", () => {
  const url = "https://cdn.example/a.jpg?sig=One'Two%2F&x=,)";
  for (const wrapped of [`(${url}).`, `'${url}'`, `\"${url}\"`, `[${url}],`]) {
    assert.equal(parse(event(wrapped)).attachments[0]?.url, url, wrapped);
    assert.equal(parse(event(wrapped)).text, "");
  }
});

const event = (content = "", tags = []) => ({ content, tags });
const parse = (...args) => {
  assert.equal(typeof media.parsePost, "function", "parsePost is exported");
  return media.parsePost(...args);
};

test("parsePost retains the complete photo collection, not a four-tile preview", () => {
  for (const count of [0, 1, 4, 5, 60]) {
    const urls = Array.from(
      { length: count },
      (_, i) => `https://cdn.example/${i}.jpg`,
    );
    const result = parse(event(["Village update", ...urls].join("\n")));
    assert.equal(result.text, "Village update");
    assert.equal(result.title, "");
    assert.deepEqual(
      result.attachments,
      urls.map((url) => ({
        type: "image",
        url,
        label: "Photo attached to this community update",
      })),
    );
  }
});
