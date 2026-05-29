import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { generationRouter } from "./generation.routes.js";

export const router = Router();
router.use(healthRouter);
router.use(generationRouter);
