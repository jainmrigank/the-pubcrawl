/** Reproducible, compact analytical index; no photos or method text in this chunk. */
export const normalizeAtlasIngredient = (value) =>
  value.trim().toLocaleLowerCase('en-US');
export function buildAtlasCatalogue(recipes, dataVersion) {
  const names = new Map();
  const rows = recipes.map((recipe) => {
    const ingredients = [
      ...new Set(
        recipe.ingredients.map(({ name }) => {
          const key = normalizeAtlasIngredient(name);
          if (!names.has(key)) names.set(key, name.trim());
          return key;
        })
      ),
    ].sort();
    return {
      id: recipe.id,
      name: recipe.name,
      ingredients,
      vibe: recipe.vibe,
      glass: recipe.glass.trim().toLocaleLowerCase('en-US'),
      classic: Boolean(recipe.iba),
    };
  });
  const index = [...names]
    .map(([id, name]) => ({
      id,
      name,
      count: rows.filter((r) => r.ingredients.includes(id)).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
  const top = index.slice(0, 12);
  const pairs = top.flatMap((a, i) =>
    top.slice(i + 1).map((b) => {
      const count = rows.filter(
        (r) => r.ingredients.includes(a.id) && r.ingredients.includes(b.id)
      ).length;
      return {
        a: a.id,
        b: b.id,
        count,
        jaccard: count / (a.count + b.count - count),
      };
    })
  );
  const flows = new Map();
  for (const row of rows) {
    const key = `${row.vibe}|${row.glass}`;
    flows.set(key, (flows.get(key) || 0) + 1);
  }
  return {
    dataVersion,
    recipeCount: rows.length,
    ingredientCount: index.length,
    ingredients: index,
    recipes: rows,
    pairs,
    flows: [...flows].map(([key, count]) => {
      const [vibe, glass] = key.split('|');
      return { vibe, glass, count };
    }),
  };
}
export function buildAtlasResearch(research, register) {
  if (research.facts.length !== 170)
    throw new Error('Bar Atlas expects the reviewed 170-note research set');
  const facts = research.facts.map(
    ({ id, category, hook, fact, context, source_ids }) => ({
      id,
      category,
      hook,
      fact,
      context,
      sources: source_ids,
    })
  );
  for (const f of facts)
    for (const id of f.sources)
      if (!register[id]?.url) throw new Error(`Missing Atlas source ${id}`);
  const sources = Object.fromEntries(
    Object.entries(register).map(([id, { title, publisher, url, period }]) => [
      id,
      { title, publisher, url, ...(period ? { period } : {}) },
    ])
  );
  return { researchedOn: research.researched_on, facts, sources };
}
