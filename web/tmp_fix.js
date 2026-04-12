const { execSync } = require('child_process');

const siteId = 'jh79vq3yqkcsk84fbefanb0b8584et0r';
const orgId = 'jx796hch8ynwtjn0x3jcyrj5xx84ffzf';

const payload = JSON.stringify({ siteId, orgId });
const command = `npx convex run fixData:fixSiteOrg '${payload}'`;

console.log(`Executing: ${command}`);
try {
  const output = execSync(command, { encoding: 'utf-8' });
  console.log(output);
} catch (error) {
  console.error(error.stdout || error.message);
}
