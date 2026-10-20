import { getZonedDateParts } from 'src/modules/email-sequence/utils/get-zoned-date-parts.util';

const getTimeZoneOffsetInMs = (date: Date, timeZone: string): number => {
  const parts = getZonedDateParts(date, timeZone);

  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );

  return zonedAsUtc - Math.floor(date.getTime() / 60_000) * 60_000;
};

export const zonedTimeToUtc = ({
  year,
  month,
  day,
  hour,
  timeZone,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  timeZone: string;
}): Date => {
  const naiveUtc = Date.UTC(year, month - 1, day, hour);
  const firstGuess =
    naiveUtc - getTimeZoneOffsetInMs(new Date(naiveUtc), timeZone);

  // Second pass settles DST transitions where the first guess used the wrong offset
  return new Date(
    naiveUtc - getTimeZoneOffsetInMs(new Date(firstGuess), timeZone),
  );
};
