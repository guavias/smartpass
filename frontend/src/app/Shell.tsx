import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Header, { NavKey } from "../components/Header/Header";
import { isEmbedMode } from "./embed";

function activeKeyFromPath(pathname: string): NavKey {
  if (pathname.startsWith("/book")) return "bookNow";
  if (pathname.startsWith("/admin")) return "crappie"; // keep crappie highlighted
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

      <main style={{ padding: embed ? 0 : 24 }}>
        <Outlet />
      </main>
    </div>
  );
}