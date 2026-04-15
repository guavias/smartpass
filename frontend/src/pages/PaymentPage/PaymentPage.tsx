import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import Field from "../../components/Form/Field";
import styles from "./PaymentPage.module.css";

type PaymentNavState = {
  adults?: number;
  children?: number;
  pets?: number;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  stayType?: string;
  nightlyRate?: number;
  subtotal?: number;
  tax?: number;
  total?: number;
};

const DEFAULT_RATE = 145;
const TAX_RATE = 0.0825;

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(value?: string) {
  if (!value) return "Not selected";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not selected";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function formatCardNumberInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiryInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCvvInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as PaymentNavState | null) ?? {};

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"Email" | "Phone">("Email");
  const [adults, setAdults] = useState(Math.max(0, state.adults ?? 1));
  const [children, setChildren] = useState(Math.max(0, state.children ?? 0));
  const [pets, setPets] = useState(Math.max(0, state.pets ?? 0));
  const [isGuestsOpen, setIsGuestsOpen] = useState(false);
  const [draftAdults, setDraftAdults] = useState(adults);
  const [draftChildren, setDraftChildren] = useState(children);
  const [draftPets, setDraftPets] = useState(pets);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const guestsDropdownRef = useRef<HTMLDivElement | null>(null);

  const nights = Math.max(1, state.nights ?? 1);
  const stayType = state.stayType ?? "Cabin Studio";
  const nightlyRate = state.nightlyRate ?? DEFAULT_RATE;

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

  function openGuestsDropdown() {
    setDraftAdults(adults);
    setDraftChildren(children);
    setDraftPets(pets);
    setIsGuestsOpen(true);
  }

  function applyGuestSelection() {
    setAdults(Math.max(0, draftAdults));
    setChildren(Math.max(0, draftChildren));
    setPets(Math.max(0, draftPets));
    setIsGuestsOpen(false);
  }

  const pricing = useMemo(() => {
    const subtotal = state.subtotal ?? nightlyRate * nights;
    const tax = state.tax ?? +(subtotal * TAX_RATE).toFixed(2);
    const total = state.total ?? +(subtotal + tax).toFixed(2);
    return { subtotal, tax, total };
  }, [nightlyRate, nights, state.subtotal, state.tax, state.total]);

  function handlePay() {
    navigate("/demo/booking-confirmation", {
      state: {
        firstName,
        lastName,
        email,
        phone,
        preferredContact,
        adults,
        children,
        pets,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        nights,
        stayType,
        nightlyRate,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        total: pricing.total,
      },
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Complete Your Booking</h1>
        <p className={styles.subtitle}>This mirrors the day pass checkout layout for overnight stays.</p>

        <div className={styles.grid}>
          <Card className={styles.card}>
            <div className={styles.cardHeader}>Booking Details</div>

            <div className={styles.formGrid}>
              <Field label="FIRST NAME">
                <input className={styles.input} placeholder="First Name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </Field>

              <Field label="LAST NAME">
                <input className={styles.input} placeholder="Last Name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </Field>

              <div className={styles.fullRow}>
                <Field label="GUESTS">
                  <div className={styles.guestsControl} ref={guestsDropdownRef}>
                    <button
                      type="button"
                      className={styles.fieldInputButton}
                      onClick={openGuestsDropdown}
                    >
                      {adults} Adults, {children} Children, {pets} Pets
                    </button>

                    {isGuestsOpen ? (
                      <div className={styles.guestsDropdown}>
                        <div className={styles.guestRow}>
                          <span>Adults</span>
                          <div className={styles.counterControls}>
                            <button type="button" onClick={() => setDraftAdults((prev) => Math.max(0, prev - 1))}>-</button>
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
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="EMAIL">
                  <input className={styles.input} placeholder="Enter your email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PHONE NUMBER">
                  <input className={styles.input} placeholder="xxx-xxx-xxxx" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PREFERRED CONTACT METHOD">
                  <select className={styles.input} value={preferredContact} onChange={(event) => setPreferredContact(event.target.value as "Email" | "Phone")}>
                    <option value="Email">Email</option>
                    <option value="Phone">Phone</option>
                  </select>
                </Field>
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.backBtn} onClick={() => navigate("/demo/overnight-booking")}>
                  Back
                </button>
              </div>
            </div>
          </Card>

          <Card className={styles.card}>
            <div className={styles.payHeader}>
              <div className={styles.payTitle}>Payment</div>
              <div className={styles.payTotal}>Total: {money(pricing.total)} USD</div>
            </div>

            <details className={styles.breakdown} open>
              <summary className={styles.breakdownSummary}>Booking Summary</summary>
              <div className={styles.breakdownBox}>
                <ul className={styles.summaryList}>
                  <li>Guests: Adults: {adults}, Children: {children}, Pets: {pets}</li>
                  <li>Dates: {formatDate(state.checkIn)} - {formatDate(state.checkOut)}</li>
                  <li>Nights: {nights}</li>
                  <li>Type of Stay: {stayType}</li>
                </ul>
              </div>
            </details>

            <details className={styles.breakdown} open>
              <summary className={styles.breakdownSummary}>Price Breakdown</summary>
              <div className={styles.breakdownBox}>
                <p className={styles.breakdownSectionTitle}>Cabin Studio Charges</p>
                <div className={styles.breakdownRow}>
                  <span>
                    {stayType} ({money(nightlyRate)} x {nights} {nights === 1 ? "night" : "nights"})
                  </span>
                  <span>{money(pricing.subtotal)}</span>
                </div>
                <div className={styles.breakdownRow}>
                  <span>Tax (TX 8.25%)</span>
                  <span>{money(pricing.tax)}</span>
                </div>
                <div className={styles.divider} />
                <div className={styles.breakdownTotal}>
                  <span>Total</span>
                  <span>{money(pricing.total)}</span>
                </div>
              </div>
            </details>

            <div className={styles.payMethods}>
              <button type="button" className={styles.walletBtn}>
                Apple Pay
              </button>

              <button type="button" className={styles.walletBtn}>
                Google Pay
              </button>

              <div className={styles.orLine}>or pay with card</div>

              <input
                className={styles.input}
                value={cardNumber}
                onChange={(event) => setCardNumber(formatCardNumberInput(event.target.value))}
                placeholder="Card Number"
                inputMode="numeric"
              />

              <div className={styles.cardRow}>
                <input
                  className={styles.input}
                  value={cardExpiry}
                  onChange={(event) => setCardExpiry(formatExpiryInput(event.target.value))}
                  placeholder="MM/YY"
                  inputMode="numeric"
                />
                <input
                  className={styles.input}
                  value={cardCvv}
                  onChange={(event) => setCardCvv(formatCvvInput(event.target.value))}
                  placeholder="CVV"
                  inputMode="numeric"
                />
              </div>

              <button type="button" className={styles.payBtn} onClick={handlePay}>
                Pay {money(pricing.total)}
              </button>
              <div className={styles.payFinePrint}>
                Overnight payment checkout is in progress. This screen mirrors the day pass payment layout.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
