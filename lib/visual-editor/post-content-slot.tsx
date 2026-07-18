'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Lets `EditableBlockRenderer` inject the editable post-blocks region into
 * `post-content` placeholders nested inside a type template. Without this,
 * rendering the template via the static `BlockRenderer` would show the static
 * placeholder UI instead of the live, draggable post body.
 *
 * The provider's value is the React element to render in place of every
 * `post-content` block — typically `<DraggableBlockList ... />`. Set to `null`
 * outside the post editor (the static placeholder renders instead).
 */
const PostContentSlotContext = createContext<ReactNode | null>(null);

export function PostContentSlotProvider({
  slot,
  children,
}: {
  slot: ReactNode | null;
  children: ReactNode;
}) {
  return <PostContentSlotContext.Provider value={slot}>{children}</PostContentSlotContext.Provider>;
}

export function usePostContentSlot(): ReactNode | null {
  return useContext(PostContentSlotContext);
}
