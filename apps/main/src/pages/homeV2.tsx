import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Compass,
  FileText,
  Hammer,
  HomeIcon,
  Mail,
  MapPin,
  Phone,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import HeroTruckField from "../assets/hero-truck-field-v2.jpg";
import { MarketingButton, MarketingServiceCard } from "../components/marketing";
import { CountyServiceMap } from "../components/ui/Map";
import { coreCountyNames, secondaryCountyNames } from "../data/serviceCounties";
import { getServiceLandingByTitle } from "../data/serviceLandingPages";
import { services, timeframes } from "../data/servicesProvided.json";

const featuredServiceTitles = [
  "Boundary Survey (Mortgage)",
  "Property Line Stake-Out",
  "FEMA Elevation Certificates",
  "Construction Layout / Staking",
] as const;

const useCases = [
  {
    title: "Buying, selling, or refinancing",
    description: "Boundary surveys and title-supporting work for residential and commercial closings.",
    icon: HomeIcon,
  },
  {
    title: "Building, fencing, or improving land",
    description: "Property line stake-outs, construction staking, elevations, and site layout support.",
    icon: Hammer,
  },
  {
    title: "Developing or subdividing property",
    description: "Topographic, subdivision, ALTA/NSPS, legal description, and mapping support.",
    icon: Building2,
  },
];

const trustItems = [
  { label: "Central Florida coverage", icon: MapPin },
  { label: "Residential, commercial, and construction", icon: ClipboardCheck },
  { label: "Statement of Qualifications available", icon: FileText },
  { label: "Direct phone and email contact", icon: ShieldCheck },
];

export function HomeV2() {
  return (
    <div className="bg-white text-gray-900">
      <HeroSection />
      <TrustStrip />
      <UseCaseSection />
      <FeaturedServicesSection />
      <DiscountBanner />
      <ServiceAreaSection />
      <FinalCtaSection />
    </div>
  );
}

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-gray-900 bg-cover bg-[center_right_35%] text-white"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(17, 24, 39, 0.92) 0%, rgba(17, 24, 39, 0.78) 42%, rgba(17, 24, 39, 0.18) 100%), url(${HeroTruckField})` }}
    >
      <div className="mx-auto min-h-[620px] max-w-7xl px-4 py-12 sm:px-6 md:flex md:items-center md:py-16 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-wide text-primary-100">White Point Surveying & Mapping</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Central Florida Land Surveying for Homeowners, Builders, and Developers
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-100">
            Get clear answers, accurate field work, and survey deliverables for property purchases,
            construction, flood requirements, and land development across Central Florida.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingButton
              label="Request a Quote"
              href="/contact"
              size="large"
              variant="custom"
              className="bg-white text-primary shadow-lg hover:bg-primary-50"
              icon={ArrowRight}
            />
            <MarketingButton
              label="Call (407) 710-1980"
              href="tel:14077101980"
              size="large"
              variant="custom"
              className="border border-white/50 bg-primary/80 text-white shadow-lg hover:bg-primary"
              icon={Phone}
            />
          </div>
          <div className="mt-8 grid max-w-2xl gap-3 text-sm text-gray-100 sm:grid-cols-3">
            <HeroProofRow icon={Ruler} label="Boundary, topo, ALTA/NSPS, and construction surveys" />
            <HeroProofRow icon={Compass} label="Central Florida county coverage" />
            <HeroProofRow icon={Mail} label="Direct quote and project contact" />
          </div>
          <div className="mt-6 flex flex-col gap-3 text-sm text-gray-100 sm:flex-row sm:items-center sm:gap-5">
            <a href="mailto:info@whitepointsurvey.com" className="inline-flex items-center gap-2 transition hover:text-white">
              <Mail className="h-4 w-4" aria-hidden="true" />
              info@whitepointsurvey.com
            </a>
            <span className="hidden h-4 w-px bg-white/30 sm:block" />
            <span>Core counties include {coreCountyNames.slice(0, 4).join(", ")}, and more.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroProofRow({ icon: Icon, label }: { icon: typeof Ruler; label: string }) {
  return (
    <div className="flex items-start gap-3">
        <Icon className="h-8 w-8 text-white" strokeWidth={2.5} aria-hidden="true" />
      <p className="pt-0.5 text-sm font-semibold leading-6 text-white">{label}</p>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:px-6 md:grid-cols-4 lg:px-8">
        {trustItems.map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-sm font-semibold text-gray-700">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-white text-primary shadow-sm">
              <item.icon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function UseCaseSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wide text-primary">Start with the project</p>
        <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Survey help for the moments when the line matters</h2>
        <p className="mt-4 text-base leading-7 text-gray-600">
          Most people do not start with a survey type. They start with a closing, a permit, a fence,
          a foundation, a flood requirement, or a site plan. White Point helps match the work to the need.
        </p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {useCases.map((useCase) => (
          <MarketingServiceCard
            key={useCase.title}
            title={useCase.title}
            description={useCase.description}
            icon={useCase.icon}
          />
        ))}
      </div>
    </section>
  );
}

function FeaturedServicesSection() {
  const featuredServices = featuredServiceTitles
    .map((title) => findServiceByTitle(title))
    .filter((service): service is FeaturedService => service !== null);

  return (
    <section id="services" className="border-t border-primary bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Common requests</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Popular surveying services</h2>
          </div>
          <MarketingButton label="View All Services" href="/services" variant="primary" icon={ArrowRight} />
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-4">
          {featuredServices.map((service) => (
            <FeaturedServiceCard key={service.title} service={service} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedServiceCard({ service }: { service: FeaturedService }) {
  const landingPage = getServiceLandingByTitle(service.title);
  const card = (
    <MarketingServiceCard
      title={service.title}
      description={service.description}
      footer={(
        <div className="grid gap-1">
          <p>Typical timeframe: {timeframes[service.timeframe as keyof typeof timeframes]}</p>
          <p>{formatCost(service.costLow, service.costHigh)}</p>
        </div>
      )}
    />
  );

  return landingPage ? (
    <a href={`/services/${landingPage.slug}`} className="block h-full transition hover:-translate-y-0.5">
      {card}
    </a>
  ) : (
    card
  );
}

function DiscountBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-4 border-l-4 border-primary bg-primary-50 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Discounts for first responders, teachers, and military personnel</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            White Point offers eligible discounts on select survey services. Verification may be required.
          </p>
        </div>
        <MarketingButton label="Learn More" href="/services/discounts" variant="secondary" icon={ArrowRight} />
      </div>
    </section>
  );
}

function ServiceAreaSection() {
  return (
    <section id="service-area" className="border-t border-primary">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Service area</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Focused coverage across Central Florida</h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Core counties receive the most comprehensive coverage and fastest response times. Secondary
              counties are also served with scheduling based on project scope and location.
            </p>
            <div className="mt-6 grid gap-4">
              <CountyServiceList countyList="core" countyValues={coreCountyNames} />
              <CountyServiceList countyList="secondary" countyValues={secondaryCountyNames} />
            </div>
            <div className="mt-6">
              <MarketingButton
                label="Download SOQ"
                variant="primary"
                icon={FileText}
                onClick={() => window.open("/statement_of_qualifications_2026.pdf", "_blank")}
              />
            </div>
          </div>
          <div className="hidden md:block">
            <CountyServiceMap />
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="bg-gray-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
        <div>
          <h2 className="text-3xl font-bold">Need a survey quote or a quick project fit check?</h2>
          <p className="mt-3 text-base leading-7 text-gray-300">
            Send the address, project type, deadline, and any closing or permitting details you already have.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
          <MarketingButton label="Request a Quote" href="/contact" variant="custom" className="bg-white text-gray-900 hover:bg-gray-100" icon={ArrowRight} />
          <MarketingButton label="Call Now" href="tel:14077101980" variant="custom" className="border border-white/30 bg-gray-800 text-white hover:bg-gray-700" icon={Phone} />
        </div>
      </div>
    </section>
  );
}

function CountyServiceList({ countyList, countyValues }: { countyList: "core" | "secondary"; countyValues: string[] }) {
  return (
    <div className={`border-l-4 ${countyList === "core" ? "border-primary" : "border-primary-400"} bg-white py-3 pl-4 shadow-sm`}>
      <h3 className="text-xl font-semibold text-gray-900">{countyList === "core" ? "Core Counties" : "Secondary Counties"}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{countyValues.join(", ")}</p>
    </div>
  );
}

type FeaturedService = {
  title: string;
  description: string;
  timeframe: string;
  costLow: number;
  costHigh: number | null;
};

function findServiceByTitle(title: string): FeaturedService | null {
  for (const category of services) {
    const service = category.services.find((item) => item.title === title);
    if (service) return service;
  }

  return null;
}

function formatCost(costLow: number, costHigh: number | null) {
  const low = formatCurrency(costLow);
  if (costHigh === null) return `Starts at ${low}`;
  return `${low} - ${formatCurrency(costHigh)}`;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
