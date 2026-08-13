import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { filtersLoader, homeLoader, projectLoader } from "./api";
import MainLayout from "./layout/MainLayout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import "./styles.css";

const FiltersPage = lazy(() => import("./pages/FiltersPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const ProjectPage = lazy(() => import("./pages/ProjectPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));

function lazyPage(Page) {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <MainLayout />,
      hydrateFallbackElement: <div />,
      children: [
        {
          index: true,
          element: <Home />,
          loader: homeLoader,
          errorElement: <NotFound />
        },
        {
          path: "/filters",
          element: lazyPage(FiltersPage),
          loader: filtersLoader,
          errorElement: <NotFound />
        },
        {
          path: "/gallery",
          element: lazyPage(GalleryPage),
          loader: filtersLoader,
          errorElement: <NotFound />
        },
        {
          path: "/project/:id",
          element: lazyPage(ProjectPage),
          loader: projectLoader,
          errorElement: <NotFound />
        },
        {
          path: "/about",
          element: lazyPage(AboutPage)
        }
      ]
    }
  ],
  {
    basename: import.meta.env.BASE_URL
  }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
