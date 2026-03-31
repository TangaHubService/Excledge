import { NextFunction, Request, Response } from "express";
import { ObjectSchema } from "joi";
import { ApiError } from "../common/http";

type ValidationSchemas = {
  body?: ObjectSchema;
  query?: ObjectSchema;
  params?: ObjectSchema;
};

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const targets: Array<keyof ValidationSchemas> = ["body", "query", "params"];
    for (const target of targets) {
      const schema = schemas[target];
      if (!schema) continue;
      const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
      if (error) {
        return next(
          new ApiError(
            "VALIDATION_ERROR",
            400,
            "Request validation failed",
            error.details.map((d) => d.message),
          ),
        );
      }
      if (target === "query") {
        Object.assign(req.query, value);
      } else if (target === "params") {
        Object.assign(req.params, value);
      } else {
        req.body = value;
      }
    }
    return next();
  };
};
