import type { ServerStatus } from "../types";

export const getHealthLabel = (status: ServerStatus): string => {
  if (status === "working") return "Working";
  if (status === "healthy") return "Healthy / live";
  if (status === "checking") return "Checking";
  return "Down / unavailable";
};
