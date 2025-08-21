declare module "fit-file-parser" {
  export default class FitParser {
    constructor(options?: any);
    parse(
      buffer: ArrayBuffer | Uint8Array,
      cb: (err: unknown, data: any) => void
    ): void;
  }
}
