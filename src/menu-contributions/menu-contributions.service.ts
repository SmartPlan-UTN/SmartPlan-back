import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { PlaceSource } from '../knowledge/entities/place-source.entity';
import { CreateMenuContributionDto } from './dto/create-menu-contribution.dto';
import { ReviewMenuContributionDto } from './dto/review-menu-contribution.dto';
import { PlaceMenuContribution } from './entities/place-menu-contribution.entity';

/** Pending contributions one account may keep in the admin queue. */
export const MAX_PENDING_MENU_CONTRIBUTIONS = 10;

@Injectable()
export class MenuContributionsService {
  constructor(
    @InjectRepository(PlaceMenuContribution)
    private readonly contributions: Repository<PlaceMenuContribution>,
    @InjectRepository(Place) private readonly places: Repository<Place>,
    @InjectRepository(PlaceSource)
    private readonly sources: Repository<PlaceSource>,
  ) {}

  async submit(
    idUser: number,
    idPlace: number,
    dto: CreateMenuContributionDto,
  ) {
    if (!dto.sourceUrl && !dto.menuText?.trim())
      throw new BadRequestException('A menu link or menu text is required.');
    const place = await this.places.findOne({
      where: { id: idPlace },
    });
    if (!place) throw new NotFoundException('Place not found.');
    const pending = await this.contributions.count({
      where: { idUser, status: 'pending' },
    });
    if (pending >= MAX_PENDING_MENU_CONTRIBUTIONS)
      throw new HttpException(
        {
          code: 'MENU_CONTRIBUTION_LIMIT',
          message:
            'Ya tenés varias cartas esperando revisión. Podés enviar otra cuando revisemos alguna.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const contribution = this.contributions.create({
      idPlace,
      idUser,
      sourceUrl: dto.sourceUrl?.trim() ?? null,
      menuText: dto.menuText?.trim() ?? null,
      status: 'pending',
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
    });
    return this.toResponse(await this.contributions.save(contribution));
  }

  async mine(idUser: number) {
    const rows = await this.contributions.find({
      where: { idUser },
      relations: { place: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listPending() {
    const rows = await this.contributions.find({
      where: { status: 'pending' },
      relations: { place: true, user: true },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return rows.map((row) => ({
      ...this.toResponse(row),
      contributor: `${row.user.name} ${row.user.lastName}`,
    }));
  }

  async review(idAdmin: number, id: number, dto: ReviewMenuContributionDto) {
    const row = await this.contributions.findOne({
      where: { id, status: 'pending' },
      relations: { place: true },
    });
    if (!row)
      throw new NotFoundException('Pending menu contribution not found.');
    const reviewSource = dto.sourceUrl?.trim() || row.sourceUrl;
    if (dto.decision === 'accepted' && !reviewSource)
      throw new BadRequestException(
        'A verified public menu URL is required to accept this contribution.',
      );
    if (dto.decision === 'accepted') row.sourceUrl = reviewSource;
    row.status = dto.decision;
    row.reviewNote = dto.note?.trim() || null;
    row.reviewedBy = idAdmin;
    row.reviewedAt = new Date();
    const saved = await this.contributions.save(row);
    // Accepted links enter the guarded acquisition pipeline as candidates.
    // The crawler must still prove branch identity and freshness before any
    // prices can become planner evidence.
    if (dto.decision === 'accepted' && row.sourceUrl) {
      await this.sources
        .createQueryBuilder()
        .insert()
        .values({
          idPlace: row.idPlace,
          kind: 'MENU_PAGE',
          url: row.sourceUrl,
          discoveredVia: 'CURATOR',
          identityStatus: 'CANDIDATE',
          identitySignals: ['user_contribution_admin_reviewed'],
        })
        .orIgnore()
        .execute();
    }
    return this.toResponse(saved);
  }

  private toResponse(row: PlaceMenuContribution) {
    return {
      id: row.id,
      placeId: row.idPlace,
      placeName: row.place?.name,
      sourceUrl: row.sourceUrl,
      menuText: row.menuText,
      status: row.status,
      reviewNote: row.reviewNote,
      submittedAt: row.createdAt,
      reviewedAt: row.reviewedAt,
    };
  }
}
