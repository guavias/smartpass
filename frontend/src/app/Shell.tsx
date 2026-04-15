import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Header, { NavKey } from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import { isEmbedMode } from "./embed";

function activeKeyFromPath(pathname: string): NavKey {
  if (pathname.startsWith("/demo/overnight-booking") || pathname.startsWith("/demo/payment") || pathname.startsWith("/demo/booking-confirmation")) return "bookNow";
  if (pathname.startsWith("/book-pass")) return "crappie";
  if (pathname.startsWith("/admin")) return "crappie"; //keep crappie highlighted
  if (pathname.startsWith("/find") || pathname.startsWith("/reservation")) return "crappie";
  return "crappie";
}

export default function Shell() {
  const embed = isEmbedMode();
  const nav = useNavigate();
  const loc = useLocation();

  const activeKey = activeKeyFromPath(loc.pathname);

  return (
    <div style={{ minHeight: "100vh", background: embed ? "transparent" : "#fff" }}>
      {!embed && (
        <Header
          activeKey={activeKey}
          onNavigate={(href) => nav(href)}
        />
      )}

      <main style={{ padding: embed ? 0 : "0 24px 0" }}>
        <Outlet />
      </main>

      {!embed && <Footer />}
    </div>
  );
}