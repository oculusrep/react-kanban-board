/**
 * Prompt + output schema for "Look up in my email": read the closing signature
 * of one email and copy the sender's contact details out of it.
 *
 * Same absolute rule as the paste flow (prompt.ts): literal copies only. The
 * rule is the request; verifyDetails() is the enforcement — every field is
 * re-checked against the exact text sent here and dropped if it isn't in it.
 */

/**
 * Where signatures actually keep the firm name. Shared by both prompts. Each
 * case is still literal text, so verifyDetails() confirms it like any field.
 */
const COMPANY_RULES = `  - Look hard for company: when it is in the text it belongs on the form. It is often on the title's line ("Vice President | Acme Realty", "SVP, Acme Realty Partners") — split it out of the title. When the firm's logo is an image, the plain text shows its alt text as "[image: Acme Realty]": copy the firm name from there, but not a generic label ("[image: logo]", "[image: image001.png]").
  - Never derive company from the email domain or a website address alone.`;

export const SIGNATURE_SYSTEM_PROMPT = `You read the end of one email and copy the SENDER'S contact details out of their signature, so a contact form can be prefilled.

The text you get is only what the sender wrote: quoted replies and forwarded messages have already been removed.

THE ABSOLUTE RULE: copy ONLY what appears LITERALLY in the text. Never infer, recall or generate an email address, phone number, title, company or address — not from the person's name, not from their employer's domain, not from anything you know. If a field is not in the text, leave it out. An empty field is CORRECT. A plausible-looking wrong one is a permanent error on a real contact record.
  - Do not construct an email from a name and a company domain.
  - Do not complete a partial address, add a city you assume, or expand a state you weren't given.
  - Only the SENDER's details. If the text mentions someone else's number or address ("call Jim at …"), leave it out.
  - Phones: a number labelled mobile / cell / M: / C: goes in mobile_phone; an unlabelled, office, direct or main number goes in phone. Copy the number as written.
  - title is the job title line ("Senior Vice President"); company is the firm name.
${COMPANY_RULES}
  - Strip markup such as "<tel:…>" or "<mailto:…>" wrappers, but never change the value itself.

Every field is checked against the text after you answer and anything not found there is discarded, so guessing gains nothing.

Return JSON: {"details": {"email": "...", "phone": "...", "mobile_phone": "...", "title": "...", "company": "...", "address": "...", "city": "...", "state": "...", "zip": "..."}} — omitting every field you did not find.`;

const STRING = { type: 'string' };

export const SIGNATURE_OUTPUT_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      details: {
        type: 'object',
        properties: {
          email: STRING,
          phone: STRING,
          mobile_phone: STRING,
          title: STRING,
          company: STRING,
          address: STRING,
          city: STRING,
          state: STRING,
          zip: STRING,
        },
        additionalProperties: false,
      },
    },
    required: ['details'],
    additionalProperties: false,
  },
};

/** The single user message: who sent it, then their own text. */
export function signatureUserMessage(text: string, sender: { name: string | null; email: string }): string {
  const who = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
  return `Sender: ${who}\n\nTheir email (own text only):\n"""\n${text}\n"""`;
}

// ---------------------------------------------------------------------------
// "Paste signature" in the contact form: the user pastes a block of text; we
// don't know who it belongs to, so the model also reports the person's name
// and how many different people's signatures the text contains.
// ---------------------------------------------------------------------------

export const PASTE_SIGNATURE_SYSTEM_PROMPT = `The user pasted text into a contact form — normally one person's email signature block. Copy that person's name and contact details out of it so the form can be filled.

THE ABSOLUTE RULE: copy ONLY what appears LITERALLY in the pasted text. Never infer, recall or generate a name, email address, phone number, title, company or address — not from a domain, not from anything you know. If a field is not in the text, leave it out. An empty field is CORRECT. A plausible-looking wrong one is a permanent error on a real contact record.
  - Do not construct an email from a name and a company domain.
  - Do not complete a partial address, add a city you assume, or expand a state you weren't given.
  - name: the person's full name exactly as written (e.g. "Paul R. Rutledge"), without credentials like "CCIM".
  - Phones: a number labelled mobile / cell / M: / C: goes in mobile_phone; an unlabelled, office, direct or main number goes in phone. Copy the number as written.
  - title is the job title line; company is the firm name; address/city/state/zip are the street address lines.
${COMPANY_RULES}
  - Strip markup such as "<tel:…>" or "<mailto:…>" wrappers, but never change the value itself.

signature_count: how many DIFFERENT people's signatures or contact blocks the text contains. If it is more than 1 (a pasted thread, two people), still answer, but the form will ask the user to paste just one — do not pick one yourself.

Every field is checked against the pasted text after you answer and anything not found there is discarded, so guessing gains nothing.

Return JSON: {"signature_count": 1, "name": "...", "details": {"email": "...", "phone": "...", "mobile_phone": "...", "title": "...", "company": "...", "address": "...", "city": "...", "state": "...", "zip": "..."}} — omitting every field you did not find.`;

export const PASTE_SIGNATURE_OUTPUT_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      signature_count: { type: 'integer' },
      name: STRING,
      details: (SIGNATURE_OUTPUT_FORMAT.schema as { properties: { details: unknown } }).properties.details,
    },
    required: ['signature_count', 'details'],
    additionalProperties: false,
  },
};

export function pasteSignatureUserMessage(text: string): string {
  return `Pasted text:\n"""\n${text}\n"""`;
}
