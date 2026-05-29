export const generateSeed = (): string => {
  return String(Math.floor(Math.random() * 2 ** 32));
};

export const stepSeed = (seed: string | undefined, amount: number): string => {
  const currentSeed = Number.parseInt(seed || "0", 10);
  const nextSeed = Number.isNaN(currentSeed) ? 0 : currentSeed + amount;
  return String(Math.max(0, nextSeed));
};
