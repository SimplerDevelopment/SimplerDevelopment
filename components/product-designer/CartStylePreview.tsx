// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useContext } from "react";
import EditorContext from "./EditorContext";
import { MainView } from "./MainView";

export const CartStylePreview = ({
  style,
  index,
  updateQuantity,
  setTotals,
}) => {
  const { setStyle, setControlMode, product, quantity, setQuantity, side } =
    useContext(EditorContext);
  const cSide = style.sides.find((s) => s.side === side.side) || style.sides[0];
  const [quantityState, setQuantityState] = React.useState(quantity);

  const totals = Object.keys(quantity).map((key) => {
    const value = quantity[key]?.value || 0;
    const price = quantity[key]?.price || 0;
    return value * price;
  });
  const sum = totals.reduce((a, b) => a + b, 0);

  const [productTotal, setProductTotal] = React.useState(sum);

  React.useEffect(() => {
    const totals = style?.sizes.map((size) => {
      const q = quantityState?.[size.id]?.value || 0;
      const p = size.unitPrice;
      return q * p;
    });
    const sum = totals.reduce((a, b) => a + b, 0);
    setProductTotal(sum);
  }, [quantityState, style]);

  return (
    <div key={style.id} className="stylePreview">
      <div>
        <div className="styleName">
          <b>{style.name}</b> <small>#{style.id}</small>
        </div>
        <button
          className="cursor-pointer"
          onClick={() => {
            setStyle(product.styles[index]);
            setControlMode("welcome");
          }}
        >
          <MainView key={index} overRideSide={cSide} />
        </button>
      </div>

      <table className="qtyTable w-full border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left">Size</th>
            <th className="px-2 py-1 text-left">Unit Price</th>
          </tr>
        </thead>
        <tbody>
          {style?.sizes
            .sort((a, b) => {
              const priority = [
                "XS",
                "S",
                "SM",
                "M",
                "L",
                "XL",
                "2XL",
                "3XL",
                "4XL",
                "5XL",
                "6XL",
                "7XL",
                "8XL",
                "9XL",
              ];
              return (
                priority.indexOf(a.name.toUpperCase()) -
                priority.indexOf(b.name.toUpperCase())
              );
            })
            .map((size, index) => {
              const total =
                (quantityState?.[size?.id]?.value || 0) * size.unitPrice;
              return (
                <tr key={index}>
                  <td className="px-2 py-1">{size.name || ""}</td>
                  <td className="px-2 py-1 text-green-700 font-semibold">
                    ${size.unitPrice.toFixed(2)}
                  </td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="px-2 py-1 text-lg font-bold">
              Total
            </td>
            <td className="px-2 py-1 text-lg font-bold">
              {style?.sizes.reduce((acc, size) => {
                return acc + (quantityState?.[size.id]?.value || 0);
              }, 0)}
            </td>
            <td className="px-2 py-1 text-lg font-bold text-green-600">
              ${productTotal.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default CartStylePreview;
