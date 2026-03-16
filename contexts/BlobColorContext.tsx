'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface BlobColorContextType {
  color: string;
  setColor: (color: string) => void;
}

const BlobColorContext = createContext<BlobColorContextType | undefined>(undefined);

export function BlobColorProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState('#8b5cf6');

  return (
    <BlobColorContext.Provider value={{ color, setColor }}>
      {children}
    </BlobColorContext.Provider>
  );
}

export function useBlobColor() {
  const context = useContext(BlobColorContext);
  if (context === undefined) {
    throw new Error('useBlobColor must be used within a BlobColorProvider');
  }
  return context;
}
