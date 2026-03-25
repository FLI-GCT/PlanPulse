export const I_ID_GENERATOR = 'I_ID_GENERATOR';
export interface IIdGenerator {
  generate(): string;
}

export const I_DATE_TIME = 'I_DATE_TIME';
export interface IDateTime {
  nowUTC(): Date;
}
