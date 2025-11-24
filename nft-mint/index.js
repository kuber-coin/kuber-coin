const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { nanoid } = require('nanoid');
const path = require('path');

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(bodyParser.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "kuber-nft-mint" })
);

app.post("/mint", (req, res) => {
  const { owner, metadata } = req.body;

  if (!owner || !metadata)
    return res.status(400).json({ error: "owner & metadata required" });

  const id = nanoid(10);
  const token = { id, owner, metadata, time: Date.now() };

  fs.writeFileSync(`${DATA_DIR}/${id}.json`, JSON.stringify(token, null, 2));

  res.json({ success: true, token });
});

app.listen(PORT, () =>
  console.log(`Kuber NFT Mint running on ${PORT}`)
);
