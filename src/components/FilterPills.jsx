import { Link } from "react-router-dom";
import { titleCase } from "../site";
import { slugifyProjectName } from "../utils";

export default function FilterPills({ items }) {
  const projectNames = [...new Set(items.map((item) => item.project).filter(Boolean))];

  return (
    <section className="filters">
      <ul>
        {projectNames.map((name) => (
          <li key={name}>
            <Link to={`/project/${slugifyProjectName(name)}`}>{titleCase(name)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

