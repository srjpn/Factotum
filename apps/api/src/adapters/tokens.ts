import { generateSecret, hashSecret } from '../secrets.js';

export const generateToken = (): string => generateSecret('facto_adp');
export const hashToken = hashSecret;
