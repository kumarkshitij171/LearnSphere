import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { getPublished, DEFAULT_PATH } from '../services/uiConfig.service';

// Writes the live published UI config over config/ui/ui-config.default.json, so the checked-in
// seed can be refreshed through an ordinary pull request. Never run by the server itself.
const main = async () => {
  const published = await getPublished();
  if (published.fallback) {
    console.error('Nothing valid is published in the database; refusing to overwrite the default.');
    process.exit(1);
  }
  fs.writeFileSync(DEFAULT_PATH, `${JSON.stringify(published.config, null, 2)}\n`);
  console.log(`Exported v${published.version} (${published.checksum.slice(0, 12)}) to ${DEFAULT_PATH}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});
