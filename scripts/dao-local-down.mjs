import { runQuiet } from './lib.mjs';

const containerName = 'stellar-stellar-dao-local';

runQuiet('docker', ['stop', containerName]);

console.log('Local Stellar container stopped when it was running.');
