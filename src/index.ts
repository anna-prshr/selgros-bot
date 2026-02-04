import express from "express";
import { runSelgrosSearch } from "./selgros.js";
import { checkApiKey } from "./session.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/run", async (req, res) => {
  try {
    checkApiKey(req);

    const { keywords } = req.body;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "keywords missing" });
    }

    const results = await runSelgrosSearch(keywords);
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "unknown error" });
  }
});

app.get("/", (_req, res) => {
  res.send("Selgros bot is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
