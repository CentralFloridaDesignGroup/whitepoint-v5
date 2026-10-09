import { COUNTIES } from '@whitepoint/types/constants';

export type CountyName = (typeof COUNTIES)[keyof typeof COUNTIES];

export const coreCountyNames: CountyName[] = [
    COUNTIES.Brevard,
    COUNTIES.Hillsborough,
    COUNTIES.Lake,
    COUNTIES.Orange,
    COUNTIES.Osceola,
    COUNTIES.Polk,
    COUNTIES.Seminole,
    COUNTIES.Volusia,
];

export const secondaryCountyNames: CountyName[] = [
    COUNTIES.Citrus,
    COUNTIES.Flagler,
    COUNTIES.Hardee,
    COUNTIES.Hernando,
    COUNTIES.Highlands,
    COUNTIES.IndianRiver,
    COUNTIES.Manatee,
    COUNTIES.Marion,
    COUNTIES.Okeechobee,
    COUNTIES.Pasco,
    COUNTIES.Pinellas,
    COUNTIES.Putnam,
    COUNTIES.StLucie,
    COUNTIES.Sumter
];

export const ALL_SERVICE_COUNTY_NAMES: CountyName[] = [
    ...coreCountyNames,
    ...secondaryCountyNames
];

