import type { ReactNode } from "react";

export interface AuthPromptProps {
  isLoaded: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  title?: string;
  message?: string;
  children?: ReactNode;
}
export function AuthPrompt({
  isLoaded,
  isAuthenticated,
  isConfigured,
  title = "Sign in required",
  message = "Sign in with your invited White Point account to access internal tools.",
  children,
}: AuthPromptProps) {
  if (!isLoaded)
    return (
      <div className="p-6 text-sm text-slate-600">Checking your sign-in…</div>
    );
  if (isAuthenticated) return null;
  return (
    <div className="bg-white p-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="my-2 text-sm text-slate-600">{message}</p>
      {isConfigured ? (
        children
      ) : (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
          Sign-in is not configured for this environment.
        </p>
      )}
    </div>
  );
}
