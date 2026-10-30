import { hash, argon2id } from 'argon2';
import { DataSource, EntityManager, In } from 'typeorm';
import { ARGON2_OPCIONES } from '../../auth/auth.constants';
import { ContentStatus } from '../../common/moderation/content-status';
import { Feedback } from '../../recommendation/entities/feedback.entity';
import { FeedbackStatus } from '../../recommendation/entities/feedback-status.entity';
import { CommunityExperienceLike } from '../../plans/entities/community-experience-like.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { PlanStatus } from '../../plans/entities/plan-status.entity';
import {
  Plan,
  PlanKind,
  PlanVisibility,
} from '../../plans/entities/plan.entity';
import { Role } from '../../users/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/entities/user-status.entity';

export const COMMUNITY_DEMO_PASSWORD = 'SmartPlanDemo2026!';
const DEMO_EMAIL_DOMAIN = 'smartplan.invalid';
const STANDARD_REVIEWS_PER_PLAN = 6;
const FIRST_PLAN_REVIEW_COUNT = 20;

const PEOPLE = [
  ['alma', 'Alma'],
  ['ines', 'Inés'],
  ['julian', 'Julián'],
  ['camila', 'Camila'],
  ['tomas', 'Tomás'],
  ['mora', 'Mora'],
  ['simon', 'Simón'],
  ['emilia', 'Emilia'],
  ['leon', 'León'],
  ['juana', 'Juana'],
  ['bruno', 'Bruno'],
  ['pilar', 'Pilar'],
  ['facundo', 'Facundo'],
  ['sofia', 'Sofía'],
  ['benjamin', 'Benjamín'],
  ['olivia', 'Olivia'],
  ['dante', 'Dante'],
  ['abril', 'Abril'],
  ['vicente', 'Vicente'],
  ['clara', 'Clara'],
  ['mateo', 'Mateo'],
  ['renata', 'Renata'],
  ['thiago', 'Thiago'],
  ['luna', 'Luna'],
] as const;

const PLAN_STORIES = [
  [
    'Paseo de tarde por el Parque',
    'Una vuelta a pie, una pausa con algo rico y tiempo para mirar alrededor.',
  ],
  [
    'Museos y café en el centro',
    'Un recorrido cultural que deja lugar para sentarse y conversar.',
  ],
  [
    'Mendoza sin apuro: plazas y helado',
    'Un plan simple para caminar, probar algo dulce y disfrutar el centro.',
  ],
  [
    'Una mañana entre árboles y café',
    'Verde, aire fresco y una mesa tranquila para cerrar la salida.',
  ],
  [
    'Un paseo corto para cortar la semana',
    'Una escapada cerca, fácil de adaptar y sin demasiadas vueltas.',
  ],
  [
    'Tarde de historia mendocina',
    'Calles, historias y una pausa para descubrir algo nuevo.',
  ],
  [
    'Caminata y merienda con amigos',
    'Un recorrido liviano para compartir sin mirar el reloj.',
  ],
  [
    'Plazas, fotos y algo rico',
    'Un plan urbano con paradas breves y buenos rincones para guardar.',
  ],
  [
    'Domingo de paseo por la ciudad',
    'Una salida flexible para disfrutar a tu ritmo.',
  ],
  [
    'Un recorrido para hacer en bici',
    'Mismos lugares, otra manera de conocerlos y moverse.',
  ],
  [
    'Café, museo y charla larga',
    'Una combinación serena para quienes disfrutan los detalles.',
  ],
  [
    'La ciudad después del almuerzo',
    'Un paseo de tarde con espacio para improvisar.',
  ],
  [
    'Una salida tranquila en pareja',
    'Un recorrido sencillo, con tiempo para parar cuando pinte.',
  ],
  [
    'Pasear por el centro y merendar',
    'Lugares conocidos y una pausa que se convierte en el mejor momento.',
  ],
  [
    'Un plan cultural para días frescos',
    'Interiores, caminata corta y una merienda cerca.',
  ],
  [
    'Descubrir Mendoza a pie',
    'Una ruta amable para volver a mirar la ciudad con otros ojos.',
  ],
  [
    'Tarde de parque y museo',
    'Un poco de aire libre y un lugar interesante para conocer.',
  ],
  [
    'Un paseo accesible para todos',
    'Paradas cercanas y ritmo flexible para compartir en grupo.',
  ],
  [
    'Pequeñas paradas por el centro',
    'Un itinerario breve que se disfruta sin apurarse.',
  ],
  ['Una vuelta al aire libre', 'Verde, caminata y una pausa para tomar algo.'],
  [
    'Plan espontáneo para dos',
    'Una idea fácil de guardar y adaptar a cualquier tarde.',
  ],
  [
    'Paseo de sábado con amigos',
    'Caminar, charlar y elegir sobre la marcha dónde parar.',
  ],
  [
    'Cultura y sobremesa mendocina',
    'Un plan para quienes prefieren las experiencias que se alargan.',
  ],
  [
    'Una tarde para volver a salir',
    'Una ruta conocida con espacio para hacerla propia.',
  ],
] as const;

const REVIEW_TEXTS = [
  'Lo hicimos con tiempo y se disfrutó muchísimo. Volvería a elegirlo.',
  'Muy buen plan para compartir; las paradas quedan cómodas entre sí.',
  'Nos gustó que se pudiera adaptar sobre la marcha. La tarde rindió un montón.',
  'Una salida simple que terminó siendo uno de los mejores momentos de la semana.',
  'Fui con amigos y todos encontramos algo que nos gustó.',
  'El recorrido funciona muy bien. Recomiendo dejar un rato extra para la pausa.',
  'Lo guardé para repetirlo con otra compañía. Tiene un ritmo muy lindo.',
  'Plan tranquilo, fácil de organizar y con buenos lugares para conversar.',
  'Nos sorprendió para bien. La combinación de paradas tiene sentido.',
  'Ideal para salir sin armar algo complicado y pasarla bien igual.',
  'Una experiencia muy linda; el tiempo estimado estuvo bastante cerca.',
  'Lo hicimos a nuestro ritmo y fue exactamente lo que necesitábamos.',
  'Buena idea para conocer más la zona sin correr de un lado a otro.',
  'Me gustó especialmente la última parada. La sumaría de nuevo.',
  'Recomendable para una tarde relajada; volvería con mi familia.',
  'El plan nos dio una buena base y después agregamos una parada propia.',
  'Todo quedó cerca y pudimos disfrutar cada lugar con calma.',
  'Una salida agradable, sin sorpresas y con tiempo para disfrutar.',
  'Nos llevamos fotos lindas y ganas de hacer otra versión del recorrido.',
  'Gran plan para un día común que terminó siendo especial.',
  'La pasamos bien, aunque conviene revisar horarios antes de salir.',
  'Está bueno para ir en grupo: cada quien pudo disfrutar a su manera.',
  'La propuesta es clara y el recorrido se siente natural.',
  'Una opción muy linda para guardar y recomendar.',
] as const;

const TAGS = [
  ['would_recommend'],
  ['great_value', 'would_recommend'],
  ['far'],
  ['too_expensive'],
  ['great_value'],
  ['would_recommend'],
] as const;

interface DemoProfile {
  slug: (typeof PEOPLE)[number][0];
  name: (typeof PEOPLE)[number][1];
  email: string;
  username: string;
  bio: string;
  entity: User;
}

/**
 * Idempotently creates a large, clearly labelled local Community dataset:
 * 24 public plans, 158 consented experiences, and real like rows.
 */
export async function seedCommunityDemo(dataSource: DataSource): Promise<{
  profiles: number;
  plans: number;
  experiences: number;
  likes: number;
}> {
  const passwordHash = await hash(COMMUNITY_DEMO_PASSWORD, {
    type: argon2id,
    ...ARGON2_OPCIONES,
  });

  return dataSource.transaction(async (manager) => {
    const userRole = await manager.getRepository(Role).findOneByOrFail({
      key: 'user',
    });
    const activeUserStatus = await manager
      .getRepository(UserStatus)
      .findOneByOrFail({ key: 'active' });
    const confirmedPlanStatus = await manager
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'confirmed' });
    const completedPlanStatus = await manager
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'completed' });
    const pendingFeedbackStatus = await manager
      .getRepository(FeedbackStatus)
      .findOneByOrFail({ key: 'pending' });

    const templates = await findPublicTemplates(manager);
    if (templates.length === 0) {
      throw new Error(
        'No hay planes públicos con paradas para usar como base. Cargá el catálogo y publicá al menos un plan primero.',
      );
    }

    const profiles: DemoProfile[] = [];
    for (const [index, [slug, name]] of PEOPLE.entries()) {
      const email = `demo.${String(index + 1).padStart(2, '0')}@${DEMO_EMAIL_DOMAIN}`;
      const username = `demo_${slug}_mza`;
      const bio = `Perfil de demostración · ${name} comparte ideas y salidas de prueba en Mendoza.`;
      const repository = manager.getRepository(User);
      const profile = await repository.findOne({ where: { email } });
      const saved = await repository.save(
        repository.create({
          ...(profile ?? {}),
          name,
          lastName: 'Demo',
          username,
          bio,
          email,
          phone: null,
          passwordHash,
          idRole: userRole.id,
          idUserStatus: activeUserStatus.id,
          emailRemindersEnabled: false,
        }),
      );
      profiles.push({ slug, name, email, username, bio, entity: saved });
    }

    const plans: Plan[] = [];
    const planRepository = manager.getRepository(Plan);
    const planDetailRepository = manager.getRepository(PlanDetail);
    for (const [index, [title, description]] of PLAN_STORIES.entries()) {
      const author = profiles[index % profiles.length].entity;
      const template = templates[index % templates.length];
      const planTitle = `Demo · ${title}`;
      let plan = await planRepository.findOne({
        where: { idUser: author.id, title: planTitle },
      });
      const details = [...(template.details ?? [])].sort(
        (left, right) => left.order - right.order,
      );
      const estimatedTotalDuration = details.reduce(
        (total, detail) => total + detail.estimatedDuration,
        0,
      );
      plan = await planRepository.save(
        planRepository.create({
          ...(plan ?? {}),
          title: planTitle,
          description,
          idUser: author.id,
          idPlanRequest: null,
          kind: PlanKind.Authored,
          idSourcePlan: null,
          idInspiredByPlan: template.id,
          idPlanStatus: confirmedPlanStatus.id,
          estimatedTotalCost: template.estimatedTotalCost,
          estimatedTotalCostMax: template.estimatedTotalCostMax,
          unpricedCount: template.unpricedCount,
          priceCompleteness: template.priceCompleteness,
          estimatedTotalDuration,
          peopleCount: 2 + (index % 5),
          completedAt: null,
          feedbackRequestedAt: null,
          travelDistanceMeters: template.travelDistanceMeters,
          travelDurationSeconds: template.travelDurationSeconds,
          startsAt: null,
          rankingMeta: null,
          visibility: PlanVisibility.Public,
          communityStatus: ContentStatus.Published,
          composerRequestId: null,
          composerUpdateRequestId: null,
          composerUpdateRequestHash: null,
        }),
      );
      plans.push(plan);

      const existingDetails = await planDetailRepository.find({
        where: { idPlan: plan.id },
      });
      if (existingDetails.length === 0) {
        await planDetailRepository.save(
          details.map((detail, detailIndex) =>
            planDetailRepository.create({
              idPlan: plan.id,
              idActivity: detail.idActivity,
              idPlace: detail.idPlace,
              action: detail.action,
              startMinute: detail.startMinute,
              legTravelMinutes: detail.legTravelMinutes,
              legDistanceMeters: detail.legDistanceMeters,
              estimateBasis: detail.estimateBasis,
              order: detailIndex + 1,
              estimatedCost: detail.estimatedCost,
              priceKind: detail.priceKind,
              priceMin: detail.priceMin,
              priceMax: detail.priceMax,
              priceUnit: detail.priceUnit,
              priceCurrency: detail.priceCurrency,
              priceSource: detail.priceSource,
              priceSourceRef: detail.priceSourceRef,
              priceVerifiedAt: detail.priceVerifiedAt,
              priceSnapshotAt: detail.priceSnapshotAt,
              perPersonCost: detail.perPersonCost,
              estimatedDuration: detail.estimatedDuration,
              note: detail.note,
              preparationConfirmedAt: null,
            }),
          ),
        );
      }
    }

    const feedbackRepository = manager.getRepository(Feedback);
    const outingRepository = planRepository;
    const likeRows: Array<{ idFeedback: number; idUser: number }> = [];
    const expectedOutingIds = new Set<number>();
    let experiences = 0;
    const now = Date.now();

    for (const [planIndex, sourcePlan] of plans.entries()) {
      const ownerIndex = planIndex % profiles.length;
      const owner = profiles[ownerIndex].entity;
      const reviewers = profiles.filter((_, index) => index !== ownerIndex);
      const reviewCount =
        planIndex === 0 ? FIRST_PLAN_REVIEW_COUNT : STANDARD_REVIEWS_PER_PLAN;

      for (let reviewIndex = 0; reviewIndex < reviewCount; reviewIndex += 1) {
        const reviewer =
          reviewers[(planIndex * 5 + reviewIndex) % reviewers.length].entity;
        const reviewerIndex = profiles.findIndex(
          (profile) => profile.entity.id === reviewer.id,
        );
        const daysAgo = (planIndex * 7 + reviewIndex * 4) % 180;
        const completedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
        let outing = await outingRepository.findOne({
          where: {
            idUser: reviewer.id,
            idSourcePlan: sourcePlan.id,
            kind: PlanKind.Outing,
          },
        });
        outing = await outingRepository.save(
          outingRepository.create({
            ...(outing ?? {}),
            title: sourcePlan.title,
            description: sourcePlan.description,
            idUser: reviewer.id,
            idPlanRequest: null,
            kind: PlanKind.Outing,
            idSourcePlan: sourcePlan.id,
            idInspiredByPlan: null,
            idPlanStatus: completedPlanStatus.id,
            estimatedTotalCost: sourcePlan.estimatedTotalCost,
            estimatedTotalCostMax: sourcePlan.estimatedTotalCostMax,
            unpricedCount: sourcePlan.unpricedCount,
            priceCompleteness: sourcePlan.priceCompleteness,
            estimatedTotalDuration: sourcePlan.estimatedTotalDuration,
            peopleCount: 1 + ((reviewIndex + planIndex) % 5),
            completedAt,
            feedbackRequestedAt: completedAt,
            travelDistanceMeters: sourcePlan.travelDistanceMeters,
            travelDurationSeconds: sourcePlan.travelDurationSeconds,
            startsAt: null,
            rankingMeta: null,
            visibility: PlanVisibility.Private,
            communityStatus: ContentStatus.Published,
            composerRequestId: null,
            composerUpdateRequestId: null,
            composerUpdateRequestHash: null,
          }),
        );
        expectedOutingIds.add(outing.id);

        const rating = planIndex === 0 ? 5 : ratingFor(planIndex, reviewIndex);
        const comment =
          REVIEW_TEXTS[(planIndex + reviewIndex) % REVIEW_TEXTS.length];
        const feedback = await feedbackRepository.findOne({
          where: { idPlan: outing.id },
        });
        const savedFeedback = await feedbackRepository.save(
          feedbackRepository.create({
            ...(feedback ?? {}),
            rating,
            tags: [...TAGS[(planIndex + reviewIndex) % TAGS.length]],
            comment,
            actualCost: null,
            actualPartySize: null,
            actualDuration: null,
            idPlan: outing.id,
            idFeedbackStatus: pendingFeedbackStatus.id,
            isShared: true,
            communityConsentVersion: 1,
            // Sharing is a new community moment even when the outing happened
            // earlier, so these posts appear in the live feed by share time.
            sharedAt: new Date(),
            commentStatus: ContentStatus.Published,
          }),
        );
        experiences += 1;

        const desiredLikes = 3 + ((planIndex * 7 + reviewIndex * 3) % 12);
        let addedLikes = 0;
        for (
          let offset = 1;
          offset < profiles.length && addedLikes < desiredLikes;
          offset += 1
        ) {
          const likerIndex = (reviewerIndex + offset) % profiles.length;
          const liker = profiles[likerIndex].entity;
          if (liker.id !== reviewer.id && liker.id !== owner.id) {
            likeRows.push({ idFeedback: savedFeedback.id, idUser: liker.id });
            addedLikes += 1;
          }
        }
      }
    }

    // Remove only stale rows from earlier versions of this demo seed; keep
    // feedback and likes users may have added to the current demo records.
    const demoOutings = await outingRepository.find({
      where: {
        idSourcePlan: In(plans.map((plan) => plan.id)),
        idUser: In(profiles.map((profile) => profile.entity.id)),
        kind: PlanKind.Outing,
      },
    });
    const staleOutingIds = demoOutings
      .filter((outing) => !expectedOutingIds.has(outing.id))
      .map((outing) => outing.id);
    if (staleOutingIds.length > 0) {
      const staleFeedback = await feedbackRepository.find({
        where: { idPlan: In(staleOutingIds) },
        select: { id: true },
      });
      const staleFeedbackIds = staleFeedback.map((feedback) => feedback.id);
      if (staleFeedbackIds.length > 0) {
        await manager.getRepository(CommunityExperienceLike).delete({
          idFeedback: In(staleFeedbackIds),
        });
        await feedbackRepository.delete({ idPlan: In(staleOutingIds) });
      }
      await outingRepository.delete({ id: In(staleOutingIds) });
    }

    const uniqueLikeRows = Array.from(
      new Map(
        likeRows.map((like) => [`${like.idFeedback}:${like.idUser}`, like]),
      ).values(),
    );
    for (let offset = 0; offset < uniqueLikeRows.length; offset += 1000) {
      await manager
        .getRepository(CommunityExperienceLike)
        .createQueryBuilder()
        .insert()
        .values(uniqueLikeRows.slice(offset, offset + 1000))
        .orIgnore()
        .execute();
    }

    return {
      profiles: profiles.length,
      plans: plans.length,
      experiences,
      likes: uniqueLikeRows.length,
    };
  });
}

function ratingFor(planIndex: number, reviewIndex: number): number {
  return [5, 5, 4, 4, 4, 3, 5, 4][(planIndex + reviewIndex) % 8];
}

async function findPublicTemplates(manager: EntityManager): Promise<Plan[]> {
  return manager
    .getRepository(Plan)
    .createQueryBuilder('plan')
    .innerJoin('plan.status', 'status')
    .innerJoin('plan.user', 'author')
    .innerJoin('author.status', 'authorStatus')
    .leftJoinAndSelect('plan.details', 'details')
    .where('plan.kind = :kind', { kind: PlanKind.Authored })
    .andWhere('plan.visibility = :visibility', {
      visibility: PlanVisibility.Public,
    })
    .andWhere('plan.communityStatus = :published', {
      published: ContentStatus.Published,
    })
    .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
    .andWhere('author.deletedAt IS NULL')
    .andWhere('authorStatus.key = :active', { active: 'active' })
    .orderBy('plan.updatedAt', 'DESC')
    .take(12)
    .getMany()
    .then((plans) => plans.filter((plan) => plan.details?.length));
}
