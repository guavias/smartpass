import { createBrowserRouter } from "react-router-dom";
import Shell from "./Shell";

import HeroPage from "../pages/HeroPage/HeroPage";
import ReservationFindPage from "../pages/ReservationFindPage";
import ReservationDetailPage from "../pages/ReservationDetailPage";
import AdminPage from "../pages/AdminPage";
import BookPassPage from "../pages/BookPassPage/BookPassPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HeroPage /> },
      { path: "find", element: <ReservationFindPage /> },
      { path: "reservation/:id", element: <ReservationDetailPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "book-pass", element: <BookPassPage /> },
    ],
  },
]);