import { BaseError, ErrorTypes, Fault } from "../../errors.js";

/** `match` invoked with no diff it could read, or one it could not parse. */
export class KbMatchInputError extends BaseError {
  constructor(readonly reason: string) {
    super({
      message: `match: ${reason}`,
      errorType: ErrorTypes.KbMatchInput,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { reason },
    });
  }
}
