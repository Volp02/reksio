import styles from './loadingSpinner.module.scss'
import { useMascot } from '../../mascot'
import { useTranslation } from 'react-i18next'

export default function LoadingSpinner({ message }: { message?: string }) {
    const { t } = useTranslation()
    const { mascot } = useMascot()
    return (
        <div className={styles.wrap}>
            <img src={mascot.src} alt={t('common.loading')} className={styles.spinner} />
            {message && <span className={styles.message}>{message}</span>}
        </div>
    )
}
