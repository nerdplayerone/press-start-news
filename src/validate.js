// Card schema validation (ajv) with two custom keywords: maxWords, isoDate.
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema/card.schema.json', import.meta.url)), 'utf8'));

export const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

const ajv = new Ajv({ allErrors: true });
ajv.addKeyword({ keyword: 'maxWords', type: 'string', schemaType: 'number', validate: (max, data) => countWords(data) <= max });
ajv.addKeyword({ keyword: 'isoDate', type: 'string', validate: (on, data) => !on || (/^\d{4}-\d{2}-\d{2}T/.test(data) && Number.isFinite(Date.parse(data))) });

const check = ajv.compile(schema);

/** @returns {{ ok: boolean, errors: string[] }} */
export function validateCard(card) {
  const ok = check(card);
  return { ok, errors: ok ? [] : check.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
}
