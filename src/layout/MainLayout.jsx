import { useEffect, useState } from "react";
import { Outlet, useNavigation } from "react-router-dom";
import NavBar from "../components/NavBar";

export default function MainLayout() {
  const navigation = useNavigation();
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
      <main>
        {isLoading && "Loading"}
        <Outlet />
      </main>
    </>
  );
}
