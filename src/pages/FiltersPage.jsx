import { Link, useLoaderData } from "react-router-dom";

export default function FiltersPage() {
  const { items } = useLoaderData();
  const unique = (key) =>
    Array.from(
      new Set(
        items
          .map((item) => item?.[key])
          .filter((value) => value != null && String(value).trim() !== "")
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));

  const groups = {
    client: unique("client"),
    project: unique("project"),
    category: unique("category"),
    discipline: unique("discipline")
  };

  return (
    <div className="filters">
      <div className="container mx-auto">
        {!items && (
          <div className="my-4 rounded bg-red-50 p-3 text-sm text-red-700">Error loading filters</div>
        )}
        <div className="grid grid-cols-3 lg:grid-cols-8 px-8 space-y-16 lg:space-y-0">
          <div>Client</div>
          <div className="col-span-2 lg:col-span-1">
            <ul>
              {groups.client.map((value) => (
                <li key={`client-${value}`}>
                  <Link to={`/gallery?client=${encodeURIComponent(value)}`} className="lg:ml-2">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>Project</div>
          <div className="col-span-2 lg:col-span-1">
            <ul>
              {groups.project.map((value) => (
                <li key={`project-${value}`}>
                  <Link to={`/gallery?project=${encodeURIComponent(value)}`} className="lg:ml-2">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>Category</div>
          <div className="col-span-2 lg:col-span-1">
            <ul>
              {groups.category.map((value) => (
                <li key={`category-${value}`}>
                  <Link to={`/gallery?category=${encodeURIComponent(value)}`} className="lg:ml-2">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>Discipline</div>
          <div className="col-span-2 lg:col-span-1">
            <ul>
              {groups.discipline.map((value) => (
                <li key={`discipline-${value}`}>
                  <Link to={`/gallery?discipline=${encodeURIComponent(value)}`} className="lg:ml-2">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
