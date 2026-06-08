import { describe, it, expect } from 'vitest';
import { verifyPin } from '../services/crypto';
import bcrypt from 'bcryptjs';

describe('PIN Verification Logic', () => {
  it('verifies a plain text PIN correctly (fallback for mocks)', () => {
    expect(verifyPin('1234', '1234')).toBe(true);
    expect(verifyPin('1234', 'wrong')).toBe(false);
  });

  it('verifies a bcrypt-hashed PIN correctly (main cloud workflow)', () => {
    const pin = '5678';
    const salt = bcrypt.genSaltSync(6);
    const hash = bcrypt.hashSync(pin, salt);

    expect(verifyPin(pin, hash)).toBe(true);
    expect(verifyPin('1111', hash)).toBe(false);
  });
});
