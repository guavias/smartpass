import logo from "../../assets/hilineLogo.png";
import styles from "./Footer.module.css";

export default function Footer() {
	return (
		<footer className={styles.footer}>
			<div className={styles.inner}>
				<img src={logo} alt="Hi-Line Resort" className={styles.logo} />

				<div className={styles.details}>
					<p className={styles.line}>1106 Hi-Line • Tow, Texas 78672</p>
					<p className={`${styles.line} ${styles.lightLine}`}>Office Hours: 9am - 5pm</p>
					<p className={`${styles.line} ${styles.lightLine}`}>Tel: (325) 379-1065</p>
				</div>
			</div>
		</footer>
	);
}
