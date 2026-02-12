declare module 'qrcode-terminal' {
  interface GenerateOptions {
    small?: boolean;
  }

  type GenerateCallback = (qrcodeText: string) => void;

  interface QRCodeTerminal {
    generate(
      qrText: string,
      options?: GenerateOptions,
      cb?: GenerateCallback
    ): void;
  }

  const qrcode: QRCodeTerminal;
  export default qrcode;
}
