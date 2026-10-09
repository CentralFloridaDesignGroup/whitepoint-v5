import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getServiceLandingBySlug, serviceLandingPages } from "../../data/serviceLandingPages";

const SITE_URL = "https://www.whitepointsurvey.com";
const SITE_NAME = "White Point Surveying & Mapping";
const DEFAULT_IMAGE = `${SITE_URL}/images/white-point-survey-truck-hero.jpg`;

type JsonLd = Record<string, unknown>;

type RouteSeo = {
  title: string;
  description: string;
  image?: string;
  noindex?: boolean;
};

const routeSeo: Record<string, RouteSeo> = {
  "/": {
    title: "Central Florida Land Surveyor | White Point Surveying & Mapping",
    description: "White Point Surveying & Mapping provides boundary, topographic, ALTA/NSPS, construction, FEMA, and development surveying services across Central Florida.",
  },
  "/services": {
    title: "Land Surveying Services in Central Florida | White Point Survey",
    description: "Explore White Point Surveying & Mapping services including boundary surveys, topographic surveys, ALTA/NSPS surveys, construction staking, FEMA elevation certificates, and subdivision surveys.",
  },
  "/contact": {
    title: "Request a Survey Quote | White Point Surveying & Mapping",
    description: "Contact White Point Surveying & Mapping for a survey quote, project fit check, or questions about land surveying services in Central Florida.",
  },
  "/company": {
    title: "About White Point Surveying & Mapping | Central Florida Survey Firm",
    description: "Learn about White Point Surveying & Mapping, a Central Florida survey firm led by Nathan White, PSM, CST-IV.",
  },
  "/services/discounts": {
    title: "Survey Service Discounts | White Point Surveying & Mapping",
    description: "White Point Surveying & Mapping offers eligible survey service discounts for first responders, teachers, and military personnel.",
  },
  "/positions": {
    title: "Surveying Careers | White Point Surveying & Mapping",
    description: "View open surveying and mapping positions at White Point Surveying & Mapping.",
  },
  "/terms-of-service": {
    title: "Terms of Service | White Point Surveying & Mapping",
    description: "Read the terms of service for White Point Surveying & Mapping.",
  },
  "/privacy-policy": {
    title: "Privacy Policy | White Point Surveying & Mapping",
    description: "Read the privacy policy for White Point Surveying & Mapping.",
  },
  "/eula": {
    title: "End-User License Agreement | White Point Surveying & Mapping",
    description: "Read the end-user license agreement for White Point Surveying & Mapping internal software tools.",
  },
  "/404": {
    title: "Page Not Found | White Point Surveying & Mapping",
    description: "The requested White Point Surveying & Mapping page could not be found.",
    noindex: true,
  },
};

export function PageSeo(): null {
  const { pathname } = useLocation();
  const normalizedPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const seo = resolveSeo(normalizedPath);
  const canonical = `${SITE_URL}${normalizedPath === "/" ? "/" : normalizedPath}`;
  const image = seo.image ?? DEFAULT_IMAGE;

  useEffect(() => {
    document.title = seo.title;
    setMeta("name", "description", seo.description);
    setMeta("name", "robots", seo.noindex ? "noindex,follow" : "index,follow");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", seo.title);
    setMeta("property", "og:description", seo.description);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:image", image);
    setMeta("property", "og:image:alt", "White Point Surveying and Mapping truck on a Central Florida construction site");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", seo.title);
    setMeta("name", "twitter:description", seo.description);
    setMeta("name", "twitter:image", image);
    setCanonical(canonical);
    setJsonLd(buildStructuredData(normalizedPath, seo, canonical, image));
  }, [canonical, image, normalizedPath, seo]);

  return null;
}

function resolveSeo(pathname: string): RouteSeo {
  if (routeSeo[pathname]) return routeSeo[pathname];
  if (pathname.startsWith("/services/")) {
    const service = getServiceLandingBySlug(pathname.split("/").pop());
    if (service) {
      return {
        title: `${service.title} in Central Florida | White Point Survey`,
        description: service.metaDescription,
      };
    }
  }
  if (pathname.startsWith("/positions/")) {
    return {
      title: "Surveying Position | White Point Surveying & Mapping",
      description: "View details for an open surveying position at White Point Surveying & Mapping.",
    };
  }

  return routeSeo["/404"] ?? { title: "Not Found | White Point Survey", description: "The requested page could not be found." };
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

function setJsonLd(data: JsonLd[]) {
  const id = "white-point-structured-data";
  let element = document.getElementById(id) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement("script");
    element.id = id;
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }
  element.text = JSON.stringify(data);
}

function buildStructuredData(pathname: string, seo: RouteSeo, canonical: string, image: string): JsonLd[] {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const pageId = `${canonical}#webpage`;

  const organization: JsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": organizationId,
    name: "White Point Surveying & Mapping LLC",
    alternateName: "White Point Survey",
    url: SITE_URL,
    logo: `${SITE_URL}/White_Point_Logo.svg`,
    image,
    telephone: "+14077101980",
    email: "info@whitepointsurvey.com",
    areaServed: [
      "Central Florida",
      "Brevard County, Florida",
      "Hillsborough County, Florida",
      "Lake County, Florida",
      "Orange County, Florida",
      "Osceola County, Florida",
      "Polk County, Florida",
      "Seminole County, Florida",
      "Volusia County, Florida",
    ],
    knowsAbout: [
      "Boundary surveys",
      "Topographic surveys",
      "ALTA/NSPS surveys",
      "Construction staking",
      "FEMA elevation certificates",
      "Subdivision surveys",
    ],
    founder: {
      "@type": "Person",
      name: "Nathan White",
      honorificSuffix: "PSM, CST-IV",
      jobTitle: "Owner and President",
    },
  };

  const website: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": organizationId },
  };

  const webpage: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageId,
    url: canonical,
    name: seo.title,
    description: seo.description,
    isPartOf: { "@id": websiteId },
    about: { "@id": organizationId },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: image,
    },
  };

  const data = [organization, website, webpage];
  const breadcrumbs = buildBreadcrumbs(pathname);
  if (breadcrumbs) data.push(breadcrumbs);
  if (pathname === "/services") data.push(buildServicesItemList(canonical));
  if (pathname.startsWith("/services/")) {
    const service = getServiceLandingBySlug(pathname.split("/").pop());
    if (service) data.push(buildServiceStructuredData(service.title, service.metaDescription, canonical));
  }
  if (pathname === "/contact") data.push(buildContactPage(canonical, organizationId));

  return data;
}

function buildBreadcrumbs(pathname: string): JsonLd | null {
  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_URL}/`,
      },
      ...parts.map((part, index) => {
        const path = `/${parts.slice(0, index + 1).join("/")}`;
        return {
          "@type": "ListItem",
          position: index + 2,
          name: titleCase(part.split("-").join(" ")),
          item: `${SITE_URL}${path}`,
        };
      }),
    ],
  };
}

function buildServicesItemList(canonical: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "White Point Surveying Services",
    url: canonical,
    itemListElement: serviceLandingPages.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.title,
        description: service.metaDescription,
        url: `${SITE_URL}/services/${service.slug}`,
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: "Central Florida",
      },
    })),
  };
}

function buildServiceStructuredData(name: string, description: string, canonical: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: canonical,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: "Central Florida",
    serviceType: "Land surveying",
  };
}

function buildContactPage(canonical: string, organizationId: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: canonical,
    name: "Request a Survey Quote",
    mainEntity: { "@id": organizationId },
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
