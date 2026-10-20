import {
  getNextSendWindowStart,
  isWithinSendWindow,
} from 'src/modules/email-sequence/utils/get-next-send-window-start.util';

// Riyadh is UTC+3 with no DST; Sunday to Thursday, 08:00 to 11:00 local
const RIYADH_WINDOW = {
  timeZone: 'Asia/Riyadh',
  sendDays: [0, 1, 2, 3, 4],
  sendWindowStartHour: 8,
  sendWindowEndHour: 11,
};

describe('getNextSendWindowStart', () => {
  it('keeps a time that is already inside the window', () => {
    // Tuesday 2026-10-20 09:30 Riyadh
    const insideWindow = new Date('2026-10-20T06:30:00.000Z');

    expect(isWithinSendWindow(insideWindow, RIYADH_WINDOW)).toBe(true);
    expect(getNextSendWindowStart(insideWindow, RIYADH_WINDOW)).toEqual(
      insideWindow,
    );
  });

  it('moves an early morning time to 08:00 the same day', () => {
    // Tuesday 2026-10-20 06:00 Riyadh
    expect(
      getNextSendWindowStart(
        new Date('2026-10-20T03:00:00.000Z'),
        RIYADH_WINDOW,
      ).toISOString(),
    ).toBe('2026-10-20T05:00:00.000Z');
  });

  it('moves an afternoon time to 08:00 the next working day', () => {
    // Tuesday 2026-10-20 15:00 Riyadh
    expect(
      getNextSendWindowStart(
        new Date('2026-10-20T12:00:00.000Z'),
        RIYADH_WINDOW,
      ).toISOString(),
    ).toBe('2026-10-21T05:00:00.000Z');
  });

  it('skips the Friday and Saturday weekend', () => {
    // Thursday 2026-10-22 12:00 Riyadh, next window is Sunday 2026-10-25
    expect(
      getNextSendWindowStart(
        new Date('2026-10-22T09:00:00.000Z'),
        RIYADH_WINDOW,
      ).toISOString(),
    ).toBe('2026-10-25T05:00:00.000Z');
  });

  it('handles a time zone with daylight saving time', () => {
    // Saturday 2026-03-28 12:00 London (GMT), next window is Monday after the switch to BST
    expect(
      getNextSendWindowStart(new Date('2026-03-28T12:00:00.000Z'), {
        timeZone: 'Europe/London',
        sendDays: [1, 2, 3, 4, 5],
        sendWindowStartHour: 9,
        sendWindowEndHour: 12,
      }).toISOString(),
    ).toBe('2026-03-30T08:00:00.000Z');
  });

  it('throws when no sending day is configured', () => {
    expect(() =>
      getNextSendWindowStart(new Date('2026-10-20T12:00:00.000Z'), {
        ...RIYADH_WINDOW,
        sendDays: [],
      }),
    ).toThrow();
  });
});
