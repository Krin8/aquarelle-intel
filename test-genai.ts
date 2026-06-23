import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Give me a json with { "status": "ok" }',
      config: {
        systemInstruction: 'You are a helpful JSON bot.',
        responseMimeType: 'application/json',
      }
    });
    console.log(response.text);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

main();
