import { mkdirSync } from 'fs';
try {
  mkdirSync('public', { recursive: true });
  console.log('✅ Public directory created');
} catch (e) {
  // Directory might already exist, that's fine
  console.log('Public directory check completed');
}

