import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import Field from "../../components/Form/Field";
import { createGuestPass } from "../../api/reservations";
import { ApiError } from "../../api/client";
import styles from "./PaymentPage.module.css";

type PaymentNavState = {
  reservationId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
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
const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID as string | undefined;
const SQUARE_ENV = (import.meta.env.VITE_SQUARE_ENV as string | undefined)?.toLowerCase() ?? "sandbox";
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID as string | undefined;
const SQUARE_SCRIPT_URL =
  SQUARE_ENV === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";

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

function createReservationId(): string {
  const stamp = Date.now().toString().slice(-6);
  return `RES-${stamp}`;
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [squareReady, setSquareReady] = useState(false);
  const guestsDropdownRef = useRef<HTMLDivElement | null>(null);
  const squareCardContainerRef = useRef<HTMLDivElement | null>(null);
  const squareCardRef = useRef<any>(null);
  const squareScriptPromiseRef = useRef<Promise<void> | null>(null);

  const nights = Math.max(1, state.nights ?? 1);
  const stayType = state.stayType ?? "Cabin Studio";
  const nightlyRate = state.nightlyRate ?? DEFAULT_RATE;
  const guestName = state.guestName || "Guest";
  const guestEmail = state.guestEmail || "";
  const guestPhone = state.guestPhone || "";

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

  // Load Square Card
  useEffect(() => {
    let cancelled = false;

    async function loadSquareCard() {
      if (!SQUARE_APP_ID) {
        setSquareReady(false);
        return;
      }

      if (!squareScriptPromiseRef.current) {
        squareScriptPromiseRef.current = new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-square-sdk="true"]');
          if (existing) {
            resolve();
            return;
          }

          const script = document.createElement("script");
          script.src = SQUARE_SCRIPT_URL;
          script.async = true;
          script.dataset.squareSdk = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Unable to load Square Web Payments SDK"));
          document.head.appendChild(script);
        });
      }

      try {
        await squareScriptPromiseRef.current;
        if (cancelled) return;

        const square = (window as typeof window & { Square?: any }).Square;
        if (!square) {
          throw new Error("Square SDK not available");
        }

        const payments = square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        const card = await payments.card();
        squareCardRef.current = card;

        if (squareCardContainerRef.current) {
          squareCardContainerRef.current.innerHTML = "";
          await card.attach(squareCardContainerRef.current);
        }

        if (!cancelled) {
          setSquareReady(true);
        }
      } catch (error) {
        if (cancelled) return;
        setSquareReady(false);
        squareCardRef.current = null;
      }
    }

    void loadSquareCard();

    return () => {
      cancelled = true;
      try {
        squareCardRef.current?.destroy?.();
      } catch {
        // ignore cleanup failures
      }
      squareCardRef.current = null;
    };
  }, []);

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

  async function handlePay() {
    const nextErrors: Record<string, string> = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required to complete your booking.";
    }

    if (!phone.trim()) {
      nextErrors.phone = "Phone is required to complete your booking.";
    }

    if (!squareReady) {
      const fallbackDigits = cardNumber.replace(/\D/g, "");
      if (fallbackDigits.length < 12) {
        nextErrors.paymentCard = "Enter a valid card number.";
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        nextErrors.paymentCard = "Enter card expiry as MM/YY.";
      }
      if (cardCvv.length < 3) {
        nextErrors.paymentCard = "Enter a valid CVV.";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      // Generate reservation ID at payment time (only when user submits payment)
      const reservationId = createReservationId();

      let paymentSourceId = "cnon:card-nonce-ok";

      // Tokenize card via Square if available
      if (squareCardRef.current) {
        const tokenResult = await squareCardRef.current.tokenize();
        if (tokenResult.status !== "OK") {
          throw new Error(tokenResult.errors?.[0]?.message ?? "Square tokenization failed");
        }
        paymentSourceId = tokenResult.token;
      }

      // Create guest pass with payment
      const idempotencyKey = `guest-${reservationId}-${Date.now()}`;
      const checkInDate = new Date(state.checkIn || "");
      const checkOutDate = new Date(state.checkOut || "");

      const guest = await createGuestPass({
        name: (firstName || guestName) && (lastName) ? `${firstName} ${lastName}` : (firstName || guestName),
        email: email || guestEmail,
        phone: phone || guestPhone,
        reservation_id: reservationId,
        check_in: checkInDate.toISOString(),
        check_out: checkOutDate.toISOString(),
        num_adults: adults,
        num_children: children,
        pets,
        payment_amount: pricing.total,
        payment_tax: pricing.tax,
        payment_method: "card",
        payment_source_id: paymentSourceId,
        idempotency_key: idempotencyKey,
      });

      // Success - navigate to confirmation with reservation ID
      navigate("/overnight-confirmation", {
        state: {
          reservationId,
          passId: guest.id,
          firstName: firstName || guestName.split(" ")[0] || "",
          lastName: lastName || guestName.split(" ").slice(1).join(" ") || "",
          email: email || guestEmail,
          phone: phone || guestPhone,
          preferredContact,
          adults: state.adults || 1,
          children: state.children || 0,
          pets: state.pets || 0,
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
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : "Unable to complete your booking. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Complete Your Booking</h1>
        <p className={styles.subtitle}>Enter your details and payment information to confirm your reservation.</p>

        <div className={styles.grid}>
          <Card className={styles.card}>
            <div className={styles.cardHeader}>Booking Details</div>

            <div className={styles.formGrid}>
              <Field label="FIRST NAME">
                <input
                  className={`${styles.input} ${errors.firstName ? styles.inputError : ""}`}
                  placeholder="First Name"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: "" }));
                  }}
                />
                {errors.firstName && <div className={styles.fieldError}>{errors.firstName}</div>}
              </Field>

              <Field label="LAST NAME">
                <input
                  className={`${styles.input} ${errors.lastName ? styles.inputError : ""}`}
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: "" }));
                  }}
                />
                {errors.lastName && <div className={styles.fieldError}>{errors.lastName}</div>}
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
                  <input
                    className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                    placeholder="Enter your email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                    }}
                  />
                  {errors.email && <div className={styles.fieldError}>{errors.email}</div>}
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PHONE NUMBER">
                  <input
                    className={`${styles.input} ${errors.phone ? styles.inputError : ""}`}
                    placeholder="xxx-xxx-xxxx"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                    }}
                  />
                  {errors.phone && <div className={styles.fieldError}>{errors.phone}</div>}
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
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => navigate("/overnight-booking")}
                  disabled={isSubmitting}
                >
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

            {submitError && <div className={styles.submitError}>{submitError}</div>}

            <div className={styles.payMethods}>
              {squareReady && <div ref={squareCardContainerRef} id="sq-card-container" className={styles.squareCardContainer} />}

              {!squareReady && (
                <>
                  <button type="button" className={styles.walletBtn}>
                    Apple Pay
                  </button>

                  <button type="button" className={styles.walletBtn}>
                    Google Pay
                  </button>

                  <div className={styles.orLine}>or pay with card</div>

                  <input
                    className={`${styles.input} ${errors.paymentCard ? styles.inputError : ""}`}
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
                  {errors.paymentCard && <div className={styles.fieldError}>{errors.paymentCard}</div>}
                </>
              )}

              <button
                type="button"
                className={styles.payBtn}
                onClick={handlePay}
                disabled={isSubmitting}
              >
                {isSubmitting ? "PROCESSING..." : `Pay ${money(pricing.total)}`}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
