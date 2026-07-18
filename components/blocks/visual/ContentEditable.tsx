'use client';

import { useRef, useEffect } from 'react';

interface ContentEditableProps {
  html: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  tagName?: string;
  style?: React.CSSProperties;
}

export function ContentEditable({
  html,
  onChange,
  className = '',
  placeholder = '',
  tagName = 'div',
  style,
}: ContentEditableProps) {
  const contentRef = useRef<HTMLElement>(null);
  const lastHtml = useRef(html);

  useEffect(() => {
    if (contentRef.current && html !== contentRef.current.innerHTML) {
      contentRef.current.innerHTML = html;
    }
  }, [html, tagName]);

  const handleInput = () => {
    if (contentRef.current) {
      const newHtml = contentRef.current.innerHTML;
      if (newHtml !== lastHtml.current) {
        lastHtml.current = newHtml;
        onChange(newHtml);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const Tag = tagName as unknown as React.ComponentType<
    React.HTMLAttributes<HTMLElement> & {
      ref?: React.RefObject<HTMLElement | null>;
      'data-placeholder'?: string;
      suppressContentEditableWarning?: boolean;
    }
  >;

  return (
    <Tag
      ref={contentRef}
      contentEditable
      onInput={handleInput}
      onPaste={handlePaste}
      className={`${className} ${!html || html === '' ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground' : ''}`}
      data-placeholder={placeholder}
      style={style}
      suppressContentEditableWarning
    />
  );
}
