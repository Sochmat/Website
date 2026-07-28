import { describe, expect, it } from "vitest";
import { orderedProducts } from "./orderConsumption";

describe("orderedProducts", () => {
  it("lists a plain line by its product id", () => {
    expect(orderedProducts([{ productId: "p1", quantity: 3 }])).toEqual([
      { productId: "p1", name: "", quantity: 3 },
    ]);
  });

  it("sells one add-on per unit of the line it was chosen on", () => {
    expect(
      orderedProducts([
        {
          productId: "p1",
          quantity: 2,
          addOns: [{ id: "papad", name: "Papad", quantity: 1 }],
        },
      ]),
    ).toEqual([
      { productId: "p1", name: "", quantity: 2 },
      { productId: "papad", name: "Papad", quantity: 2 },
    ]);
  });

  it("multiplies the add-on's own quantity by the line quantity", () => {
    const [, papad] = orderedProducts([
      {
        productId: "p1",
        quantity: 3,
        addOns: [{ id: "papad", name: "Papad", quantity: 2 }],
      },
    ]);

    expect(papad.quantity).toBe(6);
  });

  it("sums an add-on with the same item ordered on its own", () => {
    expect(
      orderedProducts([
        {
          productId: "p1",
          quantity: 2,
          addOns: [{ id: "papad", name: "Papad", quantity: 1 }],
        },
        { productId: "papad", quantity: 4 },
      ]),
    ).toEqual([
      { productId: "p1", name: "", quantity: 2 },
      { productId: "papad", name: "Papad", quantity: 6 },
    ]);
  });

  it("sums the same add-on chosen on two different lines", () => {
    const products = orderedProducts([
      { productId: "p1", quantity: 2, addOns: [{ id: "papad", quantity: 1 }] },
      { productId: "p2", quantity: 1, addOns: [{ id: "papad", quantity: 3 }] },
    ]);

    expect(products).toContainEqual({
      productId: "papad",
      name: "",
      quantity: 5,
    });
  });

  it("keeps an id-less add-on under its recorded name", () => {
    expect(
      orderedProducts([
        {
          productId: "p1",
          quantity: 2,
          addOns: [{ name: " Extra  Ghee ", quantity: 1 }],
        },
      ]),
    ).toEqual([
      { productId: "p1", name: "", quantity: 2 },
      { productId: "", name: "Extra  Ghee", quantity: 2 },
    ]);
  });

  it("skips an add-on with nothing to identify it by", () => {
    expect(
      orderedProducts([
        { productId: "p1", quantity: 1, addOns: [{ quantity: 2 }] },
      ]),
    ).toEqual([{ productId: "p1", name: "", quantity: 1 }]);
  });

  it("skips junk quantities on either side", () => {
    expect(
      orderedProducts([
        { productId: "p1", quantity: 0, addOns: [{ id: "papad", quantity: 1 }] },
        { productId: "p2", quantity: 2, addOns: [{ id: "papad", quantity: 0 }] },
        { productId: "p3", quantity: Number.NaN },
        { quantity: 4 },
      ]),
    ).toEqual([{ productId: "p2", name: "", quantity: 2 }]);
  });

  it("has nothing to sell on an empty order", () => {
    expect(orderedProducts([])).toEqual([]);
  });
});
