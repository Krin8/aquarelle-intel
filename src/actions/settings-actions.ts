'use server';


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
