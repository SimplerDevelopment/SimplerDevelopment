'use client';

import { Block, BlockType } from '@/types/blocks';
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { EditorInner } from '@/components/blocks/VisualBlockEditorEnhanced';
import { EMAIL_BLOCK_TYPES } from '@/lib/email/email-block-types';

interface EmailBlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

const EMAIL_BLOCK_TYPE_LIST: Array<{
  type: BlockType;
  label: string;
  icon: string;
  category: string;
  description: string;
}> = [
  // Basic
  { type: 'heading', label: 'Heading', icon: 'title', category: 'Content', description: 'Add a title or heading' },
  { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Content', description: 'Add text content' },
  { type: 'image', label: 'Image', icon: 'image', category: 'Content', description: 'Insert an image' },
  { type: 'button', label: 'Button', icon: 'smart_button', category: 'Content', description: 'Add a call-to-action button' },
  { type: 'quote', label: 'Quote', icon: 'format_quote', category: 'Content', description: 'Add a quotation' },

  // Layout
  { type: 'spacer', label: 'Spacer', icon: 'height', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: 'horizontal_rule', category: 'Layout', description: 'Add a horizontal line' },
  { type: 'columns', label: 'Columns', icon: 'view_column', category: 'Layout', description: '2-column layout' },
  { type: 'section', label: 'Section', icon: 'crop_free', category: 'Layout', description: 'Background section wrapper' },

  // Email-specific
  { type: 'email-header', label: 'Email Header', icon: 'mark_email_read', category: 'Email', description: 'Logo and tagline' },
  { type: 'email-footer', label: 'Email Footer', icon: 'mark_email_unread', category: 'Email', description: 'Company info and unsubscribe' },
  { type: 'social-links', label: 'Social Links', icon: 'share', category: 'Email', description: 'Social media link buttons' },
];

export function EmailBlockEditor({ blocks, onChange }: EmailBlockEditorProps) {
  return (
    <BlockEditorProvider
      initialBlocks={blocks}
      onBlocksChange={onChange}
      initialViewport="desktop"
    >
      <div className="max-w-[600px] mx-auto">
        <EditorInner onChange={onChange} blockTypes={EMAIL_BLOCK_TYPE_LIST} />
      </div>
    </BlockEditorProvider>
  );
}
