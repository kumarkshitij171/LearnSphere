import dotenv from 'dotenv';
dotenv.config();

import { publishCheckedInDefault } from '../services/uiConfig.service';

// Publishes config/ui/ui-config.default.json as the next version of the live UI config.
const message = process.argv.slice(2).join(' ') || 'Published the checked-in default';

publishCheckedInDefault(message)
  .then(({ version, unchanged }) => {
    console.log(unchanged ? `v${version} already matches the default; nothing published.` : `Published v${version}: ${message}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Publish failed:', error?.problems ?? error);
    process.exit(1);
  });
