import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { authRouter } from "./auth.routes.js";
import { generationRouter } from "./generation.routes.js";
import { generationsRouter } from "./generations.routes.js";
import { healthRouter } from "./health.routes.js";
import { worksRouter } from "./works.routes.js";

export const router = Router();

// public
router.use(healthRouter);
router.use(authRouter);
router.use(generationsRouter);

// protected — all routes registered after this require a valid Bearer token
router.use(authMiddleware);
router.use(generationRouter);
router.use(worksRouter);
