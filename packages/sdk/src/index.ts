/**
 * Encryption interface (preparation for future E2EE)
 * 
 * Currently implements identity (passthrough) - no encryption
 * In future, will be replaced with actual encryption implementation
 */

export interface EncryptionResult {
  ciphertext: string;
  version: number;
}

export interface EncryptionService {
  /**
   * Encrypt plaintext
   * @param plaintext - text to encrypt
   * @param version - encryption algorithm version (default: 0 = identity)
   * @returns encrypted data
   */
  encrypt(plaintext: string, version?: number): EncryptionResult;

  /**
   * Decrypt ciphertext
   * @param ciphertext - encrypted text
   * @param version - encryption algorithm version
   * @returns decrypted plaintext
   */
  decrypt(ciphertext: string, version: number): string;
}

/**
 * Identity encryption service (passthrough - no actual encryption)
 * Used as placeholder until real encryption is implemented
 */
export class IdentityEncryptionService implements EncryptionService {
  encrypt(plaintext: string, version: number = 0): EncryptionResult {
    // Identity: just return plaintext as-is
    return {
      ciphertext: plaintext,
      version,
    };
  }

  decrypt(ciphertext: string, version: number): string {
    // Identity: just return ciphertext as-is
    return ciphertext;
  }
}

// Export default instance
export const encryptionService: EncryptionService = new IdentityEncryptionService();
