import { runQuiet } from './lib.mjs';

const containerName = 'stellar-punch-arena-local';

runQuiet('stellar', ['container', 'stop', containerName]);

console.log('Local Stellar container stopped when it was running.');
