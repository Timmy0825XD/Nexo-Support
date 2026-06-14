import { z } from 'zod';

export const staffRecruitPositionSchema = z.enum([
  'Judge',
  'Recorder',
  'T1 Admin',
  'T2 Admin',
  'Best Staff',
  'Server Helper',
  'Judge + Recorder',
  'T1 Admin + Helper + Best Staff',
  'T2 Admin + Helper + Best Staff',
]);

export const staffFirePositionSchema = z.enum([
  'Judge',
  'Recorder',
  'T1 Admin',
  'T2 Admin',
  'Best Staff',
  'Server Helper',
  'T1 Admin + Helper + Best Staff',
  'T2 Admin + Helper + Best Staff',
  'Complete',
]);

export type StaffRecruitPosition = z.infer<typeof staffRecruitPositionSchema>;
export type StaffFirePosition = z.infer<typeof staffFirePositionSchema>;

export const STAFF_RECRUIT_CHOICES = staffRecruitPositionSchema.options.map((value) => ({
  name: value,
  value,
}));

export const STAFF_FIRE_CHOICES = staffFirePositionSchema.options.map((value) => ({
  name: value,
  value,
}));
