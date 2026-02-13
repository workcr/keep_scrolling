import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { filtersLoader, projectLoader } from "./api";
import MainLayout from "./layout/MainLayout";
import Home from "./pages/Home";
import FiltersPage from "./pages/FiltersPage";
import GalleryPage from "./pages/GalleryPage";
import ProjectPage from "./pages/ProjectPage";
import AboutPage from "./pages/AboutPage";
import NotFound from "./pages/NotFound";
import "./styles.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <MainLayout />,
      children: [
        {
          index: true,
          element: <Home />,
          errorElement: <NotFound />
        },
        {
          path: "/filters",
          element: <FiltersPage />,
          loader: filtersLoader,
          errorElement: <NotFound />
        },
        {
          path: "/gallery",
          element: <GalleryPage />,
          loader: filtersLoader,
          errorElement: <NotFound />
        },
        {
          path: "/project/:id",
          element: <ProjectPage />,
          loader: projectLoader,
          errorElement: <NotFound />
        },
        {
          path: "/about",
          element: <AboutPage />
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
