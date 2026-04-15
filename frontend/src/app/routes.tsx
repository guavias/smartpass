import { createBrowserRouter } from "react-router-dom";
import Shell from "./Shell";

import HeroPage from "../pages/HeroPage/HeroPage";
import ReservationFindPage from "../pages/ReservationFindPage/ReservationFindPage";
import ReservationDetailPage from "../pages/ReservationDetailPage/ReservationDetailPage";
import BookPassPage from "../pages/BookPassPage/BookPassPage";
import BookingConfirmationPage from "../pages/BookingConfirmationPage/BookingConfirmationPage";
import OvernightBookingDemoPage from "../pages/OvernightBookingDemoPage/OvernightBookingDemoPage";
import PaymentPage from "../pages/PaymentPage/PaymentPage";
import OvernightBookingConfirmationPage from "../pages/OvernightBookingConfirmationPage/OvernightBookingConfirmationPage";
import Login from "../pages/Admin/Login";
import Dashboard from "../pages/Admin/Dashboard/Dashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HeroPage /> },
      { path: "find", element: <ReservationFindPage /> },
      { path: "reservation/find", element: <ReservationFindPage /> },
      { path: "book-pass", element: <BookPassPage /> },
      { path: "book", element: <BookPassPage /> },
      { path: "overnight-booking", element: <OvernightBookingDemoPage /> },
      { path: "payment", element: <PaymentPage /> },
      { path: "overnight-confirmation", element: <OvernightBookingConfirmationPage /> },
      { path: "booking-confirmation", element: <BookingConfirmationPage /> },
      { path: "confirmation", element: <BookingConfirmationPage /> },
      { path: "reservation/:id", element: <ReservationDetailPage /> },
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