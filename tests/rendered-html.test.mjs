import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

test("builds the branded document metadata", async () => {
  const html = await readFile(new URL("index.html", dist), "utf8");

  assert.match(html, /<title>Nira Kova — Meet Me in the Deep<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/nirakova\.com\/og\.png"/);
  assert.match(html, /name="theme-color" content="#030203"/);
});

test("ships the music and visual assets", async () => {
  const assets = [
    "track.mp3",
    "nira-portrait.jpg",
    "nira-wide.jpg",
    "og.png",
  ];

  for (const asset of assets) {
    const source = await stat(new URL(`public/${asset}`, root));
    const output = await stat(new URL(asset, dist));
    assert.ok(source.size > 0, `${asset} source is empty`);
    assert.equal(output.size, source.size, `${asset} was not copied intact`);
  }
});

test("includes the track identity in the client bundle", async () => {
  const assetNames = await readdir(new URL("assets/", dist));
  const scripts = assetNames.filter((name) => name.endsWith(".js"));
  const bundles = await Promise.all(
    scripts.map((name) => readFile(new URL(`assets/${name}`, dist), "utf8")),
  );
  const client = bundles.join("\n");

  assert.match(client, /Meet Me in the Deep/);
  assert.match(client, /track\.mp3/);
});
