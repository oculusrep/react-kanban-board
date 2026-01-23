import React, { useRef, useMemo, lazy, Suspense, useState, useEffect } from 'react';

// Lazy load ReactQuill to prevent constructor conflicts with Google Maps AdvancedMarkerElement
const ReactQuill = lazy(() => import('react-quill').then(module => {
  // Import CSS side effect
  import('react-quill/dist/quill.snow.css');
  return module;
}));

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

// Inner component that actually renders ReactQuill (needs to be inside Suspense)
const QuillEditor: React.FC<QuillWrapperProps & { quillRef: React.RefObject<any> }> = ({
  value,
  onChange,
  modules,
  formats,
  placeholder,
  className,
  tabIndex,
  quillRef
}) => {
  // Memoize the style object to prevent unnecessary re-renders
  const editorStyle = useMemo(() => ({
    minHeight: '200px',
  }), []);

  // Apply tabIndex to the editor after it mounts
  useEffect(() => {
    if (quillRef.current && tabIndex !== undefined) {
      const editor = quillRef.current.getEditor();
      const editorElement = editor.root;
      editorElement.setAttribute('tabindex', String(tabIndex));
    }
  }, [tabIndex, quillRef]);

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

const QuillWrapper: React.FC<QuillWrapperProps> = (props) => {
  const quillRef = useRef<any>(null);

  return (
    <Suspense fallback={<div className="min-h-[200px] bg-gray-50 border rounded flex items-center justify-center text-gray-400">Loading editor...</div>}>
      <QuillEditor {...props} quillRef={quillRef} />
    </Suspense>
  );
};

export default QuillWrapper;