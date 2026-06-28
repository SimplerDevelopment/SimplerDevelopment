// NOTE: This JSON file is large. TypeScript may infer a verbose literal type
// from it; the `as unknown as CategoriesData` cast keeps the typed surface
// narrow without @ts-nocheck or require().
import rawData from "./categories.json";

type CategoriesData = {
  tags: { tag: string; count: number }[];
};

const data = rawData as unknown as CategoriesData;
export default data;
