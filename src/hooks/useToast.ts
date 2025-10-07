import { useState, useCallback } from 'react';

interface ToastOptions {
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

export const useToast = () => {
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
  }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'success', duration = 3000 } = options;

    setToast({
      message,
      type,
      visible: true,
    });

    // Auto-hide after duration
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  return {
    toast,
    showToast,
    hideToast,
  };
};
