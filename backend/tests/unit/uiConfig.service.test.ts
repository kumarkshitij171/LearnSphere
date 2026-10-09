import { PrismaClient } from '@prisma/client';
import { ensureUiConfigSeeded } from '../../services/uiConfig.service';

const prisma: any = new PrismaClient();

describe('ensureUiConfigSeeded', () => {
  it('creates v1 from the checked-in default on an empty database', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([]);
    expect(await ensureUiConfigSeeded()).toBe(true);
    expect(prisma.uiConfigVersion.create.mock.calls[0][0].data).toMatchObject({
      version: 1,
      message: 'seeded from config/ui/ui-config.default.json',
    });
    expect(prisma.uiConfigState.create).toHaveBeenCalledWith({ data: { id: 'ui', publishedVersion: 1 } });
  });

  it('does nothing when a config already exists', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 7 });
    expect(await ensureUiConfigSeeded()).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats another replica seeding first as success', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    expect(await ensureUiConfigSeeded()).toBe(false);
  });
});
