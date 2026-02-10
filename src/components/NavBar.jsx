import { Link, useLocation, useSearchParams } from "react-router-dom";

const closeIcon =
  "data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3crect%20x='0.5'%20y='0.5'%20width='23'%20height='23'%20rx='11.5'%20stroke='black'/%3e%3cpath%20d='M15.544%2016.516L11.92%2012.868L8.272%2016.516L7.072%2015.34L10.72%2011.692L7.072%208.044L8.272%206.868L11.92%2010.492L15.544%206.868L16.744%208.044L13.096%2011.692L16.744%2015.34L15.544%2016.516Z'%20fill='%231A1A1A'/%3e%3c/svg%3e";

export default function NavBar() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const activeFilter =
    searchParams.get("client") ||
    searchParams.get("project") ||
    searchParams.get("category") ||
    searchParams.get("discipline");

  function clearFilters() {
    const params = new URLSearchParams(searchParams);
    ["client", "project", "category", "discipline"].forEach((key) => params.delete(key));
    const url = new URL("/gallery", window.location.origin);
    if ([...params.keys()].length) {
      url.search = params.toString();
    }
    window.location.replace(url.toString());
  }

  return (
    <nav>
      <div className="flex gap-5 lg:gap-28 w-full">
        <Link to="/">R–––M</Link>
        {location.pathname.includes("project") ? (
          <Link to="#" className="underline">
            Project
          </Link>
        ) : (
          <>
            <Link to="/gallery">Gallery</Link>
            <Link to="/filters">Filters</Link>
          </>
        )}

        {activeFilter && (
          <button type="button" className="filter" onClick={clearFilters}>
            <img src={closeIcon} alt="" className="size-4" />
            {activeFilter}
          </button>
        )}
        <Link to="/about" className="ml-auto">
          About
        </Link>
      </div>

      {activeFilter && (
        <button type="button" className="filter-mobile" onClick={clearFilters}>
          <img src={closeIcon} alt="" className="size-4" />
          {activeFilter}
        </button>
      )}
    </nav>
  );
}
