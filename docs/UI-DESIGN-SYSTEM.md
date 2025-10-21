# UI/UX Design System - Petakeu Dashboard

## Design Philosophy

Desain Petakeu mengadopsi best practices dari admin panel terkemuka seperti:

1. **Vercel Dashboard** - Clean, minimalist, dengan fokus pada data
2. **Linear** - Modern, smooth animations, excellent UX
3. **Stripe Dashboard** - Professional, data-dense tapi tetap readable
4. **Tailwind UI** - Consistent, accessible, production-ready

## Color Palette

### Primary Colors (Blue)
- `primary-50`: #eff6ff - Background tints
- `primary-100`: #dbeafe - Hover states
- `primary-500`: #3b82f6 - Main brand color
- `primary-600`: #2563eb - Active states
- `primary-700`: #1d4ed8 - Darker accents

### Semantic Colors

**Success (Green)**
- For positive metrics, growth, success states
- `success-500`: #22c55e

**Warning (Amber)**
- For alerts, pending states, cautionary information  
- `warning-500`: #f59e0b

**Danger (Red)**
- For errors, critical alerts, deficit indicators
- `danger-500`: #ef4444

### Neutral Palette
- `gray-50` to `gray-900` for text, backgrounds, borders

## Typography

### Font Family
```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### Font Sizes
- Heading 1: `text-3xl` (30px) - Page titles
- Heading 2: `text-2xl` (24px) - Section titles  
- Heading 3: `text-xl` (20px) - Card titles
- Body: `text-base` (16px) - Regular text
- Small: `text-sm` (14px) - Labels, hints
- Extra Small: `text-xs` (12px) - Captions, metadata

### Font Weights
- Regular: `font-normal` (400)
- Medium: `font-medium` (500) - Labels, nav items
- Semibold: `font-semibold` (600) - Subheadings
- Bold: `font-bold` (700) - Numbers, CTAs

## Spacing System

Using Tailwind's 4px base spacing:
- `gap-2` (8px) - Tight spacing
- `gap-4` (16px) - Default spacing
- `gap-6` (24px) - Section spacing
- `gap-8` (32px) - Large gaps

## Border Radius

- `rounded-lg` (12px) - Cards, buttons
- `rounded-xl` (16px) - Large cards
- `rounded-2xl` (24px) - Hero sections

## Shadows

- `shadow-sm` - Subtle elevation
- `shadow-md` - Cards
- `shadow-lg` - Dropdowns, modals
- `shadow-xl` - Popovers
- `shadow-2xl` - Maximum elevation

## Components

### Stat Cards (`StatCard`)

Purpose: Display key metrics with optional trends

Features:
- Gradient backgrounds for visual hierarchy
- Icon support
- Trend indicators with directional arrows
- Hover effects with shadow transitions
- Variants: success, warning, danger, info, purple

Usage:
```tsx
<StatCard
  variant="success"
  title="Total Realisasi"
  value="Rp 34.000.000"
  description="Periode Agustus 2025"
  icon={<DollarSign className="w-6 h-6 text-green-600" />}
  trend={{ value: 12.5, isPositive: true }}
/>
```

### Animated Cards (`AnimatedCard`)

Purpose: Interactive content containers

Features:
- Hover lift animation (`-translate-y-1`)
- Smooth shadow transitions
- Optional glow effect
- Consistent border styling

Usage:
```tsx
<AnimatedCard hover glow>
  <AnimatedCardHeader>
    <AnimatedCardTitle>Title</AnimatedCardTitle>
    <AnimatedCardDescription>Description</AnimatedCardDescription>
  </AnimatedCardHeader>
  <AnimatedCardContent>
    {/* Content */}
  </AnimatedCardContent>
</AnimatedCard>
```

### Tabs (`Tabs`)

Purpose: Content organization with multiple views

Features:
- Smooth active state transitions
- Pill-style design with backdrop blur
- Keyboard accessible
- Focus indicators

Usage:
```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    {/* Content */}
  </TabsContent>
</Tabs>
```

### Sidebar Navigation

Features:
- Collapsible with smooth animations
- Active state highlighting
- Icon-based navigation
- Tooltips when collapsed
- Framer Motion animations

## Animation Guidelines

### Transitions
- **Fast** (150ms): Hover states, color changes
- **Base** (200ms): Default transitions
- **Slow** (300ms): Complex animations, layouts

### Easing
Use `cubic-bezier(0.4, 0, 0.2, 1)` for smooth, natural motion

### Motion Principles
1. **Purposeful**: Every animation should serve UX
2. **Consistent**: Same elements animate the same way
3. **Performant**: Use transform/opacity, avoid layout shifts
4. **Subtle**: Don't distract from content

## Accessibility

### Focus States
All interactive elements have visible focus rings:
```css
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```

### Color Contrast
- Text on white: Minimum gray-700 (WCAG AA)
- Interactive elements: High contrast states
- Error states: Red with sufficient contrast

### Keyboard Navigation
- All controls accessible via keyboard
- Logical tab order
- Escape to close modals/dropdowns

## Responsive Design

### Breakpoints
- `sm`: 640px - Small tablets
- `md`: 768px - Tablets
- `lg`: 1024px - Laptops
- `xl`: 1280px - Desktops
- `2xl`: 1536px - Large screens

### Mobile-First Approach
Start with mobile layout, enhance for larger screens:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

## Data Visualization

### Chart Colors
Use semantic colors for data:
- Positive/Growth: Green (`#22c55e`)
- Negative/Decline: Red (`#ef4444`)
- Neutral: Blue (`#3b82f6`)
- Comparative: Purple/Orange

### Map Colors
Choropleth gradients:
- Low values: Light blue (`#dbeafe`)
- Medium values: Blue (`#60a5fa`)
- High values: Dark blue (`#1e40af`)

## Best Practices

### DO ✅
- Use consistent spacing (4px grid)
- Provide visual feedback for interactions
- Group related information
- Use whitespace effectively
- Test on multiple screen sizes
- Ensure color contrast meets WCAG standards

### DON'T ❌
- Mix different button styles on same page
- Use too many colors (stick to palette)
- Forget loading states
- Ignore error states
- Create inaccessible focus states
- Use animations longer than 500ms

## Performance

### Optimizations
1. **Lazy load** components not immediately visible
2. **Debounce** search and filter inputs
3. **Virtualize** large lists (>100 items)
4. **Memoize** expensive computations
5. **Code split** routes

### Bundle Size
- Keep component bundles < 100KB
- Use dynamic imports for heavy libraries
- Tree-shake unused code

## Future Enhancements

### Planned
1. **Dark Mode** - System preference detection
2. **Theme Customization** - User-defined colors
3. **Advanced Animations** - Micro-interactions
4. **Component Library** - Storybook integration
5. **Design Tokens** - CSS variables for theming

### Under Consideration
- 3D visualizations for geo data
- Real-time updates with WebSocket
- Offline mode with service workers
- PDF/Excel export with custom branding

---

**Last Updated**: 21 Oktober 2025  
**Design System Version**: 1.0.0
