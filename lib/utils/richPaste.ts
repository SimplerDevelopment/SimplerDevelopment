import { Block } from '@/types/blocks';

/**
 * Parse rich HTML content from clipboard and convert to blocks
 *
 * @param html - HTML string from clipboard
 * @returns Array of Block objects
 *
 * @example
 * ```ts
 * const html = '<h1>Title</h1><p>Content</p>';
 * const blocks = parseRichContent(html);
 * // [{ type: 'heading', content: 'Title', level: 1 }, { type: 'text', content: 'Content' }]
 * ```
 */
export function parseRichContent(html: string): Block[] {
  // Handle empty or whitespace-only input
  if (!html || html.trim().length === 0) {
    return [];
  }

  // Parse HTML using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Clean up proprietary styles and classes
  cleanDocument(doc);

  // Convert DOM nodes to blocks
  const nodes = Array.from(doc.body.childNodes);
  const blocks = convertNodesToBlocks(nodes);

  // Assign order and return
  return blocks.map((block, index) => ({
    ...block,
    order: index,
  }));
}

/**
 * Convert DOM nodes to Block objects
 *
 * @param nodes - Array of DOM nodes
 * @returns Array of Block objects
 */
export function convertNodesToBlocks(nodes: Node[]): Block[] {
  const blocks: Block[] = [];

  nodes.forEach((node) => {
    // Skip text nodes that are only whitespace
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || '';
      if (text.length === 0) return;

      // Convert plain text to text block
      blocks.push(createTextBlock(text));
      return;
    }

    // Skip non-element nodes
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // Convert based on tag name
    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        blocks.push(createHeadingBlock(element, parseInt(tagName.charAt(1))));
        break;

      case 'p':
        blocks.push(createTextBlock(getInnerHTML(element)));
        break;

      case 'blockquote':
        blocks.push(createQuoteBlock(element));
        break;

      case 'ul':
        blocks.push(createListBlock(element, 'bullet'));
        break;

      case 'ol':
        blocks.push(createListBlock(element, 'numbered'));
        break;

      case 'img':
        blocks.push(createImageBlock(element));
        break;

      case 'div':
      case 'section':
      case 'article':
        // Recursively process container elements
        const childBlocks = convertNodesToBlocks(Array.from(element.childNodes));
        blocks.push(...childBlocks);
        break;

      // Skip unsupported elements (video, audio, iframe, script, style, etc.)
      default:
        // If element has text content, try to extract it as text block
        const text = element.textContent?.trim();
        if (text && text.length > 0) {
          blocks.push(createTextBlock(text));
        }
        break;
    }
  });

  return blocks;
}

/**
 * Create a text block
 */
function createTextBlock(content: string): Block {
  return {
    id: generateBlockId(),
    type: 'text',
    content: content.trim(),
    order: 0,
    alignment: 'left',
    size: 'base',
  };
}

/**
 * Create a heading block
 */
function createHeadingBlock(element: Element, level: number): Block {
  return {
    id: generateBlockId(),
    type: 'heading',
    content: getInnerHTML(element),
    order: 0,
    level: level as 1 | 2 | 3 | 4 | 5 | 6,
    alignment: 'left',
  };
}

/**
 * Create a quote block
 */
function createQuoteBlock(element: Element): Block {
  return {
    id: generateBlockId(),
    type: 'quote',
    content: getInnerHTML(element),
    order: 0,
    author: '',
    citation: '',
  };
}

/**
 * Create a list block
 */
function createListBlock(element: Element, style: 'bullet' | 'numbered'): Block {
  const items = Array.from(element.querySelectorAll('li')).map((li) =>
    getInnerHTML(li)
  );

  // TODO: Create proper ListBlock type - for now convert to text
  const listContent = items.map((item, index) => `${style === 'numbered' ? `${index + 1}.` : '•'} ${item}`).join('\n');

  return {
    id: generateBlockId(),
    type: 'text',
    content: listContent,
    order: 0,
    alignment: 'left',
    size: 'base',
  };
}

/**
 * Create an image block
 */
function createImageBlock(element: Element): Block {
  const img = element as HTMLImageElement;
  return {
    id: generateBlockId(),
    type: 'image',
    url: img.src || '',
    alt: img.alt || '',
    caption: '',
    order: 0,
  };
}

/**
 * Get inner HTML while preserving inline formatting
 */
function getInnerHTML(element: Element): string {
  // Clone element to avoid modifying original
  const clone = element.cloneNode(true) as Element;

  // Remove block-level elements but keep inline formatting
  const blockElements = clone.querySelectorAll('div, section, article, header, footer, nav, aside');
  blockElements.forEach((el) => {
    // Replace block element with its text content
    const text = document.createTextNode(el.textContent || '');
    el.parentNode?.replaceChild(text, el);
  });

  // Get innerHTML and clean it
  let html = clone.innerHTML;

  // Remove empty tags
  html = html.replace(/<(\w+)><\/\1>/g, '');

  // Clean whitespace
  html = html.trim();

  // If no HTML tags remain, return text content only
  if (!/<\w+/.test(html)) {
    return clone.textContent?.trim() || '';
  }

  return html;
}

/**
 * Clean document of proprietary styles and classes
 */
function cleanDocument(doc: Document): void {
  // Remove script and style tags
  const unwantedTags = doc.querySelectorAll('script, style, meta, link');
  unwantedTags.forEach((tag) => tag.remove());

  // Remove proprietary classes (Word, Google Docs, etc.)
  const proprietaryClassPrefixes = ['Mso', 'Google', 'Apple', 'Word'];
  const allElements = doc.querySelectorAll('*');

  allElements.forEach((element) => {
    const htmlElement = element as HTMLElement;

    // Remove proprietary classes
    const classes = Array.from(htmlElement.classList);
    classes.forEach((className) => {
      if (proprietaryClassPrefixes.some((prefix) => className.startsWith(prefix))) {
        htmlElement.classList.remove(className);
      }
    });

    // Remove inline styles (we'll preserve semantic HTML but strip styling)
    // Keep only essential formatting attributes
    const allowedStyles = ['font-weight', 'font-style', 'text-decoration'];
    const style = htmlElement.style;
    const stylesToRemove: string[] = [];

    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (!allowedStyles.includes(prop)) {
        stylesToRemove.push(prop);
      }
    }

    stylesToRemove.forEach((prop) => {
      style.removeProperty(prop);
    });

    // If no styles remain, remove style attribute
    if (style.length === 0) {
      htmlElement.removeAttribute('style');
    }

    // Remove proprietary attributes
    const proprietaryAttrs = ['data-', 'xmlns', 'xml:'];
    Array.from(htmlElement.attributes).forEach((attr) => {
      if (proprietaryAttrs.some((prefix) => attr.name.startsWith(prefix))) {
        htmlElement.removeAttribute(attr.name);
      }
    });
  });
}

/**
 * Generate unique block ID
 */
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Result of paste operation with warnings for unsupported content
 */
export interface PasteResult {
  blocks: Block[];
  warnings: string[];
}

/**
 * Parse rich content with detailed warnings about unsupported elements
 *
 * @param html - HTML string from clipboard
 * @returns PasteResult with blocks and warnings
 */
export function parseRichContentWithWarnings(html: string): PasteResult {
  const warnings: string[] = [];
  const blocks = parseRichContent(html);

  // Detect unsupported content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const unsupportedElements = doc.querySelectorAll(
    'video, audio, iframe, embed, object, canvas, svg, table'
  );

  if (unsupportedElements.length > 0) {
    const elementTypes = new Set<string>();
    unsupportedElements.forEach((el) => elementTypes.add(el.tagName.toLowerCase()));

    warnings.push(
      `The following elements could not be converted: ${Array.from(elementTypes).join(', ')}`
    );
  }

  return { blocks, warnings };
}
