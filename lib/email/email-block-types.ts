import type { BlockType } from '@/types/blocks';

/** Block types supported in the email editor */
export const EMAIL_BLOCK_TYPES: BlockType[] = [
  'text',
  'heading',
  'image',
  'button',
  'spacer',
  'divider',
  'columns',
  'quote',
  'section',
  'social-links',
  'email-header',
  'email-footer',
];

export function isEmailBlockType(type: string): type is BlockType {
  return EMAIL_BLOCK_TYPES.includes(type as BlockType);
}
