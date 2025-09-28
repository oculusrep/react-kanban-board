import React, { useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';

interface QuillWrapperProps {
  value: string;
  onChange: (content: string) => void;
  modules?: any;
  formats?: string[];
  placeholder?: string;
  className?: string;
}

const QuillWrapper: React.FC<QuillWrapperProps> = ({
  value,
  onChange,
  modules,
  formats,
  placeholder,
  className
}) => {
  const quillRef = useRef<ReactQuill>(null);

  // Suppress findDOMNode warning in development
  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('findDOMNode is deprecated')
      ) {
        return; // Suppress the warning
      }
      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

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
      style={{
        minHeight: '200px',
      }}
    />
  );
};

export default QuillWrapper;