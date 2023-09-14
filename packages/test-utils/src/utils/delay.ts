// Simple async delay function
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
