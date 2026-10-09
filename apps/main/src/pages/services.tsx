import { useMemo, useState } from "react";
import { timeframes, services } from "../data/servicesProvided.json";
import { MarketingButton, MarketingServiceCard, MarketingTextField } from "../components/marketing";
import { getServiceLandingByTitle } from "../data/serviceLandingPages";

export function Services() {
    const [query, setQuery] = useState("");

    const filteredServices = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return services;

        return services
            .map((service) => {
                const matchedItems = service.services.filter((item) => {
                    return (
                        item.title.toLowerCase().includes(normalized) ||
                        item.description.toLowerCase().includes(normalized)
                    );
                });

                return matchedItems.length > 0
                    ? { ...service, services: matchedItems }
                    : null;
            })
            .filter((service): service is (typeof services)[number] => service !== null);
    }, [query]);

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="mb-6 text-center text-4xl font-bold text-primary">Our Services</h1>
            <p className="mb-6 border-l-4 border-primary bg-primary-200 p-4">NOTE: Timeframes and costs are approximate and may vary depending on project complexity. We will provide a detailed estimate upon request.</p>
            <div className="mb-8 flex flex-col items-end justify-between gap-4 md:flex-row">
                <div className="w-full flex-1">
                    <MarketingTextField
                        field="searchServices"
                        label="Search Services"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search for a service..."
                    />
                </div>
                <div className="w-full md:w-auto">
                    <MarketingButton
                        className="w-full md:w-auto"
                        label="Clear"
                        variant={query === "" ? "secondary" : "primary"}
                        size="medium"
                        onClick={() => setQuery("")}
                    />
                </div>
            </div>
            {filteredServices.map((service, index) => (
                <div key={service.categoryName} className={`mb-8 pt-6 ${index === 0 ? '' : 'border-t border-primary'}`}>
                    <h2 className="mb-2 text-2xl font-semibold text-primary">{service.categoryName}</h2>
                    <p className="text-gray-600">{service.description}</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {service.services.map((serviceItem) => (
                            <ServiceCard key={serviceItem.title} {...serviceItem} />
                        ))}
                    </div>
                </div>
            ))}
            {filteredServices.length === 0 && (
                <p className="text-sm text-gray-500">No services match your search.</p>
            )}
        </div>
    );
}

function ServiceCard({
    title,
    description,
    timeframe,
    costLow,
    costHigh,
    serviceDiscount = false
}: {
    title: string;
    description: string;
    timeframe: string;
    costLow: number;
    costHigh: number | null;
    serviceDiscount?: boolean;
}) {
    const landingPage = getServiceLandingByTitle(title);
    const formatCurrency = (value: number | null) => {
        if (value === null) return "N/A";
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const costText = costHigh !== null
        ? `${formatCurrency(costLow)} - ${formatCurrency(costHigh)}`
        : `Starts at ${formatCurrency(costLow)}`;

    const card = (
        <MarketingServiceCard
            title={title}
            description={description}
            eyebrow={serviceDiscount ? "Discounts applicable" : undefined}
            footer={(
                <div className="grid gap-2">
                    <p>Timeframe: {timeframes[timeframe as keyof typeof timeframes]}</p>
                    <p>Cost: {costText}</p>
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
