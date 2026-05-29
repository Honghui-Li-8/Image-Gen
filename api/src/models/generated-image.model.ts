// Placeholder — wire up to your ORM (e.g. Drizzle, Prisma) when DB is added.

export interface GeneratedImageRecord {
  id: string;
  prompt: string;
  negativePrompt: string;
  modelId: string;
  width: number;
  height: number;
  imageUrl: string;
  createdAt: Date;
}
