export const EMAIL_SEQUENCE_DEFAULT_SETTINGS = {
  signature: `Best regards,
Mahmoud Nabelsi
Head of Digital Solutions | VCL
vcl.solutions`,
  timeZone: 'Asia/Riyadh',
  // 0 = Sunday; GCC working week
  sendDays: [0, 1, 2, 3, 4],
  sendWindowStartHour: 8,
  sendWindowEndHour: 11,
  dailySendLimit: 30,
  // Days to wait after STEP_1, STEP_2 and STEP_3 respectively
  stepDelaysInDays: [3, 4, 7],
  isOpenTrackingEnabled: true,
} as const;
