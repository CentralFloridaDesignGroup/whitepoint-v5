export type ServiceLandingPage = {
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  searchTitles: string[];
  intro: string;
  uses: string[];
};

export const serviceLandingPages: ServiceLandingPage[] = [
  {
    slug: "boundary-surveys",
    title: "Boundary Surveys",
    h1: "Boundary Surveys in Central Florida",
    metaDescription: "Boundary survey services for property purchases, refinancing, construction planning, fences, and property line questions across Central Florida.",
    searchTitles: ["Boundary Survey (Mortgage)", "Boundary Survey", "Boundary Re-establishment"],
    intro: "Boundary surveys help identify property lines, improvements, and related boundary information for real estate, construction, and property planning needs.",
    uses: ["Property purchases and refinancing", "Fence or improvement planning", "Property line questions", "Boundary re-establishment"],
  },
  {
    slug: "property-line-stake-out",
    title: "Property Line Stake-Out",
    h1: "Property Line Stake-Out Services",
    metaDescription: "Property line stake-out services for fences, improvements, construction planning, and boundary visibility across Central Florida.",
    searchTitles: ["Property Line Stake-Out"],
    intro: "Property line stake-out services mark property lines on the ground so owners, contractors, and project teams can make decisions with better boundary visibility.",
    uses: ["Fence installation planning", "Site improvement planning", "Contractor layout coordination", "Boundary visibility before work starts"],
  },
  {
    slug: "elevation-certificates",
    title: "FEMA Elevation Certificates",
    h1: "FEMA Elevation Certificates",
    metaDescription: "FEMA elevation certificate services for flood insurance, permitting, and floodplain documentation needs in Central Florida.",
    searchTitles: ["FEMA Elevation Certificates"],
    intro: "Elevation certificates document building and site elevation information for flood insurance, permitting, and regulatory needs.",
    uses: ["Flood insurance documentation", "Permitting support", "Finished floor elevation questions", "Floodplain compliance workflows"],
  },
  {
    slug: "construction-staking",
    title: "Construction Staking",
    h1: "Construction Staking and Layout",
    metaDescription: "Construction staking and site layout support for builders, contractors, and development teams across Central Florida.",
    searchTitles: ["Construction Layout / Staking", "Site Layout & Building Stake-Out"],
    intro: "Construction staking translates plan information into field layout so construction teams can build from accurate, visible control on site.",
    uses: ["Building layout", "Formboard and foundation support", "Roadway and utility layout", "Construction control"],
  },
  {
    slug: "alta-nsps-surveys",
    title: "ALTA/NSPS Surveys",
    h1: "ALTA/NSPS Land Title Surveys",
    metaDescription: "ALTA/NSPS land title survey services for commercial real estate, title insurance, and due diligence needs in Central Florida.",
    searchTitles: ["ALTA/NSPS Land Title Survey"],
    intro: "ALTA/NSPS surveys support title insurance, commercial real estate transactions, due diligence, and lender requirements using nationally recognized survey standards.",
    uses: ["Commercial closings", "Title insurance requirements", "Lender due diligence", "Real estate transaction support"],
  },
  {
    slug: "topographic-surveys",
    title: "Topographic Surveys",
    h1: "Topographic Surveys in Central Florida",
    metaDescription: "Topographic survey services for design, permitting, construction planning, land development, and site analysis across Central Florida.",
    searchTitles: ["Topographic Survey"],
    intro: "Topographic surveys map site features and elevations to support planning, design, permitting, and construction decisions.",
    uses: ["Engineering and design support", "Site planning", "Land development", "Drainage and elevation review"],
  },
];

export function getServiceLandingBySlug(slug: string | undefined): ServiceLandingPage | undefined {
  return serviceLandingPages.find((page) => page.slug === slug);
}

export function getServiceLandingByTitle(title: string): ServiceLandingPage | undefined {
  return serviceLandingPages.find((page) => page.searchTitles.includes(title));
}
