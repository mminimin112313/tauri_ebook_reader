import assert from 'node:assert/strict';
import { formatGrantedAccess } from './libraryAccess.mjs';

assert.equal(formatGrantedAccess({ granted_roots: [] }), 'No folder access');
assert.equal(formatGrantedAccess({ granted_roots: ['/Books'] }), '1 folder allowed');
assert.equal(formatGrantedAccess({ granted_roots: ['/Books', '/Papers'] }), '2 folders allowed');
