import { loadConfig } from './config.js';

const config = loadConfig();
console.log(`node-agent configured for control plane at ${config.apiUrl}`);
// Enrolment and heartbeats arrive in LT-4.
