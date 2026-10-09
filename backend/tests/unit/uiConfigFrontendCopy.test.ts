import fs from 'fs';
import path from 'path';

// The frontend bundles a copy of the default as its offline fallback. If the two drift, a backend
// outage would show a different UI from the seed. `cd frontend && npm run ui-config:sync` fixes it.
const backendDefault = path.join(__dirname, '../../config/ui/ui-config.default.json');
const frontendCopy = path.join(__dirname, '../../../frontend/src/lib/ui-config/ui-config.default.json');

const maybe = fs.existsSync(frontendCopy) ? it : it.skip;

describe('frontend fallback copy of the UI config default', () => {
  maybe('matches backend/config/ui/ui-config.default.json', () => {
    expect(JSON.parse(fs.readFileSync(frontendCopy, 'utf8'))).toEqual(JSON.parse(fs.readFileSync(backendDefault, 'utf8')));
  });
});
