'use client';

import { ElementType, useRef, useEffect, useState, useCallback } from 'react';

interface RichTextEditableProps {
  html: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  tagName?: string;
  /** Show formatting toolbar on focus */
  toolbar?: boolean;
  /** Single-line mode - disables enter key */
  singleLine?: boolean;
  style?: React.CSSProperties;
}

const TOOLBAR_BUTTONS = [
  { cmd: 'bold', icon: 'format_bold', title: 'Bold (Ctrl+B)' },
  { cmd: 'italic', icon: 'format_italic', title: 'Italic (Ctrl+I)' },
  { cmd: 'underline', icon: 'format_underlined', title: 'Underline (Ctrl+U)' },
  { cmd: 'strikeThrough', icon: 'strikethrough_s', title: 'Strikethrough' },
  { cmd: 'sep' },
  { cmd: 'foreColor', icon: 'format_color_text', title: 'Text Color' },
  { cmd: 'hiliteColor', icon: 'format_color_fill', title: 'Highlight Color' },
  { cmd: 'sep' },
  { cmd: 'insertUnorderedList', icon: 'format_list_bulleted', title: 'Bullet List' },
  { cmd: 'insertOrderedList', icon: 'format_list_numbered', title: 'Numbered List' },
  { cmd: 'sep' },
  { cmd: 'createLink', icon: 'link', title: 'Insert Link' },
  { cmd: 'removeFormat', icon: 'format_clear', title: 'Clear Formatting' },
] as const;

export function RichTextEditable({
  html,
  onChange,
  className = '',
  placeholder = '',
  tagName = 'div',
  toolbar = true,
  singleLine = false,
  style,
}: RichTextEditableProps) {
  const contentRef = useRef<HTMLElement>(null);
  const lastHtml = useRef(html);
  const [showToolbar, setShowToolbar] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [colorPicker, setColorPicker] = useState<{ cmd: 'foreColor' | 'hiliteColor'; color: string } | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (contentRef.current && html !== contentRef.current.innerHTML) {
      contentRef.current.innerHTML = html;
    }
  }, [html, tagName]);

  const handleInput = useCallback(() => {
    if (contentRef.current) {
      const newHtml = contentRef.current.innerHTML;
      if (newHtml !== lastHtml.current) {
        lastHtml.current = newHtml;
        onChange(newHtml);
      }
    }
  }, [onChange]);

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    // Allow basic HTML formatting on paste but sanitize
    const htmlData = e.clipboardData.getData('text/html');
    const textData = e.clipboardData.getData('text/plain');

    if (htmlData) {
      // Strip everything except basic formatting tags
      const cleaned = htmlData
        .replace(/<(?!\/?(?:b|i|u|strong|em|s|strike|a|br|ul|ol|li|p|span)[ >])[^>]*>/gi, '')
        .replace(/ (class|id|data-[a-z-]*)="[^"]*"/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      document.execCommand('insertHTML', false, cleaned);
    } else {
      document.execCommand('insertText', false, textData);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
    }
    // Prevent default event propagation for formatting shortcuts
    e.stopPropagation();
  };

  const execCommand = (cmd: string) => {
    if (cmd === 'createLink') {
      const url = window.prompt('Enter URL:', 'https://');
      if (url) document.execCommand('createLink', false, url);
    } else if (cmd === 'foreColor' || cmd === 'hiliteColor') {
      // Save selection before opening color picker
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      setColorPicker({ cmd, color: cmd === 'foreColor' ? '#000000' : '#ffff00' });
      // Use a hidden input[type=color] to pick, then apply
      setTimeout(() => {
        if (colorInputRef.current) {
          colorInputRef.current.dataset.cmd = cmd;
          colorInputRef.current.value = cmd === 'foreColor' ? '#000000' : '#ffff00';
          // Restore selection before click
          if (range && sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
          colorInputRef.current.click();
        }
      }, 0);
      return;
    } else {
      document.execCommand(cmd, false);
    }
    contentRef.current?.focus();
    updateActiveFormats();
    handleInput();
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cmd = e.target.dataset.cmd as string;
    const color = e.target.value;
    if (cmd && color) {
      document.execCommand(cmd, false, color);
      contentRef.current?.focus();
      handleInput();
    }
    setColorPicker(null);
  };

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
    if (document.queryCommandState('insertUnorderedList')) formats.add('insertUnorderedList');
    if (document.queryCommandState('insertOrderedList')) formats.add('insertOrderedList');
    setActiveFormats(formats);
  }, []);

  const handleFocus = () => {
    setShowToolbar(true);
    updateActiveFormats();
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't hide toolbar if clicking a toolbar button
    const related = e.relatedTarget as HTMLElement;
    if (related?.closest('.rte-toolbar')) return;
    setShowToolbar(false);
  };

  const handleSelectionChange = () => {
    if (showToolbar) updateActiveFormats();
  };

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  });

  const isEmpty = !html || html === '' || html === '<br>';

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {/* Hidden color input for foreColor / hiliteColor */}
      <input
        ref={colorInputRef}
        type="color"
        className="sr-only"
        tabIndex={-1}
        onChange={handleColorChange}
      />

      {/* Formatting toolbar */}
      {toolbar && showToolbar && (
        <div className="rte-toolbar absolute -top-9 left-0 z-30 flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-lg px-1 py-0.5">
          {TOOLBAR_BUTTONS.map((btn, i) =>
            btn.cmd === 'sep' ? (
              <div key={i} className="w-px h-5 bg-border mx-0.5" />
            ) : (
              <button
                key={btn.cmd}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); execCommand(btn.cmd); }}
                title={btn.title}
                className={`p-1 rounded transition-colors ${
                  activeFormats.has(btn.cmd)
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <span className="material-icons text-sm">{btn.icon}</span>
              </button>
            ),
          )}
        </div>
      )}

      {(() => {
        const El = tagName as ElementType;
        return (
          <El
            ref={contentRef}
            contentEditable
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`outline-none ${className} ${isEmpty ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none' : ''}`}
            data-placeholder={placeholder}
            style={style}
            suppressContentEditableWarning
          />
        );
      })()}
    </div>
  );
}
