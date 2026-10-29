import styles from './loading.module.scss'
import LoadingSpinner from '../../components/loadingSpinner/loadingSpinner'

export default function Loading({ message }: { message?: string }) {
    return (
        <div className={styles.loading}>
            <LoadingSpinner message={message} />
        </div>
    )
}