import express from "express";
import { runSelgrosSearch, saveSelgrosSession } from "./selgros";
import { checkApiKey } from "./session";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.send("Selgros bot is running");
});

// 1) Session speichern (manuell, sichtbar)
app.post("/auth/save-session", async (req, res) => {
  try {
    checkApiKey(req);
    const result = await saveSelgrosSession();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "unknown error" });
  }
});

// 2) Suche / Run (nutzt gespeicherte Session)
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
