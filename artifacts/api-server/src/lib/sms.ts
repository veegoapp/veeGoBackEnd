import crypto from "crypto";
import { logger } from "./logger";

export type SmsProvider = "console" | "twilio";

function getProvider(): SmsProvider {
  const p = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  if (p === "twilio") return "twilio";
  return "console";
}

async function sendViaTwilio(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Twilio SMS failed: ${err}`);
  }
}

export async function sendSms(to: string, body: string): Promise<void> {
  const provider = getProvider();

  if (provider === "twilio") {
    await sendViaTwilio(to, body);
    logger.info({ to, provider: "twilio" }, "SMS sent");
    return;
  }

  logger.info({ to, body, provider: "console" }, "[SMS CONSOLE] Would send SMS");
  console.log(`\n📱 SMS to ${to}: ${body}\n`);
}

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}
