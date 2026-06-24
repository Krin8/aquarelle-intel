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
