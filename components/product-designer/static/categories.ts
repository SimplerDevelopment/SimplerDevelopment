// @ts-nocheck
// Loaded via require() so the ~393k-line categories.json literal stays OUT of
// the TypeScript program graph. With resolveJsonModule, importing the .json
// directly makes tsc infer a giant literal type for it, costing ~7s (≈25%) of
// every cold typecheck and bloating tsconfig.tsbuildinfo. Bundlers (webpack and
// Turbopack) still inline this require synchronously at build time, so runtime
// behavior is unchanged. The sole consumer (ArtCategories.tsx) is @ts-nocheck,
// so no type safety is lost.
const data = require("./categories.json") as {
  tags: { tag: string; count: number }[];
};
export default data;
