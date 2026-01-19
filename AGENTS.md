# AGENTS.md - Open Lovable Development Guide

This is a **workspace project** with the following structure:

- **Main Project**: `openlovable/` - This is the primary project to build and modify
- **Reference Projects**: `bolt.diy/` and `opencode-1/` and potentially other AI-generated projects in the future

## Purpose
The goal is to study and reference different AI-generated projects to improve and build Open Lovable. Only the `openlovable/` code should be modified. All reference projects are **read-only** - use them for learning, comparison, and inspiration only.

## Build, Lint, and Test Commands

```bash
# Development
pnpm dev              # Start dev server with turbopack (recommended)

# Build & Production
pnpm build            # Build for production
pnpm start            # Start production server

# Linting
pnpm lint             # Run ESLint

# Testing
pnpm test:api         # Run API endpoint tests
pnpm test:code        # Run code execution tests
pnpm test:all         # Run all tests

# E2B Sandbox (code execution environment)
pnpm e2b:build        # Build e2b template
pnpm e2b:list         # List installed e2b templates
pnpm e2b:login        # Login to e2b
```

## Code Style Guidelines

### TypeScript
- Use strict TypeScript with Next.js conventions
- Use `any` type where appropriate (ESLint rule allows it)
- Prefer explicit types for function parameters and return values
- Use `import type` for type-only imports when possible

### Imports and Path Aliases
- Use `@/*` alias for absolute imports (configured in `tsconfig.json`)
- Example: `import { cn } from "@/lib/utils"`
- Group imports: React → external → internal → CSS/styles

### React Components
- Use React 19 with functional components and hooks
- Use `React.forwardRef` for components requiring refs
- Use `displayName` for named components
- Prefer composition over inheritance

### Styling with Tailwind CSS
- Use Tailwind v3 utility classes as primary styling
- Use `cn()` utility (`clsx` + `tailwind-merge`) for conditional classes
- Use `class-variance-authority` (CVA) for component variants (see button.tsx)
- Custom utilities: `cw-*` (centered width), `ch-*` (centered height), `cs-*` (centered size)
- Extended theme with custom type scale: `title-h1` through `title-h5`, `body-*`, `label-*`, `mono-*`

### Design System
**Colors:**
- Heat scale: `--heat-4` through `--heat-100` (fire orange shades)
- Accents: `--accent-black`, `--accent-amethyst`, `--accent-bluetron`, `--accent-crimson`
- Use P3 color space with sRGB fallbacks for wide gamut displays

**Typography:**
- Display: SuisseIntl (weights 400-700)
- Mono: System monospace stack (SF Mono, Monaco, Inconsolata)

**Animations:**
- Use CSS transitions for simple animations (200ms default)
- Use Framer Motion for complex animations
- Fire-inspired effects: `.animate-flicker`, `.animate-glow`

### Component Structure
- Base UI components: `components/ui/` (shadcn-like pattern)
- Shared components: `components/shared/`
- App-specific components: `components/app/`
- New architecture: `components-new/`
- CSS files: `styles/components/` (only when Tailwind isn't sufficient)

### Error Handling
- Use Zod for runtime validation
- Return typed results from utility functions
- Handle errors gracefully with user feedback (sonner toasts)

### Naming Conventions
- Components: PascalCase (`Button`, `HeroInput`)
- Hooks: camelCase with `use` prefix (`useState`, `useDebounce`)
- Utilities: camelCase (`cn`, `formatDate`)
- Files: kebab-case for non-components, PascalCase for components

### ESLint Configuration
- Extends `next/core-web-vitals` and `next/typescript`
- `any` type is allowed
- Unused vars: warning level (not enforced)
- `react-hooks/exhaustive-deps`: warning

### Flame Effects (components-new/shared/effects/)
- Data-driven ASCII animations with `data.json` frame files
- Use `setIntervalOnVisible` for viewport-based animation
- Frame speed: 40-85ms intervals
- Components: `CoreFlame`, `AsciiExplosion`, `HeroFlame`, `FlameBackground`

### Important Notes
- This is a Next.js 15 app with App Router
- Uses React 19 and React DOM 19
- Sandboxed code execution via Vercel (default) or E2B
- AI providers: Anthropic (default), Google, OpenAI, Groq
- Scraper: Firecrawl for URL to code generation
