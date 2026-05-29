import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { generationOptions } from "image-gen-shared";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    service: "image-gen-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Image Gen API" });
});

app.get("/generation-options", (_req, res) => {
  res.json(generationOptions);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
