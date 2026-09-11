declare module "nodemailer" {
  const nodemailer: {
    createTransport(options: Record<string, unknown>): {
      verify(): Promise<unknown>;
      sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }>;
    };
  };
  export default nodemailer;
}

declare module "mailparser" {
  export interface AddressObject {
    value?: Array<{ address?: string; name?: string }>;
  }

  export interface ParsedMail {
    from?: AddressObject | AddressObject[];
    to?: AddressObject | AddressObject[];
    subject?: string;
    text?: string;
    html?: string | false;
    date?: Date;
    messageId?: string;
    inReplyTo?: string;
    references?: string[] | string;
    headers: Map<string, unknown>;
  }

  export function simpleParser(source: Buffer | string): Promise<ParsedMail>;
}
