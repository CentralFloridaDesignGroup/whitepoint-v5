import React, { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import { geoPath, geoMercator } from 'd3-geo';
import type { GeometryObject, Topology } from 'topojson-specification';
import { coreCountyNames, secondaryCountyNames, type CountyName } from '../../data/serviceCounties';

export type CountyFeature = {
  type: 'Feature';
  id: string;
  properties: Record<string, unknown> | null;
  geometry: unknown;
};

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

const CORE_COUNTIES = new Set<string>(coreCountyNames);
const SECONDARY_COUNTIES = new Set<string>(secondaryCountyNames);
const CORE_COUNTY_NAME_SET = new Set<CountyName>(coreCountyNames);
const SECONDARY_COUNTY_NAME_SET = new Set<CountyName>(secondaryCountyNames);

// Office coordinates as [lon, lat] pairs (matches geo projection input)
const OFFICES = [{ coords: [-81.3911, 28.662], title: 'Main Office' }];

const MAP_WIDTH = 600;
const MAP_HEIGHT = 400;
const MAP_CENTER: [number, number] = [-83.83315, 27.6986];
const MAP_SCALE = 3000;

export function CoreCounties() {
  const [counties, setCounties] = useState<CountyFeature[]>([]);



  useEffect(() => {
    const controller = new AbortController();

    fetch(GEO_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const topology = data as Topology<{ counties: GeometryObject }>;
        const collection = feature(topology, topology.objects.counties);
        const allCounties =
          collection.type === 'FeatureCollection'
            ? (collection.features as CountyFeature[])
            : ([collection] as CountyFeature[]);
        const fl = allCounties.filter((f) => f.id && String(f.id).startsWith('12'));
        const core = fl.filter((f) => CORE_COUNTIES.has(String(f.id)));
        setCounties(core);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCounties([]);
      });

    return () => controller.abort();
  }, []);

  return counties;
}

export function SecondaryCounties() {
  const [counties, setCounties] = useState<CountyFeature[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(GEO_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const topology = data as Topology<{ counties: GeometryObject }>;
        const collection = feature(topology, topology.objects.counties);
        const allCounties =
          collection.type === 'FeatureCollection'
            ? (collection.features as CountyFeature[])
            : ([collection] as CountyFeature[]);
        const fl = allCounties.filter((f) => f.id && String(f.id).startsWith('12'));
        const secondary = fl.filter((f) => SECONDARY_COUNTIES.has(String(f.id)));
        setCounties(secondary);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCounties([]);
      });

    return () => controller.abort();
  }, []);

  return counties;
}

export function CountyServiceMap() {
  const [features, setFeatures] = useState<CountyFeature[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(GEO_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const topology = data as Topology<{ counties: GeometryObject }>;
        const collection = feature(topology, topology.objects.counties);
        const counties =
          collection.type === 'FeatureCollection'
            ? (collection.features as CountyFeature[])
            : ([collection] as CountyFeature[]);
        const fl = counties.filter((f) => f.id && String(f.id).startsWith('12'));
        setFeatures(fl);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFeatures([]);
      });

    return () => controller.abort();
  }, []);

  const projection = useMemo(
    () => geoMercator().center(MAP_CENTER).scale(MAP_SCALE).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]),
    []
  );
  const path = useMemo(() => geoPath().projection(projection), [projection]);

  const showTooltip = (text: string) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.display = 'block';
    tooltip.textContent = text;
  };

  const hideTooltip = () => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.display = 'none';
  };

  const positionTooltip = (event: React.MouseEvent<SVGElement, MouseEvent>) => {
    const tooltip = tooltipRef.current;
    const svg = event.currentTarget.ownerSVGElement;
    if (!tooltip || !svg) return;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    tooltip.style.left = `${(x / rect.width) * 100}%`;
    tooltip.style.top = `${(y / rect.height) * 100}%`;
  };

  return (
    <div className="w-full relative">
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        id="map-tooltip"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          transform: 'translate(-50%, -120%)',
          display: 'none',
        }}
      />

      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="transparent" />
        {features.map((f) => {
          const id = String(f.id);
          // Try to get a readable name from properties
          const props = f.properties ?? {};
          const rawName = (props.name as string) || (props.NAME as string) || (props.county as string) || id;
          const name = rawName || id;
          const isCore = CORE_COUNTIES.has(id) || CORE_COUNTY_NAME_SET.has(name as CountyName);
          const isSecondary = SECONDARY_COUNTIES.has(id) || SECONDARY_COUNTY_NAME_SET.has(name as CountyName);
          const fill = isCore ? 'var(--color-primary)' : isSecondary ? 'var(--color-primary-400)' : 'var(--color-primary-100)';
          const hover = isCore ? 'var(--color-primary-700)' : isSecondary ? 'var(--color-primary-300)' : 'var(--color-primary-200)';

          return (
            <path
              key={id}
              d={path(f as Parameters<typeof path>[0]) ?? undefined}
              fill={fill}
              stroke="#000000"
              strokeWidth={0.25}
              onMouseEnter={(e) => {
                e.currentTarget.style.fill = hover;
                showTooltip(name);
              }}
              onMouseMove={(e) => {
                positionTooltip(e);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.fill = fill;
                hideTooltip();
              }}
            />
          );
        })}
        {OFFICES.map(({ coords, title }, i) => {
          const p = projection([coords[0] ?? 0, coords[1] ?? 0]);
          if (!p) return null;
          const [x, y] = p;
          const size = 20;
          const half = size / 2;
          return (
            <g
              key={`office-${i}`}
              transform={`translate(${x - half}, ${y - half})`}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onMouseEnter={(e) => {
                showTooltip(title);
                positionTooltip(e);
              }}
              onMouseLeave={hideTooltip}
            >
              {/* white circular background so logo is visible over map */}
              <circle cx={half} cy={half} r={half} fill="#ffffff" stroke="#e6e6e6" />
              <image href="/White_Point_Logo.svg" width={size} height={size} />
              <title>{title}</title>
            </g>
          );
        })}
      </svg>
      <style>{`
        #map-tooltip{background:rgba(15,23,42,0.9);color:#fff;padding:6px 8px;border-radius:6px;font-size:12px;white-space:nowrap;}
      `}</style>
    </div>
  );
}
