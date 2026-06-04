'use client';

import React, { useState, useRef, useCallback } from 'react';

interface HTMLEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export const HTMLEditor: React.FC<HTMLEditorProps> = ({
  value,
  onChange,
  placeholder = "Enter description...",
  className = "",
  minHeight = "120px"
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Format commands
  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // Handle content changes
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // Handle paste to clean up formatting
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Initialize content
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 p-2">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Text formatting */}
          <button
            type="button"
            onClick={() => execCommand('bold')}
            className="px-2 py-1 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => execCommand('italic')}
            className="px-2 py-1 text-xs italic hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Italic"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => execCommand('underline')}
            className="px-2 py-1 text-xs underline hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Underline"
          >
            U
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

          {/* Lists */}
          <button
            type="button"
            onClick={() => execCommand('insertUnorderedList')}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Bullet List"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => execCommand('insertOrderedList')}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Numbered List"
          >
            1. List
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

          {/* Alignment */}
          <button
            type="button"
            onClick={() => execCommand('justifyLeft')}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Align Left"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => execCommand('justifyCenter')}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Align Center"
          >
            ↔
          </button>
          <button
            type="button"
            onClick={() => execCommand('justifyRight')}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Align Right"
          >
            →
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

          {/* Link */}
          <button
            type="button"
            onClick={() => {
              const url = prompt('Enter URL:');
              if (url) {
                execCommand('createLink', url);
              }
            }}
            className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            title="Add Link"
          >
            Link
          </button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        className="p-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none"
        style={{ minHeight }}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />

      {/* Placeholder styling */}
      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          font-style: italic;
        }
        [contenteditable]:focus:before {
          display: none;
        }
      `}</style>
    </div>
  );
};