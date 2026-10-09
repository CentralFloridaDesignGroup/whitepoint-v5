import { generateAuthoredChecklists } from './composePlattingChecklists.mjs';
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const siteDirectory = join(scriptDirectory, "..");
const publicChecklistDirectory = join(siteDirectory, "public", "checklists", "platting");
const locationCatalogPath = join(siteDirectory, "src", "pages", "office", "checklists", "plattingLocations.json");
const sectionReferencePath = join(siteDirectory, "src", "pages", "SectionRef.json");
const baselinePath = join(siteDirectory, "public", "checklists", "plat.json");

const countyNames = [
    "Alachua", "Baker", "Bay", "Bradford", "Brevard", "Broward", "Calhoun", "Charlotte", "Citrus", "Clay", "Collier", "Columbia", "DeSoto", "Dixie", "Duval", "Escambia", "Flagler", "Franklin", "Gadsden", "Gilchrist", "Glades", "Gulf", "Hamilton", "Hardee", "Hendry", "Hernando", "Highlands", "Hillsborough", "Holmes", "Indian River", "Jackson", "Jefferson", "Lafayette", "Lake", "Lee", "Leon", "Levy", "Liberty", "Madison", "Manatee", "Marion", "Martin", "Miami-Dade", "Monroe", "Nassau", "Okaloosa", "Okeechobee", "Orange", "Osceola", "Palm Beach", "Pasco", "Pinellas", "Polk", "Putnam", "Santa Rosa", "Sarasota", "Seminole", "St. Johns", "St. Lucie", "Sumter", "Suwannee", "Taylor", "Union", "Volusia", "Wakulla", "Walton", "Washington"
];

const municipalitySource = "https://en.wikipedia.org/w/index.php?title=List_of_municipalities_in_Florida&action=raw";

function slug(value) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

function linkText(value) {
    const withoutMarkup = value.replace(/<[^>]+>/g, "").trim();
    const pipeIndex = withoutMarkup.lastIndexOf("|");
    return (pipeIndex >= 0 ? withoutMarkup.slice(pipeIndex + 1) : withoutMarkup)
        .replace(/\{\{[^}]+\}\}/g, "")
        .replace(/\[\[|\]\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseMunicipalities(wikitext) {
    const municipalities = [];
    const rows = wikitext.split("|-");

    for (const row of rows) {
        const links = [...row.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => linkText(match[1]));
        if (links.length < 2) continue;

        const name = links[0].replace(/, Florida$/, "").trim();
        const county = links[1].replace(/ County$/, "").trim();
        if (!name || !county || !countyNames.includes(county)) continue;
        municipalities.push({ name, county });
    }

    const unique = new Map();
    for (const municipality of municipalities) {
        unique.set(`${municipality.county}:${municipality.name}`, municipality);
    }
    return [...unique.values()].sort((left, right) => left.county.localeCompare(right.county) || left.name.localeCompare(right.name));
}

function localItems(locationLabel, county, municipality) {
    const jurisdiction = municipality ? `${municipality}, ${county} County` : `${county} County`;
    return [
        {
            title: "Local Application and Review Authority",
            statement: `Placeholder: verify the current plat application, review authority, and submission path for ${jurisdiction}.`,
            code: "Local requirements - verify",
            options: "YesNo"
        },
        {
            title: "Local Plat Format and Content",
            statement: `Placeholder: verify ${jurisdiction} sheet size, certificates, dedication language, notes, and supporting exhibits.`,
            code: "Local requirements - verify",
            options: "YesNo"
        },
        {
            title: "Local Engineering and Development Standards",
            statement: `Placeholder: verify ${jurisdiction} land development, infrastructure, access, drainage, and utility requirements that affect the plat.`,
            code: "Local requirements - verify",
            options: "YesNoN/A"
        },
        {
            title: "Local Fees and Recording Requirements",
            statement: `Placeholder: verify current ${jurisdiction} fees, recording prerequisites, approval signatures, and clerk acceptance requirements.`,
            code: "Local requirements - verify",
            options: "YesNo"
        },
        {
            title: "Local Conditions and Revision Responses",
            statement: `Placeholder: document ${jurisdiction} review comments, approval conditions, expiration dates, and final revision responses.`,
            code: "Local requirements - verify",
            options: "YesNoN/A"
        }
    ].map(item => ({ ...item, title: `${locationLabel}: ${item.title}` }));
}

function makeChecklist(baseline, county, municipality) {
    const locationLabel = municipality ? `${municipality}, ${county} County` : `${county} County`;
    const sections = structuredClone(baseline.Sections);
    sections.push({
        title: "Local Jurisdiction Requirements",
        subtitle: "Placeholder items for jurisdiction-specific research and review.",
        items: localItems(locationLabel, county, municipality)
    });

    return {
        Meta: {
            Category: "Land Development - Platting",
            Title: `${locationLabel} Platting Checklist`,
            WIP: true
        },
        Sections: sections
    };
}

function makeLink(county, municipality) {
    const locationLabel = municipality ? `${municipality}, ${county} County` : `${county} County`;
    const locationSlug = municipality ? `${slug(county)}/${slug(municipality)}` : `${slug(county)}`;
    return {
        name: `${locationLabel} Platting Checklist`,
        description: `Draft platting requirements and local placeholder review for ${locationLabel}.`,
        path: `/checklists/platting/${locationSlug}`,
        tags: ["Platting", "Checklist", "Florida", county, ...(municipality ? [municipality] : []), "Draft"],
        requiresAuth: false
    };
}

function makeIndexLink() {
    return {
        name: "Platting Checklists",
        description: "Browse county and municipality platting checklists.",
        path: "/platting",
        tags: ["Platting", "Checklist", "Florida"],
        requiresAuth: false
    };
}

async function fetchMunicipalities() {
    const response = await fetch(municipalitySource, {
        headers: { "user-agent": "WhitePointSurveyDocument/1.0" }
    });
    if (!response.ok) throw new Error(`Municipality source returned ${response.status}`);
    return parseMunicipalities(await response.text());
}

async function main() {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    const municipalities = await fetchMunicipalities();
    const locations = countyNames.map(county => ({
        county,
        municipalities: municipalities.filter(municipality => municipality.county === county).map(municipality => municipality.name)
    }));

    await mkdir(publicChecklistDirectory, { recursive: true });
    const links = [];
    for (const location of locations) {
        const countySlug = slug(location.county);
        await writeFile(join(publicChecklistDirectory, `${countySlug}.json`), `${JSON.stringify(makeChecklist(baseline, location.county), null, 4)}\n`);
        links.push(makeLink(location.county));

        for (const municipality of location.municipalities) {
            const municipalitySlug = slug(municipality);
            const outputPath = join(publicChecklistDirectory, countySlug, `${municipalitySlug}.json`);
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, `${JSON.stringify(makeChecklist(baseline, location.county, municipality), null, 4)}\n`);
            links.push(makeLink(location.county, municipality));
        }
    }

    await writeFile(locationCatalogPath, `${JSON.stringify({ source: municipalitySource, generatedAt: new Date().toISOString().slice(0, 10), locations }, null, 4)}\n`);

    const sectionReference = JSON.parse(await readFile(sectionReferencePath, "utf8"));
    const sections = sectionReference.Sections;
    const withoutPlatting = sections.filter(section => section.name !== "Platting");
    const checklistIndex = withoutPlatting.findIndex(section => section.name === "Checklists");
    withoutPlatting.splice(checklistIndex < 0 ? withoutPlatting.length : checklistIndex, 0, {
        name: "Platting",
        description: "County and municipality platting checklists with local requirements placeholders.",
        icon: "Map",
        requiresAuth: false,
        links: [makeIndexLink()]
    });
    await writeFile(sectionReferencePath, `${JSON.stringify({ ...sectionReference, Sections: withoutPlatting }, null, 4)}\n`);

    console.log(`Generated ${links.length} platting checklists for ${municipalities.length} municipalities across ${locations.length} counties.`);
}

if (process.argv.includes('--all')) {
    await generateAuthoredChecklists(siteDirectory);
    await main();
}
await generateAuthoredChecklists(siteDirectory);
