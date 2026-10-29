import styles from './spinner.module.scss'

interface SpinnerProps {
    message?: string
    size?: 'small' | 'medium' | 'large'
    position?: 'fixed' | 'absolute' | 'inline'
}

export default function Spinner({ message, size = 'small', position = 'fixed' }: SpinnerProps) {
    return (
        <div className={`${styles.spinnerContainer} ${styles[size]} ${styles[position]}`}>
            <div className={styles.spinner}>
                <div className={styles.spinnerRing}></div>
            </div>
            {message && <p className={styles.message}>{message}</p>}
        </div>
    )
}

