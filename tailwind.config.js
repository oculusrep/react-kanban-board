/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      // Typography scale - single source of truth for all text sizes
      fontSize: {
        // Form-specific sizes
        'form-label': ['0.875rem', { lineHeight: '1.25rem' }],      // 14px - standard form labels
        'form-input': ['0.875rem', { lineHeight: '1.25rem' }],      // 14px - form input text
        'form-input-lg': ['1rem', { lineHeight: '1.5rem' }],        // 16px - larger input text (editable fields)
        'form-heading': ['1.125rem', { lineHeight: '1.75rem' }],    // 18px - section headings
        'form-help': ['0.75rem', { lineHeight: '1rem' }],           // 12px - help text

        // Modal/Dialog sizes
        'modal-title': ['1.25rem', { lineHeight: '1.75rem' }],      // 20px - modal titles
        'modal-section': ['1rem', { lineHeight: '1.5rem' }],        // 16px - modal section headers

        // Display sizes (for prominent values)
        'display-value': ['1.125rem', { lineHeight: '1.75rem' }],   // 18px - large display values
        'display-value-sm': ['1rem', { lineHeight: '1.5rem' }],     // 16px - medium display values
      },

      // Spacing scale for forms
      spacing: {
        'form-label-gap': '0.25rem',  // 4px - gap between label and input
        'form-field-gap': '1rem',     // 16px - gap between form fields
        'form-section-gap': '1.5rem', // 24px - gap between form sections
      },

      // Min heights for consistency
      minHeight: {
        'input': '44px',      // Standard input height (good for touch)
        'input-sm': '36px',   // Smaller input height
        'input-lg': '48px',   // Larger input height
      }
    }
  },
  plugins: []
}
