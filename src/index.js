import fetch from "node-fetch";
import { readFile, writeFile } from "fs/promises";
import { createWriteStream } from "fs";
import createTorrentCB from "create-torrent";
import { promisify } from "util";
import qBittorrent from "./qBittorrent.js";
import { WebhookClient } from "discord.js";

const createTorrent = promisify(createTorrentCB);

const config = JSON.parse(await readFile("./config.json", "utf-8"));

const webhook = new WebhookClient({
  url: config.webhook,
});

const qbit = new qBittorrent({
  host: config.qbit.host,
  user: config.qbit.user,
  password: config.qbit.password,
});

let oldData = JSON.parse(await readFile("./old.json", "utf-8").catch(() => "[]"));

async function getData() {
  const { koe: data } = await fetch("https://abitikku-versions.testausserveri.fi/versions.json").then(r => r.json()).catch(() => null) ?? {};
  if (!data) return [];
  const newData = data.filter(v1 => !v1.beta && oldData.every(v2 => v2.versionCode !== v1.versionCode));
  await writeFile("./old.json", JSON.stringify(data), "utf-8");
  if (oldData.length !== 0) {
    oldData = data;
    return newData;
  }
  oldData = data;
}

async function download(url, dest) {
  const file = await fetch(url);
  const write = createWriteStream(dest);
  await new Promise((res, rej) => {
    file.body.pipe(write);
    file.body.on("error", rej);
    write.on("finish", res);
  });
}

async function checkReleases() {
  const data = await getData().catch(() => null);
  if (data == null || data.length === 0) return;
  console.log(`Found ${data.length} new Abitti releases`);
  Promise.all(data.map(async (release) => {
    try {
      const path = `${config.dest}${release.versionName}.zip`;
      await download(release.url, path);
      const torrent = await createTorrent(path, {
        name: `${release.versionName}.zip`,
        announceList: [config.trackers],
      });
      await qbit.addTorrent(torrent, config.qbit.category);
      console.log(`Seeding ${release.versionName}`);
      await webhook.send({
        username: "Abitti Torrents",
        content: `Sharing ${release.versionName}`,
        files: [{
          attachment: torrent,
          name: `${release.versionName}.torrent`
        }],
      });
    } catch(e) {
      console.error(e);
      webhook.send({
        username: "Abitti Torrents",
        content: `Failed to share ${release.versionName}`,
      }).catch(() => null);
    }
  }));
}

checkReleases();
setInterval(checkReleases, 10 * 60 * 1000);
