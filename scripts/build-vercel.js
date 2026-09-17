/*
 * Produces the Vercel artifact without ever committing a Supabase project URL
 * or publishable key. Both values are public browser configuration, but Vercel
 * environment variables keep each deployment tied to the owner's project.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  throw new Error('SUPABASE_URL must be a valid https://<project>.supabase.co URL.');
}
if (publishableKey.length < 20) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY is missing or invalid.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const excluded = new Set(['.git', '.github', 'dist', 'node_modules']);
for (const entry of fs.readdirSync(root)) {
  if (!excluded.has(entry)) {
    fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
  }
}

const appPath = path.join(output, 'js', 'app.js');
let app = fs.readFileSync(appPath, 'utf8');
app = app.replace('https://YOUR_PROJECT_REF.supabase.co', supabaseUrl);
app = app.replace('YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY', publishableKey);

if (
  app.includes("baseUrl || 'https://YOUR_PROJECT_REF.supabase.co'") ||
  app.includes("apiKey || 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'")
) {
  throw new Error('Supabase configuration placeholders were not replaced.');
}
fs.writeFileSync(appPath, app, 'utf8');
