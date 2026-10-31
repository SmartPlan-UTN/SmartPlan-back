import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComposerCheckDto } from './composer-check.dto';
import { CreateFeedbackDto } from './create-feedback.dto';
import {
  hasExactlyOneStopTarget,
  isCalendarDate,
  isClockTime,
} from './stop-target.validation';

const valid = {
  stops: [{ activityId: 1 }],
  date: '2026-10-24',
  startTime: '20:00',
  peopleCount: 2,
};
const errorsOf = async (body: object) =>
  (await validate(plainToInstance(ComposerCheckDto, body))).map(
    (error) => error.property,
  );

describe('composer check validation', () => {
  it('accepts an activity stop and a place+action stop', async () => {
    expect(await errorsOf(valid)).toEqual([]);
    expect(
      await errorsOf({ ...valid, stops: [{ placeId: 3, action: 'meal' }] }),
    ).toEqual([]);
  });

  it.each([
    [{}],
    [{ placeId: 3 }],
    [{ action: 'meal' }],
    [{ activityId: 1, placeId: 3, action: 'meal' }],
    [{ activityId: 1, action: 'meal' }],
  ])('rejects the stop %j', async (stop) => {
    expect(await errorsOf({ ...valid, stops: [stop] })).toContain('stops');
  });

  it.each(['2026-99-99', '2026-02-30', '2026-13-01', 'mañana'])(
    'rejects the date %s',
    async (date) => {
      expect(await errorsOf({ ...valid, date })).toContain('date');
    },
  );

  it.each(['99:99', '24:00', '12:60', '9:00'])(
    'rejects the time %s',
    async (startTime) => {
      expect(await errorsOf({ ...valid, startTime })).toContain('startTime');
    },
  );

  it('knows real dates and clock times', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('00:00')).toBe(true);
    expect(hasExactlyOneStopTarget(null)).toBe(false);
  });
});

describe('feedback stop outcomes', () => {
  it('rejects the same detailId twice', async () => {
    const dto = plainToInstance(CreateFeedbackDto, {
      rating: 5,
      stops: [
        { detailId: 4, amount: 100 },
        { detailId: 4, amount: 100 },
      ],
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('stops');
  });
});
