import React, { useRef, useMemo, lazy, Suspense, useState, useEffect, Component, ReactNode, ErrorInfo } from 'react';

// Error boundary to handle chunk loading failures (e.g., after deployments)
class QuillErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Quill editor loading error:', error, info);
    // Check if this is a chunk loading error (common after deployments)
    if (error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Loading CSS chunk')) {
      // Store a flag to prevent infinite reload loops (10 second window)
      const lastReload = sessionStorage.getItem('quill_chunk_reload');
      if (!lastReload || parseInt(lastReload) < Date.now() - 10000) {
        sessionStorage.setItem('quill_chunk_reload', Date.now().toString());
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] bg-gray-50 border rounded flex flex-col items-center justify-center text-gray-500">
          <p className="text-sm">Editor failed to load</p>
          <p className="text-xs text-gray-400 mt-1">This may happen after an update</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <QuillErrorBoundary>
      <Suspense fallback={<div className="min-h-[200px] bg-gray-50 border rounded flex items-center justify-center text-gray-400">Loading editor...</div>}>
        <QuillEditor {...props} quillRef={quillRef} />
      </Suspense>
    </QuillErrorBoundary>
  );
};

export default QuillWrapper;