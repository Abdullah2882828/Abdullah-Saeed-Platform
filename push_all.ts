import { execSync } from 'child_process';
import fs from 'fs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'Abdullah2882828/Abdullah-Saeed-Platform';

if (!GITHUB_TOKEN) {
    console.error('No token found');
    process.exit(1);
}

try {
    const remoteUrl = `https://oauth2:${GITHUB_TOKEN}@github.com/${REPO}.git`;
    
    // Clear any existing git
    execSync('rm -rf .git');
    
    execSync('git init');
    execSync('git config user.name "AI Agent"');
    execSync('git config user.email "agent@aistudio.com"');
    
    execSync('git add .');
    execSync('git commit -m "Upload Abdullah Saeed Platform & TikSaver base code"');
    
    // Force push to main
    execSync(`git push -f ${remoteUrl} master:main`);
    console.log('Successfully pushed all codebase to ' + REPO);
} catch (err: any) {
    console.error('Error pushing to git:', err.message);
    if (err.stdout) console.error('stdout:', err.stdout.toString());
    if (err.stderr) console.error('stderr:', err.stderr.toString());
}
