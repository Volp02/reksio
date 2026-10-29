import { useTranslation } from 'react-i18next'
import type { QuickRobotInfo } from '../../types'
import EmptyState from './emptyState'
import styles from './emptyState.module.scss'

export default function RobotsOffline({ robots }: { robots: QuickRobotInfo }) {
    const { t } = useTranslation()
    return (
        <EmptyState title={t('require.allRobotsOffline')} subtitle={t('require.allRobotsOfflineInfo')}>
            <ul className={styles.robots}>
                {Object.entries(robots).map(([serial, info]) => (
                    <li key={serial} className={styles.robot}>
                        <span className={styles.offlineDot} />
                        {info.name}
                    </li>
                ))}
            </ul>
        </EmptyState>
    )
}
