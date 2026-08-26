/**
 * The error shape the store throws.
 *
 * Every caller here is an agent, reached through a CLI or a stdio MCP server,
 * so a bare `Error` arrives as an opaque string. What a caller has to act on is
 * carried as fields instead: `code` separates "pick a different slug and retry"
 * from "this input was never going to work", and `retriable` says whether
 * re-running the same call could succeed.
 *
 * No dependency, deliberately. This is four fields and a constructor; an error
 * library would be a runtime dependency in aid of that.
 */
export enum Fault {
  /** The environment is wrong — a path, a permission, a missing directory. */
  Configuration = "Configuration",
  /** Nothing the caller did; retrying may work. */
  System = "System",
  /** The call was malformed or asked for something impossible. */
  User = "User",
}

/** Machine-readable discriminant, stable across message rewording. */
export enum ErrorTypes {
  KbRecordAlreadyExists = "KbRecordAlreadyExists",
  KbInvalidConceptId = "KbInvalidConceptId",
  KbPackBudgetExceeded = "KbPackBudgetExceeded",
  KbRecordNotFound = "KbRecordNotFound",
  KbSelfVerification = "KbSelfVerification",
  KbWriteConflict = "KbWriteConflict",
}

export type ErrorDetails = Record<
  string,
  string | boolean | number | string[] | boolean[] | number[]
>;

export interface ErrorProps {
  message: string;
  errorType?: ErrorTypes;
  details?: ErrorDetails;
  name?: string;
  code?: number;
  fault?: Fault;
  retriable?: boolean;
  reportToUser?: boolean;
}

export class BaseError extends Error {
  code: number;
  errorType?: ErrorTypes;
  fault?: Fault;
  retriable: boolean;
  reportToUser: boolean;
  details?: ErrorDetails;

  constructor(props: ErrorProps) {
    super(props.message);
    this.name = props.name ?? this.constructor.name;
    this.code = props.code ?? 500;
    this.errorType = props.errorType;
    this.fault = props.fault;
    this.retriable = props.retriable ?? true;
    this.reportToUser = props.reportToUser ?? false;
    this.details = props.details;
  }
}
