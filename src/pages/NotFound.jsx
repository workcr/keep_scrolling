import Seo from "../components/Seo";
import { SITE } from "../site";

export default function NotFound() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <Seo title={`Page not found — ${SITE.name}`} noindex />
      <span className="text-9xl font-extrabold">404</span>
      <span className="font-light text-sm">Page not found</span>
    </div>
  );
}

