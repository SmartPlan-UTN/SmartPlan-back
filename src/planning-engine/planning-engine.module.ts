import { ComposerIntelligenceService } from './composer/composer-intelligence.service';
import { CommunityPlanRecommendationsService } from './community-plan-recommendations.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalDataUsage } from '../external-integration/entities/external-data-usage.entity';
import { ExternalProvider } from '../external-integration/entities/external-provider.entity';
import { ExternalDataUsageService } from '../external-integration/external-data-usage.service';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { PlaceOpeningHours } from './entities/place-opening-hours.entity';
import { PlaceTraitRecord } from './entities/place-trait.entity';
import { PlaceMenuObservation } from './entities/place-menu-observation.entity';
import { PlanEvent } from './entities/plan-event.entity';
import { LanguageObservation } from './entities/language-observation.entity';
import { LanguageObservationService } from './language/language-observation.service';
import { PlanEventsService } from './events/plan-events.service';
import { PlanningEngineService } from './planning-engine.service';
import { PersonalSignalsService } from './ranking/personal-signals.service';
import { CandidateRetrievalService } from './retrieval/candidate-retrieval.service';
import { LiveDiscoveryService } from './retrieval/live-discovery.service';
import { PlaceFactsService } from './retrieval/place-facts.service';
import { LiveVerificationService } from './verification/live-verification.service';
import { KnowledgeRevalidation } from '../knowledge/entities/knowledge-revalidation.entity';
import { PlaceFactObservation } from '../knowledge/entities/place-fact-observation.entity';
import { PlaceSource } from '../knowledge/entities/place-source.entity';
import { KnowledgeSignalsService } from '../knowledge/knowledge-signals.service';

/** Entities the engine reads/writes (also registered by the worker). */
export const PLANNING_ENGINE_ENTITIES = [
  PlaceOpeningHours,
  PlaceTraitRecord,
  PlaceMenuObservation,
  PlanEvent,
  LanguageObservation,
  PlaceFactObservation,
  PlaceSource,
  KnowledgeRevalidation,
];

/** Engine providers, shared by the API module and the worker thread. */
export const PLANNING_ENGINE_PROVIDERS = [
  PlanningEngineService,
  CommunityPlanRecommendationsService,
  CandidateRetrievalService,
  LiveDiscoveryService,
  PlaceFactsService,
  PersonalSignalsService,
  LiveVerificationService,
  PlanEventsService,
  KnowledgeSignalsService,
  ComposerIntelligenceService,
  LanguageObservationService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...PLANNING_ENGINE_ENTITIES,
      ExternalDataUsage,
      ExternalProvider,
    ]),
  ],
  providers: [
    ...PLANNING_ENGINE_PROVIDERS,
    GoogleMapsClientService,
    ExternalDataUsageService,
  ],
  exports: [
    PlanningEngineService,
    CommunityPlanRecommendationsService,
    PlanEventsService,
    KnowledgeSignalsService,
    ComposerIntelligenceService,
    LanguageObservationService,
  ],
})
export class PlanningEngineModule {}
