import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidVaultPublic,
  isValidWrappedKey,
  MAX_VAULT_FIELD_LEN,
  type RotatePassphraseDto,
  type VaultPublicDto,
  type WrappedKeyDto,
} from './vault.dto';

/**
 * UserVault service — accepts opaque ciphertext / wrapping material from
 * the client and persists it under the user's row. Never derives keys,
 * never decrypts, never logs payload contents.
 *
 * Setup is one-shot per user. Subsequent setups throw 409 to prevent
 * accidental key replacement (which would lock the user out of every
 * resume they've already encrypted). The rotation path is a separate
 * endpoint that only touches the passphrase wrapping.
 */
@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<VaultPublicDto | null> {
    const row = await this.prisma.userVault.findUnique({ where: { userId } });
    if (!row) return null;
    return rowToDto(row);
  }

  async setup(userId: string, payload: unknown): Promise<VaultPublicDto> {
    if (!isValidVaultPublic(payload)) {
      throw new BadRequestException('Invalid vault payload');
    }
    const existing = await this.prisma.userVault.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('Vault already exists — replacing it would lock you out of every encrypted resume.');
    }
    const created = await this.prisma.userVault.create({
      data: {
        userId,
        schemaVersion: payload.schemaVersion,
        kdfParams: payload.kdfParams as unknown as Prisma.InputJsonValue,
        passphraseSalt: payload.passphraseSalt,
        recoverySalt: payload.recoverySalt,
        passphraseWrap: payload.passphraseWrap as unknown as Prisma.InputJsonValue,
        recoveryWrap: payload.recoveryWrap as unknown as Prisma.InputJsonValue,
      },
    });
    return rowToDto(created);
  }

  async rotatePassphrase(userId: string, payload: unknown): Promise<VaultPublicDto> {
    if (!isValidRotatePayload(payload)) {
      throw new BadRequestException('Invalid rotation payload');
    }
    const existing = await this.prisma.userVault.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Vault not found — run setup first.');
    const updated = await this.prisma.userVault.update({
      where: { userId },
      data: {
        passphraseSalt: payload.passphraseSalt,
        passphraseWrap: payload.passphraseWrap as unknown as Prisma.InputJsonValue,
      },
    });
    return rowToDto(updated);
  }

  /**
   * Hard delete the vault and ALL encrypted resume payloads. Used for
   * right-to-be-forgotten and account wipe. Plaintext columns (if any
   * are still populated from pre-Phase-7 data) are also cleared.
   */
  async destroy(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userVault.deleteMany({ where: { userId } }),
      this.prisma.resume.deleteMany({ where: { userId } }),
    ]);
  }
}

function isValidRotatePayload(value: unknown): value is RotatePassphraseDto {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.passphraseSalt === 'string' &&
    v.passphraseSalt.length > 0 &&
    v.passphraseSalt.length <= MAX_VAULT_FIELD_LEN &&
    isValidWrappedKey(v.passphraseWrap)
  );
}

function rowToDto(row: {
  schemaVersion: number;
  kdfParams: unknown;
  passphraseSalt: string;
  recoverySalt: string;
  passphraseWrap: unknown;
  recoveryWrap: unknown;
}): VaultPublicDto {
  return {
    schemaVersion: row.schemaVersion as 1,
    kdfParams: row.kdfParams as VaultPublicDto['kdfParams'],
    passphraseSalt: row.passphraseSalt,
    recoverySalt: row.recoverySalt,
    passphraseWrap: row.passphraseWrap as WrappedKeyDto,
    recoveryWrap: row.recoveryWrap as WrappedKeyDto,
  };
}
