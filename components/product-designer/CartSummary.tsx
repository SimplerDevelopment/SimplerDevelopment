'use client';

import React from 'react';
import { BsCart3, BsTrash } from 'react-icons/bs';

interface CartSelection {
  styleId: number;
  sizeId: number;
  quantity: number;
  price: number;
  styleName: string;
  sizeName: string;
}

interface CartSummaryProps {
  selections: CartSelection[];
  onAddToCart: () => void;
  onClearSelections: () => void;
  isLoading?: boolean;
  isAdminMode?: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  selections,
  onAddToCart,
  onClearSelections,
  isLoading = false,
  isAdminMode = false
}) => {
  const totalQuantity = selections.reduce((sum, selection) => sum + selection.quantity, 0);
  const totalPrice = selections.reduce((sum, selection) => sum + (selection.price * selection.quantity), 0);
  
  const hasSelections = totalQuantity > 0;

  if (!hasSelections) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <BsCart3 size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select quantities to add items {isAdminMode ? 'to stores' : 'to your cart'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-4">
      {/* Summary Stats */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <span className="font-medium">{totalQuantity}</span> item{totalQuantity !== 1 ? 's' : ''} selected
        </div>
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
          ${totalPrice.toFixed(2)}
        </div>
      </div>

      {/* Selection Breakdown */}
      <div className="max-h-32 overflow-y-auto space-y-1">
        {selections.map((selection) => (
          <div 
            key={`${selection.styleId}-${selection.sizeName}`}
            className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-300"
          >
            <span>
              {selection.styleName} - {selection.sizeName} × {selection.quantity}
            </span>
            <span>${(selection.price * selection.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-600">
        <button
          onClick={onClearSelections}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <BsTrash size={14} />
          Clear
        </button>
        
        <button
          onClick={onAddToCart}
          disabled={isLoading}
          className="flex-2 flex items-center justify-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <BsCart3 size={14} />
          {isLoading 
            ? (isAdminMode ? 'Adding to stores...' : 'Adding...') 
            : (isAdminMode ? 'Add To Store' : 'Add to Cart')
          }
        </button>
      </div>
    </div>
  );
};