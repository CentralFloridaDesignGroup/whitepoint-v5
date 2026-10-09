import { ArrowRight, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { useParams } from "react-router-dom";
import { MarketingButton } from "../components/marketing";
import { getServiceLandingBySlug } from "../data/serviceLandingPages";
import { services, timeframes } from "../data/servicesProvided.json";

type ServiceMatch = {
  title: string;
  description: string;
  timeframe: string;
  costLow: number;
  costHigh: number | null;
};

export function ServiceDetail() {
  const { slug } = useParams();
  const landing = getServiceLandingBySlug(slug);

  if (!landing) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-primary">Service Not Found</h1>
        <p className="mt-4 text-gray-600">The requested service page could not be found.</p>
        <div className="mt-6">
          <MarketingButton label="View Services" href="/services" icon={ArrowRight} />
        </div>
      </div>
    );
  }

  const matches = landing.searchTitles
    .map((title) => findServiceByTitle(title))
    .filter((service): service is ServiceMatch => Boolean(service));

  return (
    <div className="bg-white text-gray-900">
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-primary">Surveying Services</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">{landing.h1}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">{landing.intro}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingButton label="Request a Quote" href="/contact" icon={ArrowRight} />
            <MarketingButton label="Call (407) 710-1980" href="tel:14077101980" variant="secondary" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Common reasons for this survey</h2>
          <ul className="mt-6 grid gap-3">
            {landing.uses.map((use) => (
              <li key={use} className="flex gap-3 text-base leading-7 text-gray-700">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                <span>{use}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-5">
          {matches.map((service) => (
            <article key={service.title} className="border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900">{service.title}</h2>
              <p className="mt-3 text-base leading-7 text-gray-600">{service.description}</p>
              <div className="mt-5 grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-2">
                <ServiceStat icon={Clock} label="Typical timeframe" value={timeframes[service.timeframe as keyof typeof timeframes]} />
                <ServiceStat icon={DollarSign} label="Cost guidance" value={formatCost(service.costLow, service.costHigh)} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ServiceStat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block text-sm font-bold text-gray-900">{value}</span>
      </span>
    </div>
  );
}

function findServiceByTitle(title: string): ServiceMatch | null {
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
