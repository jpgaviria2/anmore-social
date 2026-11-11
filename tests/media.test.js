import test from "node:test";
import assert from "node:assert/strict";
import { postVideos, withoutVideos } from "../src/media.js";

test("direct video links become bounded attachments without duplicated body URLs", () => {
  const url = "https://video.example/Story.MP4?token=A%2FB&x=2";
  const e = { content: `A local moment. ${url}\nSource: https://facebook.com/stories/123`, tags: [] };
  const videos = postVideos(e);
  assert.deepEqual(videos, [{ url, label: "Video attached to this community update" }]);
  assert.equal(withoutVideos(e.content, videos), "A local moment. \nSource: https://facebook.com/stories/123");
});

test("signed imeta direct videos support safe author labels", () => {
  const url = "https://media.example/clip.mp4?id=AbC%2F";
  assert.deepEqual(postVideos({content: "A clip", tags: [["imeta", `url ${url}`, "m video/mp4", "alt Village walk"]]}), [{url, label: "Village walk"}]);
});

test("unsafe and non-video URLs cannot become media; exact query strings survive", () => {
  for (const url of ["http://example.com/a.mp4", "https://user:pass@example.com/a.mp4", "https://example.com:444/a.mp4", "https://localhost/a.mp4", "https://foo.local/a.mp4", "https://example.com./a.mp4", "https://127.0.0.1/a.mp4", "https://[::1]/a.mp4", "javascript:alert(1)", "data:video/mp4,test", "https://example.com/a.jpg?file=a.mp4", "https://facebook.com/video/123", "https://example.com/a.mp4/other", "https://example.com\\\\@localhost/a.mp4"])
    assert.deepEqual(postVideos({content: url, tags: [["imeta", `url ${url}`, "m video/mp4"]]}), [], url);
  const url = "https://example.com/a.webm?token=Case%2F&punct=,)";
  const videos = postVideos({content: `${url}\n${url}`, tags: []});
  assert.equal(videos.length, 1);
  assert.equal(videos[0].url, url);
  assert.equal(withoutVideos(`${url}\n${url}`, videos), "");
  assert.equal(postVideos({content: Array.from({length:8}, (_, i)=>`https://example.com/${i}.mov`).join(" "),tags:[]}).length, 4);
});
