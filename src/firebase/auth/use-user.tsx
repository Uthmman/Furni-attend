
"use client";

import { useFirebase } from '../provider';

/**
 * DEPRECATED: Please use `useUser` from `@/firebase/provider` instead.
 * This hook is kept for backward compatibility but will be removed in a future version.
 * 
 * The new `useUser` hook is part of a more robust authentication flow that
 * correctly handles loading states and redirects. Using this old hook may result
 * in unexpected behavior, especially with protected routes.
 * 
 * Example of new usage:
 * import { useUser } from '@/firebase'; // or from '@/firebase/provider'
 * const { user, isUserLoading } = useUser();
 */
export function useUser() {
  const { user, isUserLoading: loading } = useFirebase();
  return { user, loading };
}
