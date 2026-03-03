import styles from "./Header.module.css";
import logo from "../../assets/hi-lineLogo.avif";

export type NavKey =
  | "home"
  | "about"
  | "accommodations"
  | "goodTimes"
  | "fishing"
  | "krabKingz"
  | "map"
  | "crappie"
  | "bookNow";

//dropdown
export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  dropdown?: Array<{ label: string; href: string }>;
};

const NAV: NavItem[] = [
  { key: "home", label: "HOME", href: "/" },
  { key: "about", label: "ABOUT", href: "/about" },
  { key: "accommodations", label: "ACCOMMODATIONS", href: "/accommodations" },
  { key: "goodTimes", label: "GOOD TIMES", href: "/good-times" },
  { key: "fishing", label: "FISHING", href: "/fishing" },
  { key: "krabKingz", label: "KRAB KINGZ", href: "/krab-kingz" },
  { key: "map", label: "MAP", href: "/map" },
  {
    key: "crappie",
    label: "CRAPPIE HOUSE ACCESS",
    href: "/",
    dropdown: [
      { label: "BOOK PASS", href: "/book-pass" },
      { label: "VIEW RESERVATION", href: "/find" },
    ],
  },
  { key: "bookNow", label: "BOOK NOW", href: "/book" },
];

export default function Header({
  activeKey = "crappie",
  onNavigate,
}: {
  activeKey?: NavKey;
  onNavigate?: (href: string) => void;
}) {

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <img className={styles.logo} src={logo} alt="Hi-Line Resort" />

        <nav className={styles.nav} aria-label="Primary navigation">
          {NAV.map((item) => {
            const isActive = item.key === activeKey;
            const handleClick = (e: React.MouseEvent) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(item.href);
              }
            };

            if (item.dropdown) {
              return (
                <div key={item.key} className={styles.dropdown}>
                  <a
                    href={item.href}
                    onClick={handleClick}
                    className={`${styles.link} ${isActive ? styles.active : ""}`}
                  >
                    {item.label}
                  </a>
                  <div
                    className={styles.dropdownMenu}
                    role="menu"
                    aria-label={`${item.label} menu`}
                  >
                    {item.dropdown.map((sub) => (
                      <a
                        key={sub.href}
                        href={sub.href}
                        className={styles.dropdownItem}
                        onClick={(e) => {
                          if (onNavigate) {
                            e.preventDefault();
                            onNavigate(sub.href);
                          }
                        }}
                      >
                        {sub.label}
                      </a>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <a
                key={item.key}
                href={item.href}
                onClick={onNavigate ? handleClick : undefined}
                className={`${styles.link} ${isActive ? styles.active : ""}`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}