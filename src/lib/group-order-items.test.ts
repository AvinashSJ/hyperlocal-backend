import { describe, it, expect } from "vitest";
import { groupOrderItems, resolveItemCategory } from "./group-order-items";
import type { RawCategoryJoin } from "./group-order-items";

type TestItem = {
  id: string;
  products?: { categories?: RawCategoryJoin } | null;
};

function cat(raw: RawCategoryJoin): TestItem["products"] {
  return { categories: raw };
}

function root(id: string, name: string): TestItem {
  return {
    id,
    products: cat({ id, name, parent_id: null, parent_cat: null }),
  };
}

function sub(subId: string, subName: string, parentId: string, parentName: string): TestItem {
  return {
    id: subId,
    products: cat({
      id: subId,
      name: subName,
      parent_id: parentId,
      parent_cat: { name: parentName },
    }),
  };
}

function noProduct(id: string): TestItem {
  return { id, products: null };
}

describe("resolveItemCategory", () => {
  it("returns null for missing product", () => {
    const item: TestItem = { id: "1" };
    expect(resolveItemCategory(item)).toBeNull();
  });

  it("returns null for null categories", () => {
    const item: TestItem = { id: "1", products: { categories: null } };
    expect(resolveItemCategory(item)).toBeNull();
  });

  it("resolves root category (no parent)", () => {
    const result = resolveItemCategory(root("r1", "Snacks"));
    expect(result).toEqual({
      rootId: "r1",
      rootName: "Snacks",
      subId: null,
      subName: "",
    });
  });

  it("resolves subcategory (has parent)", () => {
    const result = resolveItemCategory(sub("c1", "Chips", "r1", "Snacks"));
    expect(result).toEqual({
      rootId: "r1",
      rootName: "Snacks",
      subId: "c1",
      subName: "Chips",
    });
  });
});

describe("groupOrderItems", () => {
  it("returns an empty array for no items", () => {
    expect(groupOrderItems([], resolveItemCategory)).toEqual([]);
  });

  it("groups root-category items under a root group", () => {
    const a = root("a", "Snacks");
    const b = root("a", "Snacks");
    const groups = groupOrderItems([a, b], resolveItemCategory);

    expect(groups).toHaveLength(1);
    expect(groups[0].rootName).toBe("Snacks");
    expect(groups[0].subcategories).toHaveLength(1);
    expect(groups[0].subcategories[0].name).toBe("");
    expect(groups[0].subcategories[0].items).toEqual([a, b]);
  });

  it("groups subcategory items under the parsed root with a sub-header", () => {
    const chips = sub("c1", "Chips", "r1", "Snacks");
    const drinks = sub("c2", "Drinks", "r1", "Snacks");
    const groups = groupOrderItems([chips, drinks], resolveItemCategory);

    expect(groups).toHaveLength(1);
    expect(groups[0].rootName).toBe("Snacks");
    expect(groups[0].subcategories.map((s) => s.name)).toEqual(["Chips", "Drinks"]);
    expect(groups[0].subcategories[0].items).toEqual([chips]);
    expect(groups[0].subcategories[1].items).toEqual([drinks]);
  });

  it("keeps items in their original order within a subgroup", () => {
    const a = sub("a", "Chips", "r1", "Snacks");
    const b = sub("a", "Chips", "r1", "Snacks");
    const groups = groupOrderItems([b, a], resolveItemCategory);
    expect(groups[0].subcategories[0].items).toEqual([b, a]);
  });

  it("sorts root groups alphabetically by name", () => {
    const snacks = root("s", "Snacks");
    const bakery = root("b", "Bakery");
    const groups = groupOrderItems([snacks, bakery], resolveItemCategory);
    expect(groups.map((g) => g.rootName)).toEqual(["Bakery", "Snacks"]);
  });

  it("sends items without a resolvable category to an Uncategorized trailing group", () => {
    const deleted = noProduct("d");
    const snacks = root("s", "Snacks");
    const groups = groupOrderItems([snacks, deleted], resolveItemCategory);

    expect(groups).toHaveLength(2);
    expect(groups[0].rootName).toBe("Snacks");
    expect(groups[1].rootName).toBe("Uncategorized");
    expect(groups[1].subcategories[0].items).toEqual([deleted]);
  });

  it("merges items from the same root group across root + child categories", () => {
    const rootSnack = root("r1", "Snacks");
    const childChips = sub("c1", "Chips", "r1", "Snacks");
    const groups = groupOrderItems([rootSnack, childChips], resolveItemCategory);

    expect(groups).toHaveLength(1);
    expect(groups[0].rootName).toBe("Snacks");
    expect(groups[0].rootId).toBe("r1");
    // root item -> "" sub-group; child -> "Chips" sub-group
    expect(groups[0].subcategories.map((s) => s.name)).toEqual(["", "Chips"]);
    expect(groups[0].subcategories[0].items).toEqual([rootSnack]);
    expect(groups[0].subcategories[1].items).toEqual([childChips]);
  });

  it("groups items from different root categories separately", () => {
    const snacks = root("r1", "Snacks");
    const bakery = root("r2", "Bakery");
    const chips = sub("c1", "Chips", "r1", "Snacks");
    const groups = groupOrderItems([snacks, bakery, chips], resolveItemCategory);

    expect(groups).toHaveLength(2);
    expect(groups[0].rootName).toBe("Bakery");
    expect(groups[1].rootName).toBe("Snacks");
    expect(groups[1].subcategories.map((s) => s.name)).toEqual(["", "Chips"]);
  });

  it("puts mixed deleted + uncategorized products last", () => {
    const snacks = root("r1", "Snacks");
    const nullProd = noProduct("n1");
    const groups = groupOrderItems([snacks, nullProd], resolveItemCategory);

    expect(groups).toHaveLength(2);
    expect(groups[0].rootName).toBe("Snacks");
    expect(groups[1].rootName).toBe("Uncategorized");
    expect(groups[1].rootId).toBeNull();
    expect(groups[1].subcategories[0].id).toBeNull();
  });

  it("preserves T type in output (items reference identity)", () => {
    const itemA = sub("a", "Chips", "r1", "Snacks");
    const itemB = root("b", "Bakery");
    const groups = groupOrderItems([itemA, itemB], resolveItemCategory);
    const flatItems = groups.flatMap((g) => g.subcategories.flatMap((s) => s.items));
    expect(flatItems).toContain(itemA);
    expect(flatItems).toContain(itemB);
    expect(flatItems).toHaveLength(2);
  });
});