'use client';

import React, { useState, useCallback } from 'react';
import { BsPlus, BsDash } from 'react-icons/bs';

interface StyleSizeCellProps {
  styleId: number;
  sizeId: number;
  styleName: string;
  sizeName: string;
  price: number;
  quantity: number;
  available: boolean;
  onQuantityChange: (styleId: number, sizeId: number, quantity: number) => void;
  maxQuantity?: number;
}

export const StyleSizeCell: React.FC<StyleSizeCellProps> = ({
  styleId,
  sizeId,
  styleName,
  sizeName,
  price,
  quantity,
  available,
  onQuantityChange,
  maxQuantity = 99
}) => {
  const [localQuantity, setLocalQuantity] = useState(quantity.toString());
  const [isFocused, setIsFocused] = useState(false);

  const handleQuantityChange = useCallback((newQuantity: number) => {
    const validQuantity = Math.max(0, Math.min(maxQuantity, newQuantity));
    setLocalQuantity(validQuantity.toString());
    onQuantityChange(styleId, sizeId, validQuantity);
  }, [styleId, sizeId, maxQuantity, onQuantityChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuantity(value);
    
    const numValue = parseInt(value) || 0;
    if (numValue !== quantity) {
      handleQuantityChange(numValue);
    }
  }, [quantity, handleQuantityChange]);

  const handleIncrement = useCallback(() => {
    handleQuantityChange(quantity + 1);
  }, [quantity, handleQuantityChange]);

  const handleDecrement = useCallback(() => {
    handleQuantityChange(Math.max(0, quantity - 1));
  }, [quantity, handleQuantityChange]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setLocalQuantity(quantity.toString());
  }, [quantity]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const numValue = parseInt(localQuantity) || 0;
    if (numValue !== quantity) {
      handleQuantityChange(numValue);
    }
  }, [localQuantity, quantity, handleQuantityChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  }, [handleIncrement, handleDecrement]);

  if (!available) {
    return (
      <div className="w-20 h-16 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <span className="text-xs text-gray-400 dark:text-gray-500">N/A</span>
      </div>
    );
  }

  return (
    <div className="w-20 h-16 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg flex flex-col">
      {/* Quantity Controls */}
      <div className="flex-1 flex items-center justify-center relative group">
        <button
          onClick={handleDecrement}
          disabled={quantity <= 0}
          className="absolute hover:scale-110 left-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30 hover:bg-black hover:scale-110 dark:hover:bg-black rounded p-1"
          aria-label={`Decrease ${styleName} ${sizeName} quantity`}
        >
          <BsDash size={12} />
        </button>
        
        <input
          type="number"
          value={isFocused ? localQuantity : quantity}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          min="0"
          max={maxQuantity}
          className="w-full text-center text-sm border-none bg-transparent focus:outline-none focus:ring-1  focus:ring-blue-500 rounded"
          aria-label={`Quantity for ${styleName} ${sizeName}`}
        />
        
        <button
          onClick={handleIncrement}
          disabled={quantity >= maxQuantity}
          className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30 hover:bg-black  dark:hover:bg-black rounded p-1"
          aria-label={`Increase ${styleName} ${sizeName} quantity`}
        >
          <BsPlus size={12} />
        </button>
      </div>
      
      {/* Price Display */}
      {quantity > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-600 px-1 py-1">
          <div className="text-xs text-center text-gray-600 dark:text-gray-300">
            ${(price * quantity).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
};