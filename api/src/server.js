import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
