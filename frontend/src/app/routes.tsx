import { createBrowserRouter } from "react-router-dom";
import Shell from "./Shell";

import HeroPage from "../pages/HeroPage/HeroPage";
import ReservationFindPage from "../pages/ReservationFindPage/ReservationFindPage";
import ReservationDetailPage from "../pages/ReservationDetailPage/ReservationDetailPage";
import BookPassPage from "../pages/BookPassPage/BookPassPage";
import BookingConfirmationPage from "../pages/BookingConfirmationPage/BookingConfirmationPage";
import Login from "../pages/Admin/Login";
import Dashboard from "../pages/Admin/Dashboard/Dashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HeroPage /> },
      { path: "find", element: <ReservationFindPage /> },
      { path: "reservation/:id", element: <ReservationDetailPage /> },
      { path: "book-pass", element: <BookPassPage /> },
      { path: "booking-confirmation", element: <BookingConfirmationPage /> },
    ],
  },
  {
    path: "/admin/login",
    element: <Login />,
  },
  {
    path: "/admin/dashboard",
    element: <Dashboard />,
  },
]);