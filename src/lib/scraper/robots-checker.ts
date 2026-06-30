export async function checkRobotsTxt(url: string): Promise<{
  allowed: boolean;
  robotsTxtFound: boolean;
  disallowedPaths: string[];
}> {
  try {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'AquarelleIntel/1.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // No robots.txt = allowed
      return { allowed: true, robotsTxtFound: false, disallowedPaths: [] };
    }

    const text = await response.text();
    const lines = text.split('\n');
    
    let isRelevantAgent = false;
    const disallowedPaths: string[] = [];
    const pathname = parsedUrl.pathname;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.replace('user-agent:', '').trim();
        isRelevantAgent = agent === '*' || agent.includes('aquarelleintel');
      }
      
      if (isRelevantAgent && trimmed.startsWith('disallow:')) {
        const path = trimmed.replace('disallow:', '').trim();
        if (path) {
          disallowedPaths.push(path);
        }
      }
    }

    const allowed = !disallowedPaths.some(disallowed => {
      if (disallowed === '/') return true;
      return pathname.startsWith(disallowed);
    });

    return { allowed, robotsTxtFound: true, disallowedPaths };
  } catch {
    // If we can't check, assume allowed
    return { allowed: true, robotsTxtFound: false, disallowedPaths: [] };
  }
}
