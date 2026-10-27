import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { CatalogImportService } from '../catalog-import.service';
import {
  candidateFingerprint,
  CatalogCandidatesService,
} from './catalog-candidates.service';

const payload = {
  slug: 'bodega-x-cata',
  name: 'Cata en Bodega X',
  description: 'Degustación guiada de tres vinos de la casa.',
  durationMinutes: 60,
  type: 'tasting',
  categories: ['Wine tourism'],
  places: ['bodega-x'],
  price: {
    kind: 'UNKNOWN',
    min: null,
    max: null,
    unit: null,
    source: null,
    sourceRef: null,
    verifiedAt: null,
  },
  verifiedAt: null,
  occasions: ['romantic', 'friends'],
};

describe('CatalogCandidatesService', () => {
  const candidate = (status = 'pending') => ({
    id: 5,
    entityType: 'activity',
    status,
    idPlace: 9,
    payload: { ...payload },
    originalPayload: { ...payload },
    notes: [] as string[],
    sourceRefs: [],
  });
  const manager = {
    findOne: jest.fn(),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
    manager,
  };
  const importer = { import: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new CatalogCandidatesService(
    dataSource as unknown as DataSource,
    importer as unknown as CatalogImportService,
    audit as unknown as AuditService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('fingerprints by type, place and normalised name', () => {
    expect(
      candidateFingerprint('activity', 'bodega-x', 'Cata en Bodega X'),
    ).toBe(candidateFingerprint('activity', 'bodega-x', 'cata  bodega x'));
    expect(
      candidateFingerprint('activity', 'bodega-y', 'Cata en Bodega X'),
    ).not.toBe(
      candidateFingerprint('activity', 'bodega-x', 'Cata en Bodega X'),
    );
  });

  it('approves through the catalog import and records who did it', async () => {
    const pending = candidate();
    manager.findOne
      .mockResolvedValueOnce(pending) // locked candidate
      .mockResolvedValueOnce(null) // its place
      .mockResolvedValueOnce({ id: 77 }); // the activity created
    importer.import.mockResolvedValue({
      records: [
        { type: 'activity', slug: payload.slug, status: 'new', notes: [] },
      ],
    });

    await expect(service.approve(5, 1)).resolves.toEqual({
      id: 5,
      appliedEntityId: 77,
    });
    expect(importer.import).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'catalog-candidate',
        activities: [expect.objectContaining({ slug: payload.slug })],
      }),
      { acceptDuplicates: false },
    );
    expect(pending).toMatchObject({
      status: 'approved',
      reviewedBy: 1,
      appliedEntityId: 77,
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('answers 409 on a possible duplicate and keeps the candidate pending', async () => {
    const pending = candidate();
    manager.findOne.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    importer.import.mockResolvedValue({
      records: [
        {
          type: 'activity',
          slug: payload.slug,
          status: 'needs_review',
          notes: ['possible_duplicate_of:bodega-x-degustacion'],
        },
      ],
    });

    await expect(service.approve(5, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(pending.status).toBe('pending');
    expect(pending.notes).toContain(
      'possible_duplicate_of:bodega-x-degustacion',
    );
  });

  it('never approves twice', async () => {
    manager.findOne
      .mockResolvedValueOnce(candidate('approved'))
      .mockResolvedValueOnce(null);
    await expect(service.approve(5, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('reports package validation errors on the field to fix', async () => {
    manager.findOne
      .mockResolvedValueOnce(candidate())
      .mockResolvedValueOnce(null);
    const error = await service
      .update(5, { occasions: [], durationMinutes: 0 }, 1)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'durationMinutes', messages: ['invalid_duration'] }],
    });
  });

  it('changes only the fields sent, even when the DTO lists them all', async () => {
    const pending = candidate();
    manager.findOne.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    jest
      .spyOn(service, 'detail')
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof service.detail>>);
    await service.update(
      5,
      { name: undefined, occasions: ['romantic', 'quiet', 'special'] },
      1,
    );
    expect(pending.payload).toMatchObject({
      name: payload.name,
      occasions: ['quiet', 'romantic', 'special'],
    });
  });

  it('requires pending to discard and keeps the reason', async () => {
    const pending = candidate();
    manager.findOne.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    await service.discard(5, 'No es una actividad real del lugar', 1);
    expect(pending).toMatchObject({
      status: 'discarded',
      discardReason: 'No es una actividad real del lugar',
    });
  });
});
