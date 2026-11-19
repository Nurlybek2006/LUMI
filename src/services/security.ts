import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

const SALT_KEY = 'lumi.pin.salt';
const HASH_KEY = 'lumi.pin.hash';
const FAILURES_KEY = 'lumi.pin.failures';
const LOCKOUT_KEY = 'lumi.pin.lockout-until';
const BIO_KEY = 'lumi.biometric.enabled';

export async function hasPin(): Promise<boolean> { return (await SecureStore.getItemAsync(HASH_KEY)) !== null; }
export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/u.test(pin)) throw new Error('PIN төрттен сегізге дейін сан болуы керек.');
  const salt = Crypto.randomUUID();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(HASH_KEY, hash);
  await SecureStore.setItemAsync(FAILURES_KEY, '0');
  await SecureStore.setItemAsync(BIO_KEY, 'false');
}
export async function removePin(): Promise<void> {
  await Promise.all([SALT_KEY, HASH_KEY, FAILURES_KEY, LOCKOUT_KEY, BIO_KEY].map((key) => SecureStore.deleteItemAsync(key)));
}
export async function verifyPin(pin: string): Promise<{ valid: boolean; waitSeconds: number }> {
  const lockUntil = Number(await SecureStore.getItemAsync(LOCKOUT_KEY) ?? 0);
  const waitSeconds = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
  if (waitSeconds > 0) return { valid: false, waitSeconds };
  const [salt, expected] = await Promise.all([SecureStore.getItemAsync(SALT_KEY), SecureStore.getItemAsync(HASH_KEY)]);
  if (!salt || !expected) return { valid: true, waitSeconds: 0 };
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  if (actual === expected) {
    await SecureStore.setItemAsync(FAILURES_KEY, '0');
    return { valid: true, waitSeconds: 0 };
  }
  const failures = Number(await SecureStore.getItemAsync(FAILURES_KEY) ?? 0) + 1;
  await SecureStore.setItemAsync(FAILURES_KEY, String(failures));
  if (failures >= 5) {
    const seconds = Math.min(300, 30 * 2 ** Math.min(failures - 5, 3));
    await SecureStore.setItemAsync(LOCKOUT_KEY, String(Date.now() + seconds * 1000));
    return { valid: false, waitSeconds: seconds };
  }
  return { valid: false, waitSeconds: 0 };
}
export async function setBiometricEnabled(enabled: boolean): Promise<void> { await SecureStore.setItemAsync(BIO_KEY, String(enabled)); }
export async function biometricEnabled(): Promise<boolean> { return (await SecureStore.getItemAsync(BIO_KEY)) === 'true'; }
export async function authenticateBiometric(): Promise<boolean> {
  const available = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!available || !enrolled) return false;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'LUMI-ді ашу', cancelLabel: 'Болдырмау', biometricsSecurityLevel: 'strong' });
  return result.success;
}
