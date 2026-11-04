// "Save contact" on the /c card: a vCard 3.0 (what iOS and Android both import) built from the
// profile, so a new phone number or role reaches it without editing a second copy. vercel.json
// serves it as text/vcard, which phones open as an "add contact" sheet.
import { EXPERIENCE, PROFILE } from '../data/profile';

// vCard text values escape \ , ; ("Founding Engineer, AI Agents" would otherwise split in two).
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);

export function GET() {
  const [first, last] = PROFILE.name.en.split(' ');
  const now = EXPERIENCE[0];
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last};${first};;;`,
    `FN:${PROFILE.name.en}`,
    `ORG:${esc(now.company.replace(/\s*\(.*\)$/, ''))}`,
    `TITLE:${esc(now.role.en)}`,
    `TEL;TYPE=CELL:${PROFILE.phone.replace(/\s/g, '')}`,
    `EMAIL;TYPE=INTERNET:${PROFILE.email}`,
    'URL:https://rossev.dev/',
    `X-SOCIALPROFILE;TYPE=linkedin:${PROFILE.linkedin}`,
    'END:VCARD'
  ];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/vcard; charset=utf-8' } });
}
