import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import Field from "../../components/Form/Field";
import DaysRangePicker from "../../components/Form/DaysRangePicker";
import styles from "./HeroPage.module.css";

export default function HeroPage() {
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [range, setRange] = useState<{ startDate?: Date; endDate?: Date; days: number }>({ days: 2 });

  const navigate = useNavigate();

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  return (
    <div className={`${styles.hero} chSharedHeroBg`}>
      <div className={styles.heroOverlay} />

      <div className={styles.heroInner}>
        <div className={styles.heroLeft}>
          <Card className={styles.heroCard}>
            <div className={styles.cardBody}>
              <div className={styles.heroRow2}>
                <Field label="# OF ADULTS">
                  <div className={styles.stepperWrap}>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className={`${styles.input} ${styles.stepperInput} noSpinnerInput`}
                      value={adults}
                      onChange={(e) => setAdults(clamp(Number(e.target.value || 1), 1, 5))}
                    />
                    <div className={styles.stepperBtns}>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        aria-label="Decrease adults"
                        onClick={() => setAdults((prev) => clamp(prev - 1, 1, 5))}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        aria-label="Increase adults"
                        onClick={() => setAdults((prev) => clamp(prev + 1, 1, 5))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </Field>

                <Field label="# OF CHILDREN">
                  <div className={styles.stepperWrap}>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      className={`${styles.input} ${styles.stepperInput} noSpinnerInput`}
                      value={children}
                      onChange={(e) => setChildren(clamp(Number(e.target.value || 0), 0, 4))}
                    />
                    <div className={styles.stepperBtns}>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        aria-label="Decrease children"
                        onClick={() => setChildren((prev) => clamp(prev - 1, 0, 4))}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        aria-label="Increase children"
                        onClick={() => setChildren((prev) => clamp(prev + 1, 0, 4))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </Field>
              </div>

              <div className="ch-field">
                <div className={styles.calendarWrapper}>
                  <DaysRangePicker
                    minDays={1}
                    maxDays={14}
                    initialDays={range.days}
                    onChange={setRange}
                  />
                </div>
              </div>
            </div>

            <div className={styles.cardFooter}>

              <button
                className={styles.primaryBtn}
                onClick={() =>
                  navigate("/book", {
                    state: {
                      adults,
                      children,
                      range,
                    },
                  })
                }
              >
                Book Pass
              </button>

              <div>
                <div className={styles.existingText}>Already purchased a day pass?</div>
                <button
                  className={styles.secondaryBtn}
                  onClick={() => navigate("/reservation/find")}
                >
                  View Day Pass
                </button>
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.heroRight}>
          <h1 className={styles.heroTitle}>
            PURCHASE YOUR<br />DAY PASS NOW
          </h1>

          <div className={styles.heroInfo}>
            <div>ADULT DAY PASS $15</div>
            <div>CHILD DAY PASS $10</div>
            <div>12:01am to Midnight (Need New Pass after Midnight)</div>
            <br />
            <div>ALL OVERNIGHT GUESTS STAYING AT THE HI-LINE</div>
            <div>FREE 24/7 access</div>
          </div>
        </div>
      </div>
    </div>
  );
}