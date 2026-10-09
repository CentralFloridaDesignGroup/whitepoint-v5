import { Combobox } from "@whitepoint/ui/input";
import { matchPath, NavLink, useLocation, useNavigate } from "react-router-dom";

type LinkTab = { label: string; to: string; end?: boolean };
type ButtonTab = { label: string; value: string };

type TabNavigationProps = {
  tabs: LinkTab[] | ButtonTab[];
  ariaLabel: string;
} & (
  | { activeValue?: never; onChange?: never }
  | { activeValue: string; onChange: (value: string) => void }
);

const activeClassName =
  "rounded-lg px-3 py-2 text-sm font-medium bg-sky-800 text-white";
const inactiveClassName =
  "rounded-lg px-3 py-2 text-sm font-medium bg-white text-slate-700 hover:bg-slate-100";

export function TabNavigation(props: TabNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isButtonNavigation = props.onChange !== undefined;
  const routeTabs = props.tabs.filter(
    (tab): tab is LinkTab => "to" in tab,
  );
  const activeRouteTab = [...routeTabs]
    .sort((left, right) => right.to.length - left.to.length)
    .find((tab) =>
      matchPath(
        { path: tab.to, end: tab.end ?? false },
        location.pathname,
      ),
    );
  const dropdownOptions = props.tabs.map((tab) =>
    "to" in tab
      ? { key: tab.label, value: tab.to }
      : { key: tab.label, value: tab.value },
  );
  const selectedTab = isButtonNavigation
    ? props.activeValue
    : activeRouteTab?.to ?? "";

  return (
    <>
      <nav
        aria-label={props.ariaLabel}
        className="hidden md:flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      >
        {props.tabs.map((tab) => {
          if ("to" in tab) {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  isActive ? activeClassName : inactiveClassName
                }
              >
                {tab.label}
              </NavLink>
            );
          }

          const isActive = props.activeValue === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => props.onChange?.(tab.value)}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? activeClassName : inactiveClassName}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {/* Combobox dropdown for mobile view */}
      <div className="md:hidden">
        <Combobox
          field={`${props.ariaLabel.replace(/\s+/g, "")}TabSelection`}
          value={selectedTab}
          onChange={(_, value) => {
            if (isButtonNavigation) {
              props.onChange?.(value);
            } else {
              navigate(value);
            }
          }}
          selections={dropdownOptions}
          label="Select tab"
        />
      </div>
    </>
  );
}
