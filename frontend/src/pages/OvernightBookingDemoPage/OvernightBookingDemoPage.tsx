import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import DaysRangePicker from "../../components/Form/DaysRangePicker";
import styles from "./OvernightBookingDemoPage.module.css";

type DateRangeState = {
  startDate?: Date;
  endDate?: Date;
  days: number;
};

const STANDARD_RATE = 145;
const TX_TAX_RATE = 0.0825;

const galleryModules = import.meta.glob("../../assets/cabin-gallery/*.jpg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const GALLERY_IMAGES = Object.entries(galleryModules)
  .sort(([pathA], [pathB]) => {
    const nameA = pathA.split("/").pop() ?? pathA;
    const nameB = pathB.split("/").pop() ?? pathB;
    const numA = Number((nameA.match(/cabin-?(\d+)/i) ?? [])[1] ?? Number.NaN);
    const numB = Number((nameB.match(/cabin-?(\d+)/i) ?? [])[1] ?? Number.NaN);

    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      return numA - numB;
    }

    return nameA.localeCompare(nameB);
  })
  .map(([, src]) => src)
  .slice(0, 6);

const AMENITIES = [
  "Waterfront",
  "Guest Controlled AC and Heating",
  "TV",
  "Microwave",
  "Coffee/Tea Maker",
  "Shower",
  "Kitchen",
  "Dining Table and Chairs",
  "Private Bathroom",
  "Kitchen Supplies",
  "Ceiling Fan",
  "Closets in Room",
  "Outdoor Picnic Table",
  "Barbeque Grills",
  "Outdoor Space",
  "Smoke Detectors",
  "Pets Allowed",
  "The Restaurant ... Krab Kingz on the Lake 325.248.1233 and KrabKingzOnTheLake.com",
  "Free WiFi",
  "Crappie Fishing House",
  "Boat Ramp",
  "Lake Pier",
  "Lake \"beach area\"",
  "General Store",
  "Bait Shop",
  "Recreation Hall",
  "Swimming Pool",
  "Outdoor games & Tree swing",
  "Community fire pit",
  "HiLine Nature Path",
  "Resort Public Showers",
  "OnSite Laundry",
  "Adjacent to 400 acre LCRA State Park",
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, count: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + count);
  return value;
}

function diffNights(checkIn: Date, checkOut: Date): number {
  const ms = startOfDay(checkOut).getTime() - startOfDay(checkIn).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}



function nightsFromRange(range: DateRangeState): number {
  return Math.max(1, range.days);
}

function formatEditableDate(date?: Date): string {
  if (!date) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function parseEditableDate(raw: string): Date | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function OvernightBookingDemoPage() {
  const navigate = useNavigate();
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [pets, setPets] = useState(0);
  const [range, setRange] = useState<DateRangeState>({
    startDate: undefined,
    endDate: undefined,
    days: 1,
  });
  const [errors, setErrors] = useState<{ submit?: string; dates?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isGuestsOpen, setIsGuestsOpen] = useState(false);
  const [draftAdults, setDraftAdults] = useState(adults);
  const [draftChildren, setDraftChildren] = useState(children);
  const [draftPets, setDraftPets] = useState(pets);
  const [checkInInput, setCheckInInput] = useState("");
  const [checkOutInput, setCheckOutInput] = useState("");
  const guestsDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCheckInInput(formatEditableDate(range.startDate));
    setCheckOutInput(range.endDate ? formatEditableDate(addDays(range.endDate, 1)) : "");
  }, [range]);

  useEffect(() => {
    if (!isGuestsOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!guestsDropdownRef.current?.contains(event.target as Node)) {
        setIsGuestsOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isGuestsOpen]);

  function moveImage(step: number) {
    if (GALLERY_IMAGES.length === 0) return;
    setActiveImage((prev) => (prev + step + GALLERY_IMAGES.length) % GALLERY_IMAGES.length);
  }

  function openGuestsDropdown() {
    setDraftAdults(adults);
    setDraftChildren(children);
    setDraftPets(pets);
    setIsGuestsOpen(true);
  }

  function applyGuestSelection() {
    setAdults(Math.max(1, draftAdults));
    setChildren(Math.max(0, draftChildren));
    setPets(Math.max(0, draftPets));
    setIsGuestsOpen(false);
  }

  function commitCheckInInput() {
    const parsedCheckIn = parseEditableDate(checkInInput);
    if (!parsedCheckIn) {
      setErrors((prev) => ({ ...prev, dates: "Use MM/DD/YYYY format for dates." }));
      return;
    }

    const parsedCheckOut = parseEditableDate(checkOutInput);
    if (parsedCheckOut && parsedCheckOut > parsedCheckIn) {
      const nights = Math.max(1, diffNights(parsedCheckIn, parsedCheckOut));
      const normalizedEnd = addDays(parsedCheckIn, nights - 1);
      setRange({ startDate: parsedCheckIn, endDate: normalizedEnd, days: nights });
    } else {
      const nights = 1;
      const normalizedEnd = addDays(parsedCheckIn, nights - 1);
      setRange({ startDate: parsedCheckIn, endDate: normalizedEnd, days: nights });
    }

    setErrors((prev) => ({ ...prev, dates: undefined }));
  }

  function commitCheckOutInput() {
    const parsedCheckOut = parseEditableDate(checkOutInput);
    if (!parsedCheckOut) {
      setErrors((prev) => ({ ...prev, dates: "Use MM/DD/YYYY format for dates." }));
      return;
    }

    const parsedCheckIn = parseEditableDate(checkInInput);
    const startDate = parsedCheckIn ?? range.startDate;
    if (!startDate) {
      setErrors((prev) => ({ ...prev, dates: "Enter a check-in date first." }));
      return;
    }

    const nightDiff = diffNights(startDate, parsedCheckOut);
    if (nightDiff < 1) {
      setErrors((prev) => ({ ...prev, dates: "Check-out must be after check-in." }));
      return;
    }

    const nights = Math.max(1, nightDiff);
    const normalizedEnd = addDays(startDate, nights - 1);
    setRange({ startDate, endDate: normalizedEnd, days: nights });
    setErrors((prev) => ({ ...prev, dates: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!range.startDate || !range.endDate) {
      setErrors({ submit: "Select an arrival and departure date in the calendar." });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const nights = nightsFromRange(range);
    const subtotal = STANDARD_RATE * nights;
    const tax = +(subtotal * TX_TAX_RATE).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    const checkIn = range.startDate;
    const checkOut = addDays(range.endDate!, 1);

    // Navigate to payment page with booking details
    // Reservation ID will be generated AFTER payment succeeds, not now
    navigate("/payment", {
      state: {
        guestName: "Cabin Guest",
        guestEmail: "",
        guestPhone: "",
        adults,
        children,
        pets,
        checkIn: checkIn?.toISOString(),
        checkOut: checkOut.toISOString(),
        nights,
        stayType: "Cabin Studio",
        nightlyRate: STANDARD_RATE,
        subtotal,
        tax,
        total,
      },
    });
  }

  const nights = nightsFromRange(range);
  const total = STANDARD_RATE * nights;

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <form className={styles.layout} onSubmit={handleSubmit} noValidate>
          <Card className={styles.leftCard}>
            <section className={styles.leftPanel}>
              <h2 className={styles.unitTitle}>Cabin Studios</h2>
              <div className={styles.stockBadge}>ONLY 2 LEFT</div>

              <div className={styles.rateBox}>
                <div className={styles.rateLabel}>Standard Rate</div>
                <div className={styles.rateValue}>{money(STANDARD_RATE)} / night</div>
                <div className={styles.rateTotal}>{money(total)} Total</div>
              </div>

              <div className={styles.heroFieldsRow}>
                <div className={styles.guestsControl} ref={guestsDropdownRef}>
                  <label className={styles.fieldLabel} htmlFor="left-guests">GUESTS</label>
                  <button
                    type="button"
                    id="left-guests"
                    className={styles.fieldInputButton}
                    value={`${adults} Adults, ${children} Children, ${pets} Pets`}
                    onClick={openGuestsDropdown}
                  >
                    {adults} Adults, {children} Children, {pets} Pets
                  </button>

                  {isGuestsOpen ? (
                    <div className={styles.guestsDropdown}>
                      <div className={styles.guestRow}>
                        <span>Adults</span>
                        <div className={styles.counterControls}>
                          <button type="button" onClick={() => setDraftAdults((prev) => Math.max(1, prev - 1))}>-</button>
                          <span>{draftAdults}</span>
                          <button type="button" onClick={() => setDraftAdults((prev) => prev + 1)}>+</button>
                        </div>
                      </div>
                      <div className={styles.guestRow}>
                        <span>Children</span>
                        <div className={styles.counterControls}>
                          <button type="button" onClick={() => setDraftChildren((prev) => Math.max(0, prev - 1))}>-</button>
                          <span>{draftChildren}</span>
                          <button type="button" onClick={() => setDraftChildren((prev) => prev + 1)}>+</button>
                        </div>
                      </div>
                      <div className={styles.guestRow}>
                        <span>Pets</span>
                        <div className={styles.counterControls}>
                          <button type="button" onClick={() => setDraftPets((prev) => Math.max(0, prev - 1))}>-</button>
                          <span>{draftPets}</span>
                          <button type="button" onClick={() => setDraftPets((prev) => prev + 1)}>+</button>
                        </div>
                      </div>
                      <button type="button" className={styles.applyGuestsBtn} onClick={applyGuestSelection}>
                        Apply
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className={styles.datesPanel}>
                  <div className={styles.datesHead}>
                    <label className={styles.fieldLabel}>DATES</label>
                    <span className={styles.nightsBadge}>{nights} {nights === 1 ? "NIGHT" : "NIGHTS"}</span>
                  </div>

                  <div className={styles.datesBox}>
                    <div>
                      <div className={styles.datesKey}>CHECK IN</div>
                      <input
                        className={styles.datesValueInput}
                        value={checkInInput}
                        placeholder="Select a date"
                        onChange={(event) => setCheckInInput(event.target.value)}
                        onBlur={commitCheckInInput}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitCheckInInput();
                          }
                        }}
                      />
                    </div>
                    <div className={styles.datesArrow}>➜</div>
                    <div>
                      <div className={styles.datesKey}>CHECK OUT</div>
                      <input
                        className={styles.datesValueInput}
                        value={checkOutInput}
                        placeholder="Select a date"
                        onChange={(event) => setCheckOutInput(event.target.value)}
                        onBlur={commitCheckOutInput}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitCheckOutInput();
                          }
                        }}
                      />
                    </div>
                  </div>
                  {errors.dates ? <p className={styles.error}>{errors.dates}</p> : null}
                </div>
              </div>

              <div className={styles.calendarWrap}>
                <DaysRangePicker
                  minDays={1}
                  maxDays={14}
                  initialDays={1}
                  durationLabel="nights"
                  selectedRange={{ startDate: range.startDate, endDate: range.endDate }}
                  onChange={(value) => setRange(value)}
                />
              </div>

              <div className={styles.legendBlock}>
                <div className={styles.legendLabel}>Legend:</div>
                <div className={styles.legendItems}>
                  <span className={`${styles.legendItem} ${styles.legendAvailable}`}>Available</span>
                  <span className={`${styles.legendItem} ${styles.legendNoVacancy}`}>No Vacancy</span>
                  <span className={`${styles.legendItem} ${styles.legendSelected}`}>Selected</span>
                  <span className={`${styles.legendItem} ${styles.legendCheckout}`}>Checkout</span>
                </div>
              </div>

              {errors.submit ? <p className={styles.error}>{errors.submit}</p> : null}
              <button type="submit" className={styles.bookBtn} disabled={isSubmitting}>
                {isSubmitting ? "BOOKING..." : "BOOK NOW"}
              </button>
            </section>
          </Card>

          <Card className={styles.rightCard}>
            <section className={styles.rightPanel}>
              <div className={styles.galleryFrame}>
                {GALLERY_IMAGES.length > 0 ? (
                  <button type="button" className={styles.galleryImageBtn} onClick={() => setIsLightboxOpen(true)}>
                    <img
                      src={GALLERY_IMAGES[activeImage]}
                      alt={`Cabin studio view ${activeImage + 1}`}
                      className={styles.galleryImage}
                    />
                  </button>
                ) : (
                  <div className={styles.galleryFallback}>No gallery images found in src/assets/cabin-gallery.</div>
                )}
                <button type="button" className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => moveImage(-1)}>
                  ‹
                </button>
                <button type="button" className={`${styles.navBtn} ${styles.navNext}`} onClick={() => moveImage(1)}>
                  ›
                </button>
                <div className={styles.slideBadge}>{GALLERY_IMAGES.length > 0 ? activeImage + 1 : 0}/{GALLERY_IMAGES.length || 6}</div>
              </div>

              <div className={styles.dotRow}>
                {GALLERY_IMAGES.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`${styles.dot} ${index === activeImage ? styles.dotActive : ""}`}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Show image ${index + 1}`}
                  />
                ))}
              </div>
            </section>
          </Card>
        </form>

        <section className={styles.infoSection}>
          <h3 className={styles.infoHeading}>About this lodging</h3>
          <p className={styles.infoText}>
            Cabin Studios feature 1 Bedroom with 1 King size bed, sofa sleeper, a full Kitchen with Dining table,
            and full Bathroom with retro decor. Your cabin Studio comes with a TV and DVD for movie night on the
            Lake. Your kitchen will have a refrigerator, microwave, coffee pot, cooktop, and limited dishes and
            utensils usually enough to get you thru a weekend. Your cabin also has bedding and towels (though you
            might want to bring extra towels for the pool and lake excursions).
          </p>
          <p className={styles.infoText}>
            Amenities for lots more fun include ...
            <br />
            Rec Hall including a meeting room, a pool table, and satellite TV.
            <br />
            Wifi
            <br />
            Boat ramp
            <br />
            Lake pier
            <br />
            Lake "beach area"
            <br />
            Crappie Fishing House
            <br />
            General Store &amp; Bait Shop
            <br />
            Swimming Pool
            <br />
            Outdoor games like horse shoes, tether ball, corn hole and and other outdoor fun galore
            <br />
            Outdoor community fire pit and surrounding table and chairs
            <br />
            Tree swing for relaxing during the day or watching the sunset.
          </p>

          <hr className={styles.infoDivider} />

          <h3 className={styles.amenitiesHeading}>Amenities</h3>
          <div className={styles.amenitiesGrid}>
            {AMENITIES.map((amenity) => (
              <div key={amenity} className={styles.amenityItem}>
                <span className={styles.amenityCheck} aria-hidden="true">✓</span>
                <span>{amenity}</span>
              </div>
            ))}
          </div>
        </section>

        {isLightboxOpen && GALLERY_IMAGES.length > 0 ? (
          <div className={styles.lightboxOverlay} onClick={() => setIsLightboxOpen(false)} role="dialog" aria-modal="true">
            <div className={styles.lightboxContent} onClick={(event) => event.stopPropagation()}>
              <img
                src={GALLERY_IMAGES[activeImage]}
                alt={`Cabin studio full image ${activeImage + 1}`}
                className={styles.lightboxImage}
              />
              <button type="button" className={`${styles.navBtn} ${styles.lightboxNavBtn} ${styles.lightboxNavPrev}`} onClick={() => moveImage(-1)}>
                ‹
              </button>
              <button type="button" className={`${styles.navBtn} ${styles.lightboxNavBtn} ${styles.lightboxNavNext}`} onClick={() => moveImage(1)}>
                ›
              </button>
              <button type="button" className={styles.lightboxClose} onClick={() => setIsLightboxOpen(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
