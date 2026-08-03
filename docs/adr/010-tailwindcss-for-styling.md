# ADR-010: Tailwind CSS for Styling

## Status
Accepted

## Context
Petakeu needs a styling solution for the React frontend that provides:
- Rapid UI development
- Consistent design system
- Responsive design
- Dark mode support (planned)
- Small production bundle
- Good developer experience

## Decision
Use Tailwind CSS v4 as the primary styling solution with:
- Utility-first classes in JSX
- CSS variables for design tokens (colors, spacing, typography)
- `@tailwindcss/postcss` for PostCSS integration
- `tailwind-merge` + `clsx` for conditional classes
- `class-variance-authority` for component variants

## Consequences

### Positive
- **Speed**: No context switching between CSS/JSX, rapid prototyping
- **Consistency**: Design tokens enforce spacing, colors, typography
- **Bundle size**: Only used utilities included (~10KB gzipped)
- **Responsive**: Mobile-first utilities (`md:`, `lg:`, `xl:`)
- **Dark mode**: `dark:` variant, CSS variable strategy
- **Maintenance**: No dead CSS, co-located styles
- **Team adoption**: Widely known, good documentation

### Negative
- **Learning curve**: Utility class syntax, mental model shift
- **HTML verbosity**: Long className strings
- **v4 migration**: Significant changes from v3 (CSS-first config)
- **Readability**: Complex components have many classes

### Neutral
- Design tokens in `apps/web/src/styles/theme.css` as CSS variables
- Components use `cva()` for variants (button, card, badge)
- `cn()` utility merges classes intelligently
- No custom CSS files (except theme.css)

## Alternatives Considered

### 1. CSS Modules / Vanilla CSS
- **Pros**: Familiar, scoped, no build step
- **Cons**: No design tokens, manual responsive, larger bundles

### 2. Styled Components / Emotion
- **Pros**: Colocated, dynamic, theming
- **Cons**: Runtime overhead, larger bundle, CSS-in-JS debate

### 3. Chakra UI / MUI (Component Libraries)
- **Pros**: Pre-built components, theming, accessible
- **Cons**: Bundle size, customization limits, opinionated

### 4. UnoCSS
- **Pros**: Faster, on-demand, compatible
- **Cons**: Less mature, smaller ecosystem, Tailwind compatibility layer needed

## Related Decisions
- ADR-004: Technology Stack (Tailwind selected)
- ADR-010: UI Design System (documented in UI-DESIGN-SYSTEM.md)

## Implementation Notes
```css
/* apps/web/src/styles/theme.css */
@import "tailwindcss";

@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  
  --color-success-500: #22c55e;
  --color-warning-500: #f59e0b;
  --color-danger-500: #ef4444;
  
  --font-family-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  
  --spacing-2: 8px;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

```tsx
// Component with variants
import { cva } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500",
        danger: "bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

// Usage
<Button variant="danger" size="lg" onClick={handleDelete}>
  Delete
</Button>
```

```typescript
// Class merging utility
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn(
  "base-classes",
  isActive && "active-classes",
  variant === "primary" && "primary-classes",
  className
)} />
```