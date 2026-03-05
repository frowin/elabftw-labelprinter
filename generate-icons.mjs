import { writeFileSync } from 'fs';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);
writeFileSync('icons/icon-48.png', png1x1);
writeFileSync('icons/icon-128.png', png1x1);
console.log('Placeholder icons created. Replace icons/icon-48.png and icons/icon-128.png with real ones.');
