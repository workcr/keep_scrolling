import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigation } from "react-router-dom";
import NavBar from "../components/NavBar";
import SoundToggle from "../components/SoundToggle";

// Pages where hovering a video plays its sound.
const HOVER_SOUND_PATHS = new Set(["/", "/gallery"]);

export default function MainLayout() {
  const navigation = useNavigation();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const isLoading = Boolean(navigation.location);

  useEffect(() => {
    if (isLoading) {
      setShow(true);
      return;
    }
    const timer = setTimeout(() => setShow(false), 300);
    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-transparent">
        <div
          className="h-2 bg-black transition-[width,opacity] duration-300 ease-out"
          style={{ width: isLoading ? "90%" : "0%", opacity: show ? 1 : 0 }}
        />
      </div>
      <NavBar />
      {HOVER_SOUND_PATHS.has(location.pathname) ? <SoundToggle /> : null}
      <main>
        {isLoading && "Loading"}
        <Outlet />
      </main>
    </>
  );
}
