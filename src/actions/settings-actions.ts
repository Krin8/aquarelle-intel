'use server';

import { cookies } from 'next/headers';

export async function setModelPreference(model: 'ollama' | 'gemini') {
  const cookieStore = await cookies();
  cookieStore.set('ai_model_preference', model, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}

export async function getModelPreference(): Promise<'ollama' | 'gemini'> {
  const cookieStore = await cookies();
  const pref = cookieStore.get('ai_model_preference')?.value;
  if (pref === 'gemini') return 'gemini';
  return 'ollama'; // Default
}

import fs from 'fs';
import path from 'path';

export async function saveApiKey(provider: string, key: string) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    const envVarName = `${provider.toUpperCase()}_API_KEY`;
    const regex = new RegExp(`^${envVarName}=.*`, 'm');
    
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${envVarName}="${key}"`);
    } else {
      envContent += `\n${envVarName}="${key}"\n`;
    }
    
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
