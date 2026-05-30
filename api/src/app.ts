import cors from "cors";
import express from "express";
import { router } from "./routes/index.js";

export const createApp = () => {
  const app = express();
  const corsOrigin =
    process.env.NODE_ENV === "production"
      ? process.env.ALLOWED_ORIGIN
      : "*";
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());
  app.use(router);
  return app;
};
