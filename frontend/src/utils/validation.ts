import type { AnyObjectSchema } from "yup";

export const validateWithYup = async <T extends Record<string, unknown>>(schema: AnyObjectSchema, values: T) => {
  try {
    await schema.validate(values, { abortEarly: false });
    return {} as Record<string, string>;
  } catch (err) {
    const errors: Record<string, string> = {};
    const yupError = err as { inner?: Array<{ path?: string; message: string }> };
    for (const issue of yupError.inner ?? []) {
      if (issue.path && !errors[issue.path]) errors[issue.path] = issue.message;
    }
    return errors;
  }
};
