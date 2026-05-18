# CryoVault AI Development Rules

This document outlines the technical stack and coding standards for the CryoVault application.

## Tech Stack

*   **Framework:** React 18 with Vite for high-performance development and bundling.
*   **Language:** TypeScript for strict type safety and robust application logic.
*   **Styling:** Tailwind CSS for utility-first, responsive, and maintainable styling.
*   **UI Components:** shadcn/ui (built on Radix UI) for accessible and customizable interface elements.
*   **Backend & Auth:** Supabase for real-time database (PostgreSQL), Authentication, and File Storage.
*   **Data Fetching:** TanStack Query (React Query) for server state management, caching, and synchronization.
*   **State Management:** Zustand for lightweight and performant global client-side state.
*   **Routing:** React Router for declarative client-side navigation.
*   **Icons:** Lucide React for a consistent, modern, and lightweight icon set.
*   **Data Visualization:** Recharts for interactive and responsive dashboard analytics.

## Library Usage Guidelines

### UI & Styling
*   **Components:** Always check `src/components/ui/` for existing shadcn/ui components before creating new ones.
*   **Icons:** Use `lucide-react` exclusively. Do not import from other icon libraries.
*   **Layout:** Use Tailwind's Flexbox and Grid utilities for all layouts. Avoid custom CSS in `index.css` or `App.css`.
*   **Toasts:** Use the `sonner` library for all user notifications and feedback.

### Data & Logic
*   **Server State:** Use TanStack Query (`useQuery`, `useMutation`) for all interactions with Supabase. Do not use `useEffect` for data fetching.
*   **Forms:** Use `react-hook-form` combined with `zod` for schema validation.
*   **Dates:** Use `date-fns` for all date formatting and manipulation.
*   **Excel/CSV:** Use `xlsx` for spreadsheet generation and `papaparse` for CSV parsing.

### Architecture
*   **File Structure:** 
    *   Pages go in `src/pages/`.
    *   Reusable components go in `src/components/`.
    *   Custom hooks go in `src/hooks/`.
    *   Types go in `src/types/index.ts`.
*   **Components:** Keep components small and focused. If a component exceeds 150 lines, consider refactoring into smaller sub-components.
*   **Supabase:** Use the centralized client in `src/lib/supabase.ts`.