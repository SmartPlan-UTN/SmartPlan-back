import { isOccasion, OCCASIONS, occasionsInText } from '../catalog/taxonomy';
import { TimeOfDay } from '../activities/activity-constraints';
import {
  InterpretIntentInput,
  InterpretedIntent,
} from './gemini/dto/interpret-intent.dto';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { readLexicon } from '../planning-engine/intent/intent-lexicon';
import { normalizeColloquial } from '../planning-engine/intent/language';

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const STOP_WORDS = new Set(
  (
    'quiero queremos quisiera algo hacer plan planes salida salir para con por una uno unos unas los las del que sea somos tengo tenemos hasta presupuesto pesos ars personas persona gente minutos minuto horas hora tarde manana noche mediodia hoy despues disfrutar necesito ' +
    // Everyday connectors and verbs that carry no planning meaning.
    'lugar lugares sitio sitios alguna algun alguno algunos algunas cosa cosas bien buen buena bueno mas menos muy pero porque donde cuando como esta este estos estas pueda puede podemos podria hay tiene tenga ser estar voy vamos vez rato ratito tipo nos mis mis tus sus nuestro nuestra algo otro otra otros otras tan tanto tanta mismo misma solo sola sin pero ganas busco buscamos buscando salimos sale queda quedar ir ver llevar llevarla llevarlo llevarlos acompanar invitar invitarla invitarlo tomar poder gustaria gusta lindo linda lindos lindas ' +
    // Common conversational wording is not an unresolved place or activity.
    'alguien ocurre nada hacemos mente che idea ideas varios hambre vuelta funcionar puede decime horarios pinto pinta termine sabemos rico apuro elegi vos cuanto dio mucha recomendas corto irme buscamelo mano mendoza'
  ).split(' '),
);

function literalPattern(text: string): string {
  return normalizeSearchText(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchTerms(text: string | null): string[] {
  return [...new Set(normalizeSearchText(text ?? '').match(/[a-z]{3,}/g) ?? [])]
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, 12);
}

function parseAmount(text: string): number {
  const compact = text.replace(/\s/g, '').toLowerCase();
  const thousands = compact.endsWith('k');
  const amount = Number(
    compact
      .replace(/k$/, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.'),
  );
  return amount * (thousands ? 1000 : 1);
}

export function localIntent(
  input: InterpretIntentInput,
  planningEngine = false,
): {
  intent: InterpretedIntent;
  needsModel: boolean;
  /** Words the reader could not place: the language-learning signal. */
  unknownTerms: string[];
  /** The party size is implied by the company ("mi novia" → 2), not said. */
  partySizeInferred: boolean;
  /** "No <algo>" whose subject the reader could not place. */
  unresolvedNegations: string[];
} {
  const numberWords: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };
  const normalizedInput = planningEngine
    ? normalizeColloquial(input.rawQuery).text
    : normalizeSearchText(input.rawQuery);
  const text = normalizedInput
    .replace(
      /\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(personas?|amigos|adultos|horas?|minutos?)\b/g,
      (_match, word: string, unit: string) => `${numberWords[word]} ${unit}`,
    )
    .replace(
      /\bsomos\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/g,
      (_match, word: string) => `somos ${numberWords[word]}`,
    );
  // Phrases that read as negations but are requests: "sin gastar" is free,
  // "sin salir" is at home. Matched before the negation rule below. A game
  // night is at home too: the games live only in the Hogar.
  const homePhrase =
    /\b(?:en casa|en mi casa|en lo de \w+|quedarnos en casa|sin salir|(?:noche|tarde) de juegos)\b/;
  const freePhrase =
    /\b(?:gratis|gratuit[oa]s?|sin gastar|sin plata|sin costo|de arriba)\b/;
  const occasions = [
    ...new Set([
      ...(input.context.occasions ?? []).filter(isOccasion),
      ...occasionsInText(input.rawQuery),
    ]),
  ];
  const atHome = input.context.atHome === true || homePhrase.test(text);
  const freeOnly = input.context.freeOnly === true || freePhrase.test(text);
  const matchedDepartments = input.candidateDepartments.filter(({ name }) =>
    new RegExp(
      `(?:^|\\W)${normalizeSearchText(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\W)`,
    ).test(text),
  );
  const centerMentioned = /\b(?:centro|microcentro)\b/.test(text);
  const cityDepartment = input.candidateDepartments.find(
    ({ name }) => normalizeSearchText(name) === 'ciudad de mendoza',
  );
  const departments =
    matchedDepartments.length > 0
      ? matchedDepartments
      : centerMentioned && cityDepartment
        ? [cityDepartment]
        : [];
  if (
    /(?:\d[\d.,]*\s*(?:usd|eur|brl|dolares|euros)\b|(?:usd|eur|brl)\s*\d)/.test(
      text,
    )
  )
    throw new PermanentJobError(
      JSON.stringify({ code: 'UNSUPPORTED_BUDGET_CURRENCY' }),
    );
  const categoryNames = input.candidateCategories
    .filter(({ name }) => text.includes(normalizeSearchText(name)))
    .map(({ name }) => name);
  const amount =
    text.match(
      /(?:\$\s*|(?:presupuesto|gastar|gasto)\s+(?:de\s+)?)(\d[\d.,]*(?:\s*k)?)/,
    ) ?? text.match(/(\d[\d.,]*(?:\s*k)?)\s*(?:pesos|ars)\b/);
  const budgetMatch = amount ? parseAmount(amount[1]) : null;
  const people =
    text.match(
      /(?:somos\s+|para\s+|con\s+)?(\d+)\s*(?:personas|persona|amigos|adultos)\b/,
    ) ?? text.match(/\bsomos\s+(\d+)\b/);
  const peopleInWords =
    text.match(
      /\b(?:(?:para|somos|seremos|estamos|entre)\s+)?(un[oa]|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:personas?|adultos?|comensales?)\b/,
    ) ??
    text.match(
      /\b(?:para|somos|seremos|estamos|entre)\s+(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)(?=\s*(?:$|[,;.!?]|\b(?:y|pero|hoy|esta)\b))/,
    );
  const duration = text.match(
    /(\d+(?:[.,]\d+)?)\s*(horas?|hs?\b|minutos?|mins?\b)/,
  );
  const period: TimeOfDay | null = /\bmadrugada\b/.test(text)
    ? 'night'
    : /\b(?:atardecer|noche)\b/.test(text)
      ? 'evening'
      : /\btarde\b/.test(text)
        ? 'afternoon'
        : /\b(?:por|en|a) la manana\b/.test(text)
          ? 'morning'
          : null;
  const intent: InterpretedIntent = {
    budgetBasis:
      input.context.budget != null
        ? 'per_party'
        : /\b(?:por persona|por cabeza|cada uno|cada una|c\/u|p\/p)\b/.test(
              text,
            )
          ? 'per_person'
          : 'per_party',
    travelMode:
      input.context.travelMode ??
      (/\b(?:a pie|caminando|caminar|sin auto)\b/.test(text)
        ? 'walk'
        : /\b(?:bicicleta|bici)\b/.test(text)
          ? 'bicycle'
          : /\b(?:en auto|en coche)\b/.test(text)
            ? 'drive'
            : null),
    excludedCategoryNames: input.candidateCategories
      .filter(({ name }) =>
        new RegExp(`(?:sin|evitar|no)\\s+${literalPattern(name)}`).test(text),
      )
      .map(({ name }) => name),
    maxDistanceKm:
      input.context.maxDistanceKm ??
      (() => {
        const match = text.match(
          /(?:hasta|menos de|radio de|a|dentro de)\s+(\d+)\s*(?:km|kilometros)\b/,
        );
        return match && Number(match[1]) >= 1 && Number(match[1]) <= 50
          ? Number(match[1])
          : null;
      })(),
    budget: input.context.budget ?? budgetMatch,
    partySize:
      input.context.partySize ??
      (people
        ? Number(people[1])
        : peopleInWords
          ? numberWords[peopleInWords[1]]
          : null),
    availableDuration:
      input.context.availableDuration ??
      (duration
        ? Math.round(
            Number(duration[1].replace(',', '.')) *
              (/^h/.test(duration[2]) ? 60 : 1),
          )
        : null),
    departmentName:
      input.context.departmentName ??
      (departments.length === 1 ? departments[0].name : null),
    categoryNames: categoryNames.filter(
      (name) =>
        !new RegExp(`(?:sin|evitar|no)\\s+${literalPattern(name)}`).test(text),
    ),
    timeOfDay: (input.context.timeOfDay as TimeOfDay | undefined) ?? period,
    occasions,
    atHome,
    freeOnly,
  };
  const knownWords = new Set([
    ...departments.flatMap(({ name }) => searchTerms(name)),
    ...categoryNames.flatMap(searchTerms),
    // Words already understood as an occasion, "en casa" or "gratis".
    ...occasions.flatMap((occasion) =>
      (OCCASIONS[occasion].aliases as readonly string[]).flatMap(searchTerms),
    ),
    ...searchTerms(text.match(homePhrase)?.[0] ?? null),
    ...searchTerms(text.match(freePhrase)?.[0] ?? null),
  ]);
  const semantic = planningEngine ? readLexicon(text) : null;
  if (semantic) {
    for (const word of semantic.knownWords) knownWords.add(word);
    intent.partySize ??= semantic.impliedPartySize;
  }
  if (centerMentioned && departments.length === 1) {
    knownWords.add('centro');
    knownWords.add('microcentro');
  }
  const invalidNumber = (
    value: number | null,
    maximum: number,
    integer: boolean,
  ) =>
    value != null &&
    (!Number.isFinite(value) ||
      value < 0 ||
      value > maximum ||
      (integer && (!Number.isInteger(value) || value < 1)));
  let invalidConstraints = false;
  if (invalidNumber(intent.budget, 99999999.99, false)) {
    intent.budget = null;
    invalidConstraints = true;
  }
  if (invalidNumber(intent.partySize, 1000, true)) {
    intent.partySize = null;
    invalidConstraints = true;
  }
  if (invalidNumber(intent.availableDuration, 525600, true)) {
    intent.availableDuration = null;
    invalidConstraints = true;
  }
  const unknown = searchTerms(text).filter((word) => !knownWords.has(word));
  const numericRemainder = [
    amount?.[0],
    people?.[0],
    duration?.[0],
    ...(semantic?.startMinutes != null
      ? [
          text.match(
            /\ba las?\s+\d{1,2}(?::\d{2})?(?:\s+de la (?:manana|tarde|noche))?/,
          )?.[0],
        ]
      : []),
    text.match(
      /(?:hasta|menos de|radio de|a|dentro de)\s+\d+\s*(?:km|kilometros)\b/,
    )?.[0],
  ].reduce<string>(
    (remaining, match) => (match ? remaining.replace(match, '') : remaining),
    text,
  );
  // With the phrase reader on, a refusal it placed ("pero no boliche") is
  // understood; only one whose subject it could not place needs the model.
  const negation = semantic
    ? semantic.unresolvedNegations.length > 0
    : /\b(no|sin|excepto|menos)\b/.test(
        text.replace(homePhrase, ' ').replace(freePhrase, ' '),
      );
  return {
    intent,
    unknownTerms: unknown,
    unresolvedNegations: semantic?.unresolvedNegations ?? [],
    partySizeInferred:
      intent.partySize !== null &&
      semantic !== null &&
      semantic.impliedPartySize === intent.partySize &&
      !people &&
      !peopleInWords &&
      input.context.partySize == null,
    needsModel:
      invalidConstraints ||
      /\d/.test(numericRemainder) ||
      departments.length > 1 ||
      unknown.length > 0 ||
      negation,
  };
}
