import { type EmailSequenceTrack } from 'twenty-shared/types';

import { classifyJobTitle } from '@/people-tree/utils/classifyJobTitle';

const TRACK_BY_POSITION_CLASS: Record<string, EmailSequenceTrack> = {
  'C-Suite': 'C_SUITE',
  HR: 'HR',
  'L&D': 'L_AND_D',
  Digital: 'DIGITAL',
};

export const getDefaultEmailSequenceTrack = (
  jobTitle: string | null | undefined,
): EmailSequenceTrack =>
  TRACK_BY_POSITION_CLASS[classifyJobTitle(jobTitle)] ?? 'C_SUITE';
