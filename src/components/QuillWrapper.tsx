import React, { useRef, useMemo } from 'react';
import ReactQuill from 'react-quill';

interface QuillWrapperProps {
  value: string;
  onChange: (content: string) => void;
  modules?: any;
  formats?: string[];
  placeholder?: string;
  className?: string;
  tabIndex?: number;
}

// Only suppress findDOMNode warnings in development
if (process.env.NODE_ENV === 'development') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('findDOMNode is deprecated') ||
       args[0].includes('Warning: findDOMNode is deprecated'))
    ) {
      return; // Suppress the warning in development only
    }
    originalConsoleError(...args);
  };
}

const QuillWrapper: React.FC<QuillWrapperProps> = ({
  value,
  onChange,
  modules,
  formats,
  placeholder,
  className,
  tabIndex
}) => {
  const quillRef = useRef<ReactQuill>(null);

  // Memoize the style object to prevent unnecessary re-renders
  const editorStyle = useMemo(() => ({
    minHeight: '200px',
  }), []);

  // Apply tabIndex to the editor after it mounts
  React.useEffect(() => {
    if (quillRef.current && tabIndex !== undefined) {
      const editor = quillRef.current.getEditor();
      const editorElement = editor.root;
      editorElement.setAttribute('tabindex', String(tabIndex));
    }
  }, [tabIndex]);

  return (
    <ReactQuill
      ref={quillRef}
      theme="snow"
      value={value}
      onChange={onChange}
      modules={modules}
      formats={formats}
      placeholder={placeholder}
      className={className}
      style={editorStyle}
    />
  );
};

export default QuillWrapper;