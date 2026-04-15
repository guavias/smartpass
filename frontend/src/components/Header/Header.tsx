import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import styles from "./Header.module.css";
import logo from "../../assets/hilineLogo.png";

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
      { label: "PURCHASE PASS", href: "/book-pass" },
      { label: "VIEW DAY PASS", href: "/find" },
    ],
  },
  { key: "bookNow", label: "BOOK NOW", href: "/demo/overnight-booking" },
];

const CLICKABLE_TOP_LEVEL: NavKey[] = ["crappie", "bookNow"];

export default function Header({
  activeKey,
  onNavigate,
}: {
  activeKey?: NavKey;
  onNavigate?: (href: string) => void;
}) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMobileDropdowns, setOpenMobileDropdowns] = useState<Partial<Record<NavKey, boolean>>>({});

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenMobileDropdowns({});
  }, [location.pathname]);

  function isHrefActive(href: string) {
    if (href === "/") return location.pathname === "/";
    if (href === "/find") return location.pathname === "/find" || location.pathname.startsWith("/reservation/");
    if (href === "/book-pass") {
      return location.pathname === "/book-pass" || location.pathname === "/booking-confirmation";
    }
    if (href === "/demo/overnight-booking") {
      return location.pathname === "/demo/overnight-booking";
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  }

  function handleTopLevelNavigate(
    e: React.MouseEvent,
    href: string,
    isClickableTopLevel: boolean,
  ) {
    if (!isClickableTopLevel) {
      e.preventDefault();
      return;
    }

    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  }

  function handleSubNavigate(e: React.MouseEvent, href: string) {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
    setMobileMenuOpen(false);
  }

  function toggleMobileDropdown(key: NavKey) {
    setOpenMobileDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <img className={styles.logo} src={logo} alt="Hi-Line Resort" />

        <div className={styles.mobileBar}>
          <span className={styles.mobileBarSpacer} aria-hidden="true" />
          <img className={styles.mobileLogo} src={logo} alt="Hi-Line Resort" />
          <button
            type="button"
            className={styles.mobileMenuBtn}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span className={styles.mobileMenuLine} />
            <span className={styles.mobileMenuLine} />
            <span className={styles.mobileMenuLine} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Primary navigation">
          {NAV.map((item) => {
            const isActive = item.dropdown
              ? item.dropdown.some((sub) => isHrefActive(sub.href)) || item.key === activeKey
              : isHrefActive(item.href) || item.key === activeKey;
            const isClickableTopLevel = CLICKABLE_TOP_LEVEL.includes(item.key);
            const handleClick = (e: React.MouseEvent) =>
              handleTopLevelNavigate(e, item.href, isClickableTopLevel);

            if (item.dropdown) {
              return (
                <div key={item.key} className={styles.dropdown}>
                  <a
                    href={item.href}
                    onClick={handleClick}
                    aria-disabled={!isClickableTopLevel}
                    className={`${styles.link} ${isActive ? styles.active : ""}`}
                  >
                    {item.label}
                  </a>
                  <div
                    className={styles.dropdownMenu}
                    role="menu"
                    aria-label={`${item.label} menu`}
                  >
                    {item.dropdown.map((sub) => {
                      const isSubActive = isHrefActive(sub.href);
                      return (
                      <a
                        key={sub.href}
                        href={sub.href}
                        className={`${styles.dropdownItem} ${isSubActive ? styles.dropdownItemActive : ""}`}
                        onClick={(e) => handleSubNavigate(e, sub.href)}
                      >
                        {sub.label}
                      </a>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <a
                key={item.key}
                href={item.href}
                onClick={handleClick}
                aria-disabled={!isClickableTopLevel}
                className={`${styles.link} ${isActive ? styles.active : ""}`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <nav
          className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ""}`}
          aria-label="Mobile navigation"
        >
          {NAV.map((item) => {
            const isActive = item.dropdown
              ? item.dropdown.some((sub) => isHrefActive(sub.href)) || item.key === activeKey
              : isHrefActive(item.href) || item.key === activeKey;
            const isClickableTopLevel = CLICKABLE_TOP_LEVEL.includes(item.key);
            const isDropdownOpen = !!openMobileDropdowns[item.key];

            if (item.dropdown) {
              return (
                <div key={item.key} className={styles.mobileMenuGroup}>
                  <div className={styles.mobileMenuGroupHeader}>
                    <a
                      href={item.href}
                      onClick={(e) => handleTopLevelNavigate(e, item.href, isClickableTopLevel)}
                      aria-disabled={!isClickableTopLevel}
                      className={`${styles.mobileMenuItem} ${isActive ? styles.active : ""}`}
                    >
                      {item.label}
                    </a>
                    <button
                      type="button"
                      className={`${styles.mobileChevronBtn} ${isDropdownOpen ? styles.mobileChevronOpen : ""}`}
                      aria-label={`Toggle ${item.label} submenu`}
                      aria-expanded={isDropdownOpen}
                      onClick={() => toggleMobileDropdown(item.key)}
                    >
                      ▾
                    </button>
                  </div>

                  {isDropdownOpen && (
                    <div className={styles.mobileSubmenu}>
                      {item.dropdown.map((sub) => {
                        const isSubActive = isHrefActive(sub.href);
                        return (
                        <a
                          key={sub.href}
                          href={sub.href}
                          className={`${styles.mobileSubmenuItem} ${isSubActive ? styles.mobileSubmenuItemActive : ""}`}
                          onClick={(e) => handleSubNavigate(e, sub.href)}
                        >
                          {sub.label}
                        </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <a
                key={item.key}
                href={item.href}
                onClick={(e) => handleTopLevelNavigate(e, item.href, isClickableTopLevel)}
                aria-disabled={!isClickableTopLevel}
                className={`${styles.mobileMenuItem} ${isActive ? styles.active : ""}`}
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