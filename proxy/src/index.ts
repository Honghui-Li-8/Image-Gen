import "dotenv/config";
import express from "express";

const getPort = (): number => Number(process.env.PROXY_PORT ?? 3001);

export const createApp = () => {
  const app = express();
  return app;
};

const app = createApp();
const port = getPort();

app.listen(port, () => {
  console.log(`image-gen-proxy listening on http://localhost:${port}`);
});
