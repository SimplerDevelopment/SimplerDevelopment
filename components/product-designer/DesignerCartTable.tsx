// @ts-nocheck
// TODO(designer): clean up types — ported from CRA, see .planning/product-designer-integration.md
'use client';

import React, { useMemo, useCallback, useState, useContext } from 'react';
import { StyleSizeCell } from './StyleSizeCell';
import { CartSummary } from './CartSummary';

export interface CartSelection {
  styleId: number;
  sizeId: number;
  quantity: number;
  price: number;
  styleName: string;
  sizeName: string;
}

interface DesignerCartTableProps {
  product: any; // Product with styles and sizes
  onAddToCart: (selections: CartSelection[]) => Promise<void>;
  onClose: () => void;
  persistedSelections?: Map<string, any>;
  onSelectionsChange?: (selections: Map<string, any>) => void;
  CartContext?: React.Context<any>; // Admin or Store cart context
}

export const DesignerCartTable: React.FC<DesignerCartTableProps> = ({
  product,
  onAddToCart,
  onClose,
  persistedSelections = new Map(),
  onSelectionsChange,
  CartContext
}) => {
  const [selections, setSelections] = useState<Map<string, CartSelection>>(persistedSelections);
  const [isLoading, setIsLoading] = useState(false);
  
  // Get admin context if available
  const cartContext = CartContext ? useContext(CartContext) : null;
  const isAdminMode = cartContext?.isAdminMode || false;

  // Get all unique size names across all styles
  const allSizeNames = useMemo(() => {
    if (!product?.styles) return [];
    
    const sizeNameSet = new Set<string>();
    const sizePriority = ['XS', 'S', 'SM', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    
    product.styles.forEach((style: any) => {
      style.sizes?.forEach((size: any) => {
        sizeNameSet.add(size.name.toUpperCase());
      });
    });

    return Array.from(sizeNameSet).sort((a, b) => {
      const priorityA = sizePriority.indexOf(a);
      const priorityB = sizePriority.indexOf(b);
      
      if (priorityA === -1 && priorityB === -1) return a.localeCompare(b);
      if (priorityA === -1) return 1;
      if (priorityB === -1) return -1;
      return priorityA - priorityB;
    });
  }, [product]);

  // Get styles that are available
  const availableStyles = useMemo(() => {
    return product?.styles?.filter((style: any) => 
      style.sides && style.sides.length > 0 && style.sizes && style.sizes.length > 0
    ) || [];
  }, [product]);

  const handleQuantityChange = useCallback((styleId: number, sizeName: string, quantity: number, price: number) => {
    const key = `${styleId}-${sizeName}`;
    const style = availableStyles.find((s: any) => s.id === styleId);
    
    if (!style) return;

    setSelections(prev => {
      const newSelections = new Map(prev);
      
      if (quantity > 0) {
        // Find the actual size ID from the style for proper database reference
        const actualSize = style.sizes?.find((size: any) => 
          size.name.toUpperCase() === sizeName && size.active !== false
        );
        
        newSelections.set(key, {
          styleId,
          sizeId: actualSize?.id || 0,
          quantity,
          price, // Use the individual price passed from the cell
          styleName: style.name,
          sizeName
        });
      } else {
        newSelections.delete(key);
      }
      
      // Persist selections to parent component
      onSelectionsChange?.(newSelections);
      return newSelections;
    });
  }, [availableStyles, onSelectionsChange]);

  const handleAddToCart = useCallback(async () => {
    const selectionsArray = Array.from(selections.values());
    if (selectionsArray.length === 0) return;

    setIsLoading(true);
    try {
      await onAddToCart(selectionsArray);
      // Animate success feedback before clearing
      setTimeout(() => {
        setSelections(new Map()); // Clear selections after successful add
        setIsLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to add items to cart:', error);
      setIsLoading(false);
      // Could add error state here
    }
  }, [selections, onAddToCart]);

  const handleClearSelections = useCallback(() => {
    const emptyMap = new Map();
    setSelections(emptyMap);
    onSelectionsChange?.(emptyMap);
  }, [onSelectionsChange]);

  // Check if a style/size combination is available and get the size info
  const getStyleSizeInfo = useCallback((styleId: number, sizeName: string) => {
    const style = availableStyles.find((s: any) => s.id === styleId);
    if (!style) return null;
    
    const size = style.sizes?.find((size: any) => 
      size.name.toUpperCase() === sizeName && size.active !== false
    );
    
    return size ? { available: true, price: size.price || 25.00 } : null;
  }, [availableStyles]);

  const getQuantity = useCallback((styleId: number, sizeName: string) => {
    const key = `${styleId}-${sizeName}`;
    return selections.get(key)?.quantity || 0;
  }, [selections]);

  const selectionsArray = Array.from(selections.values());
  const totalQuantity = selectionsArray.reduce((sum, sel) => sum + sel.quantity, 0);

  return (
    <div className="w-full h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {isAdminMode ? 'Add To Store' : 'Add to Cart'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select quantities for {product?.name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl font-bold p-2"
        >
          ×
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 flex min-h-0">
        {/* Main Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="min-w-full"
            style={{
              height: "80vh",
              overflow: "scroll",
              paddingBottom: "300px"
            }}
          >
            {/* Size Headers */}
            <div
              className="flex gap-2 mb-4 bg-white dark:bg-gray-800"
              style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              borderBottom: "1px solid #e5e7eb", // Tailwind border-gray-200
              }}
            >
              {/* Empty space to align with style info column */}
              <div className="w-32"></div>
              {allSizeNames.map((sizeName) => (
              <div key={sizeName} className="w-20 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {sizeName}
                </div>
              </div>
              ))}
              <div className="w-24 text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Total
              </div>
              </div>
            </div>

            {/* Style Rows */}
            <div className="space-y-3">
              {availableStyles.map((style: any) => {
                const rowTotal = allSizeNames.reduce((sum, sizeName) => {
                  return sum + getQuantity(style.id, sizeName);
                }, 0);

                return (
                  <div key={style.id} className="flex gap-2 items-center">
                    {/* Style Info */}
                    <div className="w-32 flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: `#${style.htmlColor1}` }}
                        title={style.name}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {style.name}
                        </div>
                      </div>
                    </div>

                    {/* Size Cells */}
                    {allSizeNames.map((sizeName) => {
                      const sizeInfo = getStyleSizeInfo(style.id, sizeName);
                      
                      return (
                        <StyleSizeCell
                          key={`${style.id}-${sizeName}`}
                          styleId={style.id}
                          sizeId={0} // Not used anymore
                          styleName={style.name}
                          sizeName={sizeName}
                          price={sizeInfo?.price || 25.00}
                          quantity={getQuantity(style.id, sizeName)}
                          available={sizeInfo?.available || false}
                          onQuantityChange={(styleId, sizeId, quantity) => 
                            handleQuantityChange(styleId, sizeName, quantity, sizeInfo?.price || 25.00)
                          }
                        />
                      );
                    })}

                    {/* Row Total */}
                    <div className="w-24 text-center">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {rowTotal}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column Totals */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
              {/* Empty space to align with style info column */}
              <div className="w-32"></div>
              {allSizeNames.map((sizeName) => {
                const columnTotal = availableStyles.reduce((sum, style) => {
                  return sum + getQuantity(style.id, sizeName);
                }, 0);

                return (
                  <div key={sizeName} className="w-20 text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {columnTotal}
                    </div>
                  </div>
                );
              })}
              <div className="w-24 text-center">
                <div className="text-6xl font-bold text-blue-600 dark:text-blue-400">
                  {totalQuantity}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cart Summary Sidebar */}
        <div className="w-80 border-l border-gray-200 dark:border-gray-600 p-4 flex-shrink-0">
          <CartSummary
            selections={selectionsArray}
            onAddToCart={handleAddToCart}
            onClearSelections={handleClearSelections}
            isLoading={isLoading}
            isAdminMode={isAdminMode}
          />
        </div>
      </div>
    </div>
  );
};