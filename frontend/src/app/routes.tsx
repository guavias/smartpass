import { createBrowserRouter } from "react-router-dom";
import Shell from "./Shell";

import HeroPage from "../pages/HeroPage";
import BookingPage from "../pages/BookingPage";
import ReservationFindPage from "../pages/ReservationFindPage";
import ReservationDetailPage from "../pages/ReservationDetailPage";
import AdminPage from "../pages/AdminPage";
import BookPassPage from "../pages/BookPassPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HeroPage /> },
      { path: "book", element: <BookingPage /> },
      { path: "find", element: <ReservationFindPage /> },
      { path: "reservation/:id", element: <ReservationDetailPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "book-pass", element: <BookPassPage /> },
    ],
  },
]);