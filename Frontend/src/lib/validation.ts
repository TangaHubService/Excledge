export function parseZodError(error: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
    for (const err of zodError.issues) {
      const path = err.path.join('.');
      errors[path] = err.message;
    }
  }

  return errors;
}